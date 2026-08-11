// ── Kelayakan Recovery Perangkat (Fase 28) ──────────────────────
// Modul MURNI: tidak menyentuh database, supaya aturan yang paling
// berkonsekuensi di modul terminasi — "perangkat mana yang boleh ditarik
// dari rumah pelanggan" — bisa diuji langsung tanpa DB.
//
// Aturan berasal dari PRD terminasi §13.1:
//  - Hanya perangkat milik PERUMNET (ownership COMPANY) yang boleh ditarik.
//    Perangkat milik pelanggan TIDAK BOLEH masuk daftar penarikan sama sekali.
//  - Perangkat yang sudah berstatus final (hilang / dimusnahkan) tidak ada
//    wujudnya untuk ditarik.

/** Status yang membuat perangkat tidak lagi bisa ditarik secara fisik. */
export const RECOVERY_TERMINAL_STATUSES = ["LOST", "SCRAPPED"] as const;

export interface RecoveryCandidate {
  ownership: string;
  status: string;
}

/**
 * Apakah perangkat boleh masuk daftar penarikan saat pelanggan terminasi?
 * Dipakai sebagai sumber kebenaran tunggal — `recoverableDevicesOf()` di
 * inventory.ts menyusun query-nya dari konstanta yang sama.
 */
export function isRecoverable(device: RecoveryCandidate): boolean {
  if (device.ownership !== "COMPANY") return false;
  return !(RECOVERY_TERMINAL_STATUSES as readonly string[]).includes(device.status);
}

/**
 * Alasan sebuah perangkat dikecualikan — ditampilkan di UI terminasi supaya
 * petugas tahu kenapa sebuah SN tidak ikut ditarik, bukan sekadar hilang
 * dari daftar.
 */
export function recoveryExclusionReason(device: RecoveryCandidate): string | null {
  if (device.ownership === "CUSTOMER") {
    return "Milik pelanggan — tidak boleh ditarik (PRD §13.1).";
  }
  if (device.ownership !== "COMPANY") {
    return `Kepemilikan "${device.ownership}" tidak dikenal — koreksi dulu sebelum terminasi.`;
  }
  if (device.status === "LOST") return "Sudah tercatat hilang.";
  if (device.status === "SCRAPPED") return "Sudah dimusnahkan.";
  return null;
}
