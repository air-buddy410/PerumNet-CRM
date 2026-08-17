"use server";

// ── Server Action portal pelanggan (Fase 87) ────────────────────
//
// Satu-satunya jalur tulis yang boleh disentuh pelanggan, dan sengaja tipis:
// ia memeriksa bentuk masukan lalu menyerahkannya ke `portal-service.ts`.
// Seluruh aturannya — pembatasan percobaan, jawaban seragam, penolakan laporan
// kembar — ada di sana dan sudah diuji.
//
// TIDAK ADA satu pun aksi di berkas ini yang menyentuh jaringan, tagihan, atau
// data pelanggan lain. Portal boleh membaca miliknya sendiri dan membuka satu
// tiket; itu saja.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { masukPortal, keluarPortal, laporGangguan, pelangganSekarang } from "@/lib/portal-service";

export type AksiPortal = { ok: true } | { ok: false; error: string };

export async function masukPortalAction(
  _sebelumnya: AksiPortal | null,
  formData: FormData
): Promise<AksiPortal> {
  const nomor = String(formData.get("nomorLayanan") ?? "");
  const sandi = String(formData.get("sandi") ?? "");
  // Bentuk kosong dijawab dengan kalimat yang sama seperti kegagalan lain —
  // membedakannya memberi tahu penebak bahwa formulirnya sudah lolos.
  if (!nomor || !sandi) {
    return { ok: false, error: "Nomor layanan atau kata sandi salah. Periksa kembali, atau hubungi kami bila lupa." };
  }
  const hasil = await masukPortal(nomor, sandi);
  if (!hasil.ok) return hasil;
  redirect("/pelanggan");
}

export async function keluarPortalAction(): Promise<void> {
  await keluarPortal();
  redirect("/pelanggan/login");
}

export async function laporGangguanAction(
  _sebelumnya: AksiPortal | null,
  formData: FormData
): Promise<AksiPortal> {
  // Pemilik laporan diambil dari SESI, tidak pernah dari formulir. Menerima
  // id pelanggan dari browser berarti siapa pun bisa membuka tiket atas nama
  // orang lain hanya dengan mengubah satu bidang tersembunyi.
  const p = await pelangganSekarang();
  if (!p) return { ok: false, error: "Sesi Anda sudah berakhir. Masuk kembali." };

  const hasil = await laporGangguan(
    p.customerId,
    String(formData.get("judul") ?? ""),
    String(formData.get("isi") ?? "")
  );
  if (!hasil.ok) return hasil;
  // Beranda menampilkan jumlah tiket terbuka, dan angka itu langsung berubah
  // oleh laporan ini. Tanpa penyegaran, pelanggan menekan kirim lalu melihat
  // angka lama — dan menyimpulkan laporannya tidak masuk.
  revalidatePath("/pelanggan");
  return { ok: true };
}
