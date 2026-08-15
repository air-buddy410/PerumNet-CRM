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

  // NIK memuat tanggal lahir pada enam digit tengahnya. Bila keduanya diisi
  // dan berselisih, yang DITOLAK adalah penyimpanannya — bukan salah satunya
  // dipilih diam-diam. Di form, orang yang mengetik bisa langsung melihat
  // mana yang keliru; menebak untuknya justru menyembunyikan salah ketik.
  const nik = identityNumber?.replace(/\s/g, "") || null;
  const lahirKetik = birthDate ? new Date(birthDate) : null;
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
  await db.customer.update({
    where: { id: customerId },
    data: {
      name: d.name,
      company: d.company || null,
      phone: d.phone,
      email: d.email || null,
      address: d.address,
      customerType: d.customerType,
      areaId: d.areaId || null,
      salesOwnerId: d.salesOwnerId || null,
      status: d.status,
      notes: d.notes || null,
      identityNumber: nik,
      // Tanggal lahir diambil dari NIK bila ada — di situlah ia paling bisa
      // dipercaya. Ketikan hanya dipakai ketika NIK-nya kosong.
      birthDate: lahirNik ?? lahirKetik,
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
