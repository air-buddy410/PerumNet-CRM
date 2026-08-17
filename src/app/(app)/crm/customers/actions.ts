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
import { simpanBerkasPelanggan } from "@/lib/customer-dossier-service";
import { BERKAS_PII } from "@/lib/customer-dossier";
import { aturSandiPortal, keluarkanSemuaPerangkat } from "@/lib/portal-service";
import { bacaDayaOnu } from "@/lib/onu-optical-service";
import { bolehMintaReboot, AKSI_REBOOT_ONU, PESAN_ANTRE } from "@/lib/onu-reboot";

export type AksiBerkas = { ok: true } | { ok: false; error: string };

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

// ── Fase 86–87: berkas pelanggan & akun portal ──────────────────

/**
 * Mengunggah satu berkas pelanggan.
 *
 * Seluruh pemeriksaan isi berkas — ukuran, MIME dipasangkan dengan extension,
 * magic-byte dicocokkan dengan MIME yang diakui — dikerjakan `saveAttachment`
 * lewat `simpanBerkasPelanggan`. Yang ditambahkan di sini penjaga izin, dan
 * ia BERBEDA menurut jenisnya: scan kartu identitas menuntut izin PII,
 * selebihnya cukup izin menyunting pelanggan.
 */
export async function unggahBerkasPelangganAction(formData: FormData): Promise<AksiBerkas> {
  const user = await requirePermission(PERMISSIONS.CUSTOMERS_EDIT);
  const customerId = String(formData.get("customerId") ?? "");
  const jenis = String(formData.get("jenis") ?? "");
  const file = formData.get("file");

  if (!customerId) return { ok: false, error: "Pelanggan tidak disebutkan." };
  if (!(file instanceof File)) return { ok: false, error: "Berkas tidak terkirim." };

  if (BERKAS_PII.has(jenis) && !user.permissions.has(PERMISSIONS.CUSTOMERS_PII_VIEW)) {
    // Yang tidak boleh MELIHAT scan identitas juga tidak boleh menaruhnya:
    // mengunggah tanpa bisa memeriksa ulang berarti menaruh sesuatu yang tidak
    // bisa dipertanggungjawabkan sendiri.
    return { ok: false, error: "Mengunggah kartu identitas menuntut izin data pribadi." };
  }

  const hasil = await simpanBerkasPelanggan(customerId, jenis, file, user.id);
  if (!hasil.ok) return hasil;
  revalidatePath(`/crm/customers/${customerId}`);
  return { ok: true };
}

/** Padanan "Reset Password Portal Customer" pada sistem lama. */
export async function aturSandiPortalAction(formData: FormData): Promise<AksiBerkas> {
  const user = await requirePermission(PERMISSIONS.CUSTOMERS_EDIT);
  const customerId = String(formData.get("customerId") ?? "");
  const sandi = String(formData.get("sandi") ?? "");
  const konfirmasi = String(formData.get("konfirmasiSandi") ?? "");
  if (!customerId) return { ok: false, error: "Pelanggan tidak disebutkan." };

  // Konfirmasi diperiksa DI SINI juga, bukan hanya di layar. Pemeriksaan yang
  // cuma ada di peramban bisa dilewati — dan akibatnya bukan celah keamanan
  // melainkan sesuatu yang lebih senyap: sandi salah ketik tersimpan, staf
  // mengira sudah benar, dan pelanggan tidak bisa masuk tanpa siapa pun tahu
  // sebabnya. Bidangnya opsional supaya pemanggil lain tidak ikut terikat.
  if (konfirmasi && sandi !== konfirmasi) {
    return { ok: false, error: "Konfirmasi kata sandi belum sama." };
  }

  const hasil = await aturSandiPortal(customerId, sandi, user.id);
  if (!hasil.ok) return hasil;
  revalidatePath(`/crm/customers/${customerId}`);
  return { ok: true };
}

/** Padanan "Logout Aplikasi Mobile" pada sistem lama. */
export async function keluarkanSemuaPerangkatAction(formData: FormData): Promise<AksiBerkas> {
  const user = await requirePermission(PERMISSIONS.CUSTOMERS_EDIT);
  const customerId = String(formData.get("customerId") ?? "");
  if (!customerId) return { ok: false, error: "Pelanggan tidak disebutkan." };

  await keluarkanSemuaPerangkat(customerId, user.id);
  revalidatePath(`/crm/customers/${customerId}`);
  return { ok: true };
}

/**
 * Membaca daya optik ONU seorang pelanggan, langsung dari OLT-nya (Fase 88b).
 *
 * SATU klik = SATU SNMP GET — tidak ada penyapuan massal. Hanya membaca;
 * aksi tulis ke perangkat tetap terlarang sampai cutover.
 */
export async function bacaDayaOnuAction(formData: FormData) {
  await requirePermission(PERMISSIONS.CUSTOMERS_VIEW);
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  if (!subscriptionId) {
    return { ok: false as const, sebab: "GALAT" as const, pesan: "Langganan tidak disebutkan." };
  }
  return bacaDayaOnu(subscriptionId);
}

/**
 * Meminta reboot ONU pelanggan — DIANTREKAN, tidak dieksekusi (Fase 88b).
 *
 * Menulis satu baris NetworkAccessJob berstatus QUEUED ke basis data KITA, dan
 * berhenti di situ. Tidak ada yang menyentuh perangkat: antrean ini tanpa
 * eksekutor, dan eksekusinya menunggu cutover. Meniru tombol reboot ALUS tanpa
 * melanggar mode baca-saja.
 */
export async function mintaRebootOnuAction(formData: FormData) {
  const user = await requirePermission(PERMISSIONS.CTICKETS_VIEW);
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  if (!subscriptionId) return { ok: false as const, error: "Langganan tidak disebutkan." };

  const sub = await db.subscription.findUnique({
    where: { id: subscriptionId },
    select: {
      serviceNumber: true,
      onuPosition: true,
      odpPort: {
        select: {
          odp: { select: { ponPort: { select: { olt: { select: { networkDeviceId: true } } } } } },
        },
      },
    },
  });
  if (!sub) return { ok: false as const, error: "Langganan tidak ditemukan." };

  const antreanAda = await db.networkAccessJob.findFirst({
    where: { subscriptionId, action: AKSI_REBOOT_ONU, status: "QUEUED" },
    select: { id: true },
  });

  const izin = bolehMintaReboot({
    adaPosisiOnu: Boolean(sub.onuPosition?.trim()),
    sudahAdaAntrean: Boolean(antreanAda),
  });
  if (!izin.boleh) return { ok: false as const, error: izin.alasan };

  await db.networkAccessJob.create({
    data: {
      subscriptionId,
      // Perangkatnya OLT-nya, bukan router. Null bila ODP belum tertaut.
      routerId: sub.odpPort?.odp.ponPort?.olt.networkDeviceId ?? null,
      action: AKSI_REBOOT_ONU,
      // payload menyimpan posisinya apa adanya — yang kelak diketik eksekutor.
      payload: JSON.stringify({ onuPosition: sub.onuPosition, diminta: "reboot" }),
      status: "QUEUED",
    },
  });

  await logAudit({
    userId: user.id,
    action: "ONU_REBOOT_ENQUEUE",
    module: "noc",
    entityType: "Subscription",
    entityId: subscriptionId,
    description:
      `Permintaan reboot ONU ${sub.serviceNumber} (${sub.onuPosition ?? "-"}) diantrekan. ` +
      `TIDAK dieksekusi — menunggu cutover.`,
  });

  return { ok: true as const, pesan: PESAN_ANTRE };
}
