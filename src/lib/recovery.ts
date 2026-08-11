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

// ── Vonis "Tidak Kembali" (Fase 32, PRD §13.10) ─────────────────
// Menyatakan sebuah perangkat tidak kembali berarti menutup kasus dan
// membebankan kerugiannya. Karena itu tidak boleh dilakukan hanya karena
// petugas kehabisan kesabaran: SLA harus benar-benar terlewat DAN sudah ada
// sekian kali percobaan yang tercatat. Keduanya wajib, bukan salah satu.

export interface NotReturnedCheck {
  slaDueAt: Date | null;
  attempts: number;
  minAttempts: number;
  now: Date;
}

/** Alasan penolakan, atau null bila vonis boleh dijatuhkan. */
export function notReturnedBlocker(c: NotReturnedCheck): string | null {
  if (!c.slaDueAt) {
    return "Penarikan ini tidak memiliki batas SLA — tidak bisa dieskalasi.";
  }
  if (c.slaDueAt > c.now) {
    return `Batas SLA belum terlewat (${c.slaDueAt.toLocaleDateString("id-ID")}).`;
  }
  if (c.attempts < c.minAttempts) {
    return `Baru ${c.attempts} kali percobaan penarikan; minimal ${c.minAttempts} kali.`;
  }
  return null;
}

export function canDeclareNotReturned(c: NotReturnedCheck): boolean {
  return notReturnedBlocker(c) === null;
}

/** Sudah lewat SLA dan belum selesai — dasar daftar eskalasi & notifikasi. */
export function isOverdue(
  recovery: { status: string; slaDueAt: Date | null },
  now: Date
): boolean {
  if (!recovery.slaDueAt) return false;
  if (["COMPLETED", "CLOSED_UNRECOVERED"].includes(recovery.status)) return false;
  return recovery.slaDueAt <= now;
}
