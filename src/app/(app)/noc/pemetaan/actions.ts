"use server";

// ── Jalur resmi halaman Impor Pemetaan (Fase 79) ────────────────
//
// Halaman TIDAK BOLEH memanggil `src/lib/pemetaan-import-service` langsung.
// Berkas ini yang menjadi satu-satunya pintunya, dan alasannya bukan gaya:
// izin, batas ukuran, dan pembacaan xlsx diperiksa di sini. Melewatinya
// berarti melewati ketiganya sekaligus.
//
// Keduanya MENGEMBALIKAN nilai, tidak redirect — hasil pratinjau adalah tabel
// yang harus dibaca orang dulu, sama seperti Impor Katalog dan Impor Pelanggan.

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-rules";
import { readAllSheetRows, XlsxError } from "@/lib/xlsx-read";
import { periksaPemetaan, terapkanPemetaan, type HasilPemetaan } from "@/lib/pemetaan-import-service";

export type HasilAksi =
  | { ok: true; data: HasilPemetaan }
  | { ok: false; error: string };

/**
 * Berkas menjadi lembar.
 *
 * Nama lembar ikut dibawa apa adanya supaya pesan masalah bisa menyebut
 * "Lembar 2 baris 47" alih-alih nomor baris tanpa konteks.
 */
async function bacaBerkas(file: File | null): Promise<
  { ok: true; lembar: { nama: string; baris: string[][] }[] } | { ok: false; error: string }
> {
  if (!file || file.size === 0) return { ok: false, error: "Berkas belum dipilih atau kosong." };
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `Berkas terlalu besar (maksimal ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB).`,
    };
  }
  if (!/\.xlsx$/i.test(file.name)) {
    return { ok: false, error: "Berkas harus .xlsx. Format .xls lama tidak didukung — simpan ulang sebagai .xlsx." };
  }
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    return {
      ok: true,
      lembar: readAllSheetRows(buf).map((baris, i) => ({ nama: `Lembar ${i + 1}`, baris })),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof XlsxError ? e.message : `Berkas tidak terbaca: ${(e as Error).message}`,
    };
  }
}

/** Memeriksa berkas tanpa mengubah apa pun. */
export async function previewPemetaanAction(formData: FormData): Promise<HasilAksi> {
  await requirePermission(PERMISSIONS.FTTH_MANAGE);
  const berkas = await bacaBerkas(formData.get("file") as File | null);
  if (!berkas.ok) return berkas;
  return { ok: true, data: await periksaPemetaan(berkas.lembar) };
}

/**
 * Menerapkan yang berstatus SIAP.
 *
 * Berkasnya diunggah ULANG, bukan hasil pratinjau yang dikirim balik. Itu
 * disengaja dan sama dengan importir lain di aplikasi ini: yang dikirim balik
 * dari browser bisa disunting, dan menerapkan baris yang tidak pernah lewat
 * pemeriksaan adalah jalan masuk yang tidak perlu ada.
 */
export async function applyPemetaanAction(formData: FormData): Promise<HasilAksi> {
  const user = await requirePermission(PERMISSIONS.FTTH_MANAGE);
  const berkas = await bacaBerkas(formData.get("file") as File | null);
  if (!berkas.ok) return berkas;

  const hasil = await terapkanPemetaan(berkas.lembar, user.id);
  revalidatePath("/noc/pemetaan");
  revalidatePath("/noc/ftth");
  revalidatePath("/noc/pppoe");
  return { ok: true, data: hasil };
}
