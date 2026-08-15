"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/constants";
import { previewCustomerImport, applyCustomerImport } from "@/lib/customer-import-service";
import { NIK_RE, birthDateFromNik } from "@/lib/customer-import";
import { bertopeng } from "@/lib/customer-pii";

const schema = z.object({
  customerId: z.string().min(1),
  name: z.string().min(2, "Nama minimal 2 karakter"),
  company: z.string().optional(),
  phone: z.string().min(5, "Telepon wajib diisi"),
  email: z.string().email("Email tidak valid").optional().or(z.literal("")),
  address: z.string().min(5, "Alamat wajib diisi"),
  customerType: z.string().min(1),
  areaId: z.string().optional(),
  salesOwnerId: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]),
  notes: z.string().optional(),
  // Fase 74 — data pribadi. Keduanya opsional: 1.711 pelanggan hasil impor
  // masuk tanpa NIK, dan memaksa mengisinya di sini akan mengunci setiap
  // penyuntingan lain sampai seseorang menebak nomornya.
  identityNumber: z
    .string()
    .optional()
    .refine((v) => !v || NIK_RE.test(v.replace(/\s/g, "")), "NIK harus 16 digit angka"),
  birthDate: z.string().optional(),
});

export async function updateCustomerAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CUSTOMERS_EDIT);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(
      `/crm/customers/${formData.get("customerId")}?error=` +
        encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")
    );
  }
  const { customerId, identityNumber, birthDate, ...d } = parsed.data;
  const bolehPii = user.permissions.has(PERMISSIONS.CUSTOMERS_PII_VIEW);

  // Bidang yang TIDAK dikirim formulir dibiarkan apa adanya, bukan dikosongkan.
  // `undefined` pada Prisma berarti "jangan sentuh"; `null` berarti "hapus".
  // Membedakan keduanya penting sebab tidak semua formulir memuat semua kolom,
  // dan formulir yang lebih pendek tidak boleh menghapus kolom yang tidak
  // ditampilkannya.
  const dikirim = (nama: string) => formData.get(nama) !== null;
  const isiOpsional = (nama: string, nilai: string | undefined): string | null | undefined => {
    if (!dikirim(nama)) return undefined;
    // Topeng yang kembali dari formulir bukan nilai baru. Lihat `bertopeng`.
    if (bertopeng(nilai)) return undefined;
    return nilai || null;
  };

  // NIK memuat tanggal lahir pada enam digit tengahnya. Bila keduanya diisi
  // dan berselisih, yang DITOLAK adalah penyimpanannya — bukan salah satunya
  // dipilih diam-diam. Di form, orang yang mengetik bisa langsung melihat
  // mana yang keliru; menebak untuknya justru menyembunyikan salah ketik.
  //
  // NIK hanya boleh DITULIS oleh yang boleh melihatnya. Tanpa syarat itu,
  // petugas tanpa izin PII menyimpan formulir yang kolom NIK-nya bertopeng —
  // atau kosong karena halaman menyembunyikannya — dan nomor aslinya lenyap.
  const nikMentah = bolehPii ? isiOpsional("identityNumber", identityNumber) : undefined;
  const nik = typeof nikMentah === "string" ? nikMentah.replace(/\s/g, "") : nikMentah;
  const lahirKetik = bolehPii && dikirim("birthDate") && birthDate ? new Date(birthDate) : null;
  const lahirNik = nik ? birthDateFromNik(nik) : null;
  if (lahirKetik && lahirNik && lahirKetik.getTime() !== lahirNik.getTime()) {
    redirect(
      `/crm/customers/${customerId}?error=` +
        encodeURIComponent(
          `Tanggal lahir tidak cocok dengan NIK: NIK memuat ${lahirNik.toISOString().slice(0, 10)}.`
        )
    );
  }
  const before = await db.customer.findUnique({ where: { id: customerId } });
  if (!before) {
    redirect("/crm/customers?error=" + encodeURIComponent("Customer tidak ditemukan."));
  }

  // NIK unik pada skema. Tanpa pemeriksaan ini, dua pelanggan bernomor sama
  // menghasilkan galat Prisma P2002 yang mentah di layar, bukan kalimat yang
  // bisa ditindaklanjuti orang.
  if (nik) {
    const kembar = await db.customer.findFirst({
      where: { identityNumber: nik, NOT: { id: customerId } },
      select: { customerNumber: true, name: true },
    });
    if (kembar) {
      redirect(
        `/crm/customers/${customerId}?error=` +
          encodeURIComponent(`NIK ini sudah dipakai ${kembar.name} (${kembar.customerNumber}).`)
      );
    }
  }

  await db.customer.update({
    where: { id: customerId },
    data: {
      name: d.name,
      company: isiOpsional("company", d.company),
      // Telepon dan email ikut tersamar bagi yang tidak berizin PII, jadi
      // keduanya lewat penjaga yang sama seperti NIK.
      phone: bertopeng(d.phone) ? undefined : d.phone,
      email: isiOpsional("email", d.email),
      address: d.address,
      customerType: d.customerType,
      areaId: isiOpsional("areaId", d.areaId),
      salesOwnerId: isiOpsional("salesOwnerId", d.salesOwnerId),
      status: d.status,
      notes: isiOpsional("notes", d.notes),
      identityNumber: nik,
      // Tanggal lahir diambil dari NIK bila ada — di situlah ia paling bisa
      // dipercaya. Ketikan hanya dipakai ketika NIK-nya kosong.
      birthDate: nik === undefined && !lahirKetik ? undefined : lahirNik ?? lahirKetik,
    },
  });
  await logAudit({
    userId: user.id,
    action: "CUSTOMER_UPDATE",
    module: "customers",
    entityType: "Customer",
    entityId: customerId,
    description: `Mengubah data customer ${before.customerNumber} (${d.name})`,
  });
  revalidatePath("/crm/customers");
  redirect(
    `/crm/customers/${customerId}?ok=` + encodeURIComponent("Data customer tersimpan.")
  );
}

// ── Impor pelanggan & langganan (Fase 68) ───────────────────────
//
// Keduanya MENGEMBALIKAN nilai alih-alih redirect: hasil pratinjau adalah
// tabel yang harus dibaca dulu. Penerapan mengunggah ULANG berkasnya, bukan
// mengirim baris hasil pratinjau.

export async function previewCustomerImportAction(formData: FormData) {
  const user = await requirePermission(PERMISSIONS.CUSTOMERS_CREATE);
  return previewCustomerImport(user, formData.get("file") as File);
}

export async function applyCustomerImportAction(formData: FormData) {
  const user = await requirePermission(PERMISSIONS.CUSTOMERS_CREATE);
  const result = await applyCustomerImport(user, formData.get("file") as File, {
    allowPartial: formData.get("allowPartial") === "1",
  });
  if (result.ok) {
    revalidatePath("/crm/customers");
    revalidatePath("/crm/subscriptions");
    revalidatePath("/noc/ftth");
  }
  return result;
}
