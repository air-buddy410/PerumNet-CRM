// ── Aturan masuk portal pelanggan (Fase 87) ─────────────────────
//
// Lapisan MURNI. Tidak menyentuh basis data, tidak menyentuh cookie.
//
// Portal pelanggan adalah PINTU YANG MENGHADAP LUAR. Berbeda dari aplikasi
// staf yang dipakai belasan orang yang dikenal, pintu ini akan dicoba siapa
// saja, dan nama masuknya bukan rahasia — nomor layanan tercetak di setiap
// tagihan. Karena itu yang menahan penebakan bukan kerahasiaan nama, melainkan
// pembatasan percobaan.
//
// Dua hal yang membentuk berkas ini:
//
//  1. **Password sistem lama TIDAK boleh diwarisi.** Sistem lama menyimpannya
//     terbaca — `perumnet@225` tertulis di layar adminnya, sama untuk banyak
//     orang. Menyalinnya berarti mewarisi kelemahannya sekaligus memberi kesan
//     palsu bahwa akunnya aman. Akun portal dibuat dengan password baru, atau
//     tidak dibuat.
//
//  2. **Jawaban yang sama untuk semua kegagalan.** Nama tak dikenal, password
//     salah, dan akun nonaktif menghasilkan kalimat yang identik. Membedakan
//     ketiganya memberi tahu penebak nomor layanan mana yang punya akun.

/** Berapa kali salah sebelum dikunci sementara. */
export const BATAS_GAGAL = 5;
/** Lama kunci setelah batas terlampaui. */
export const KUNCI_MENIT = 15;

/**
 * Satu kalimat untuk SETIAP kegagalan masuk.
 *
 * Sengaja tidak menyebut apa yang salah. Lihat alasannya di kepala berkas.
 */
export const PESAN_GAGAL =
  "Nomor layanan atau kata sandi salah. Periksa kembali, atau hubungi kami bila lupa.";

export interface KeadaanAkun {
  isActive: boolean;
  failedCount: number;
  lockedUntil: Date | null;
}

export type HasilPeriksa =
  | { boleh: true }
  | { boleh: false; pesan: string; terkunci: boolean };

/**
 * Apakah akun ini boleh mencoba masuk sekarang.
 *
 * Diperiksa SEBELUM password dibandingkan — membandingkan password pada akun
 * yang terkunci hanya membuang waktu dan membocorkan lamanya perbandingan.
 */
export function bolehMencoba(a: KeadaanAkun, sekarang: Date): HasilPeriksa {
  if (!a.isActive) {
    // Tetap kalimat yang sama: akun nonaktif tidak boleh bisa dibedakan dari
    // nomor yang tidak punya akun sama sekali.
    return { boleh: false, pesan: PESAN_GAGAL, terkunci: false };
  }
  if (a.lockedUntil && a.lockedUntil > sekarang) {
    const menit = Math.max(1, Math.ceil((a.lockedUntil.getTime() - sekarang.getTime()) / 60000));
    return {
      boleh: false,
      // Kunci BOLEH disebutkan: orang yang sampai di sini sudah memasukkan
      // nama yang benar berkali-kali, jadi tidak ada yang bocor — dan tanpa
      // penjelasan ini ia akan terus mencoba dan mengira akunnya rusak.
      pesan: `Terlalu banyak percobaan. Coba lagi dalam ${menit} menit.`,
      terkunci: true,
    };
  }
  return { boleh: true };
}

export interface AkibatGagal {
  failedCount: number;
  lockedUntil: Date | null;
}

/** Keadaan akun setelah satu percobaan yang gagal. */
export function setelahGagal(a: KeadaanAkun, sekarang: Date): AkibatGagal {
  // Hitungan direset dulu bila kunci sebelumnya sudah lewat — kalau tidak,
  // akun yang pernah terkunci akan terkunci lagi hanya karena satu salah ketik
  // berbulan-bulan kemudian.
  const dasar = a.lockedUntil && a.lockedUntil <= sekarang ? 0 : a.failedCount;
  const failedCount = dasar + 1;
  if (failedCount < BATAS_GAGAL) return { failedCount, lockedUntil: null };
  return {
    failedCount,
    lockedUntil: new Date(sekarang.getTime() + KUNCI_MENIT * 60_000),
  };
}

/** Keadaan akun setelah berhasil masuk. */
export function setelahBerhasil(): AkibatGagal {
  return { failedCount: 0, lockedUntil: null };
}

// ── Nama masuk ──────────────────────────────────────────────────

/**
 * Merapikan nomor layanan yang diketik pelanggan.
 *
 * Orang mengetiknya dengan spasi, huruf kecil, dan kadang menyalinnya dari
 * tagihan berikut tanda tak terlihat — kekeliruan yang sama sudah menggigit
 * di rekonsiliasi Fase 83.
 */
export function rapikanNamaMasuk(raw: string): string {
  return (raw ?? "")
    .replace(/[​-‏‪-‮﻿]/g, "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

/**
 * Apakah kata sandi baru cukup kuat.
 *
 * Sengaja sederhana dan tidak menuntut simbol: aturan yang rumit membuat orang
 * menuliskannya di kertas yang ditempel di modem. Panjang minimum lebih
 * menolong daripada tuntutan huruf besar.
 */
export function sandiLemah(sandi: string): string | null {
  const s = sandi ?? "";
  if (s.length < 8) return "Kata sandi minimal 8 karakter.";
  if (/^\d+$/.test(s)) return "Kata sandi tidak boleh hanya angka.";
  return null;
}
