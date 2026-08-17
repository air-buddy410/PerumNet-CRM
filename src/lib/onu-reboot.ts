// ── Permintaan reboot ONU — ANTRE, tidak dieksekusi (Fase 88b) ──
//
// Lapisan MURNI. Tidak menyentuh jaringan, dan itu seluruh maksudnya.
//
// ALUS punya tombol reboot yang langsung memutus-nyalakan ONU pelanggan.
// Menirunya dituntut pemilik, tetapi mode baca-saja yang ia tetapkan sendiri
// melarang menulis ke jaringan. Keduanya didamaikan dengan cara yang sama
// seperti penagihan dan isolir: tombolnya ADA, tetapi yang dihasilkannya
// hanya satu baris di basis data KITA — sebuah NIAT yang antre, bukan perintah
// yang jalan.
//
// TIDAK ADA EKSEKUTOR. Antrean ini tidak punya pekerja yang menyalakannya;
// membangun pekerja itu adalah tugas cutover yang sadar, bukan efek samping.
// Dan seandainya suatu hari ada yang mencoba menyambungkannya lewat konsol
// OLT, daftar putih baca-saja di `olt-telnet.ts` menolak `reboot` sebelum
// perintahnya menyentuh soket. Dua lapis, bukan satu janji.

/** Nilai action untuk NetworkAccessJob. String bebas, jadi tanpa migrasi. */
export const AKSI_REBOOT_ONU = "ONU_REBOOT";

export type StatusReboot =
  | { boleh: true }
  | { boleh: false; alasan: string };

/**
 * Apakah permintaan reboot boleh diantrekan untuk sebuah langganan.
 *
 * Yang diperiksa bukan izin menekan tombol — itu urusan RBAC di actionnya —
 * melainkan apakah permintaannya masuk akal: ada ONU-nya, dan belum ada
 * permintaan serupa yang masih menggantung.
 */
export function bolehMintaReboot(a: {
  adaPosisiOnu: boolean;
  sudahAdaAntrean: boolean;
}): StatusReboot {
  if (!a.adaPosisiOnu) {
    return { boleh: false, alasan: "Pelanggan ini belum punya posisi ONU, jadi tidak ada yang bisa direboot." };
  }
  if (a.sudahAdaAntrean) {
    return { boleh: false, alasan: "Permintaan reboot sebelumnya masih dalam antrean." };
  }
  return { boleh: true };
}

/** Kalimat yang ditampilkan setelah permintaan masuk antrean. */
export const PESAN_ANTRE =
  "Permintaan reboot dicatat dan masuk antrean. Ia BELUM dijalankan — eksekusi ke " +
  "perangkat menunggu cutover, saat mode baca-saja diakhiri. Tidak ada ONU yang " +
  "tersentuh oleh tombol ini sekarang.";
