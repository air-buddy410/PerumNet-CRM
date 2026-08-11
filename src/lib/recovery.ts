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
  return slaPhase(recovery, now) === "BREACHED";
}

// ── Fase SLA penarikan (PRD §14) ────────────────────────────────
// PRD menuntut peringatan H-1 DAN peringatan saat batas terlewat. Keduanya
// dibedakan karena penerimanya berbeda: H-1 masih urusan teknisi dan
// koordinator supaya sempat dikejar; yang sudah lewat baru urusan pemegang
// izin eskalasi.

/** Berapa lama sebelum batas SLA peringatan pertama dibunyikan. */
export const SLA_WARNING_HOURS = 24;

export type SlaPhase = "OK" | "DUE_SOON" | "BREACHED";

export function slaPhase(
  recovery: { status: string; slaDueAt: Date | null },
  now: Date,
  warningHours: number = SLA_WARNING_HOURS
): SlaPhase {
  if (!recovery.slaDueAt) return "OK";
  if (["COMPLETED", "CLOSED_UNRECOVERED"].includes(recovery.status)) return "OK";
  if (recovery.slaDueAt <= now) return "BREACHED";
  const warnAt = new Date(recovery.slaDueAt.getTime() - warningHours * 60 * 60 * 1000);
  return now >= warnAt ? "DUE_SOON" : "OK";
}

// ── Koordinat kunjungan (Fase 33, PRD §9.2 FR-PICK-006) ─────────
// Koordinat dipakai untuk membuktikan teknisi benar-benar mendatangi lokasi.
// Karena itu nilai yang jelas mustahil harus ditolak, bukan disimpan apa
// adanya — titik di tengah samudra atau (0,0) dari GPS yang gagal justru
// merusak nilai pembuktiannya.

export interface Coordinate {
  latitude: number;
  longitude: number;
}

/** Alasan penolakan koordinat, atau null bila masuk akal. */
export function coordinateRejection(c: Partial<Coordinate>): string | null {
  const { latitude: lat, longitude: lng } = c;
  if (lat === undefined || lng === undefined || lat === null || lng === null) return null; // opsional
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return "Koordinat tidak berupa angka yang sah.";
  }
  if (lat < -90 || lat > 90) return "Lintang harus antara -90 dan 90.";
  if (lng < -180 || lng > 180) return "Bujur harus antara -180 dan 180.";
  if (lat === 0 && lng === 0) {
    // Titik nol adalah keluaran khas GPS yang gagal mengunci, bukan lokasi
    // yang mungkin untuk pelanggan di Indonesia.
    return "Koordinat (0,0) menandakan GPS gagal mengunci — ulangi pengambilan lokasi.";
  }
  return null;
}

// ── Siapa boleh melihat sebuah penarikan (Fase 40) ──────────────
// Modul MURNI.
//
// §9.2 FR-PICK-002: teknisi hanya melihat penarikan yang ditugaskan
// kepadanya. Aturan itu TIDAK boleh hidup di halaman — PRD §12 menyatakannya
// terang-terangan: "menyembunyikan tombol di UI saja tidak cukup". Menyaring
// daftar tetapi membiarkan halaman detail terbuka berarti siapa pun yang tahu
// id-nya bisa membaca nama, alamat, dan nomor telepon pelanggan yang bukan
// urusannya.

/** Izin yang menandakan peran KOORDINASI — melihat seluruh penarikan. */
export const RECOVERY_COORDINATION_PERMISSIONS = [
  "device_recovery.assign",
  "device_recovery.receive",
  "device_recovery.inspect",
  "device_recovery.escalate",
  "device_recovery.dispose",
] as const;

export interface RecoveryViewer {
  id: string;
  permissions: Set<string>;
}

export interface RecoveryAssignment {
  assigneeId: string | null;
  workOrderTechnicianId: string | null;
}

/** Apakah pemakai ini berperan koordinasi (gudang, koordinator, management)? */
export function isRecoveryCoordinator(viewer: RecoveryViewer): boolean {
  return RECOVERY_COORDINATION_PERMISSIONS.some((p) => viewer.permissions.has(p));
}

/**
 * Boleh atau tidak melihat penarikan tertentu.
 *
 * Aturannya sengaja sesempit mungkin supaya tidak ada yang kehilangan akses
 * tanpa alasan: yang berubah HANYA teknisi murni — pemegang izin pickup yang
 * tidak memegang satu pun izin koordinasi. Dia kini terbatas pada tugasnya
 * sendiri. Peran lain tetap seperti sebelumnya.
 */
export function canViewRecovery(
  viewer: RecoveryViewer,
  recovery: RecoveryAssignment
): boolean {
  if (isRecoveryCoordinator(viewer)) return true;
  if (viewer.permissions.has("device_recovery.pickup")) {
    return (
      recovery.assigneeId === viewer.id ||
      recovery.workOrderTechnicianId === viewer.id
    );
  }
  // Bukan teknisi dan bukan koordinator — perlakukan seperti sebelumnya,
  // yaitu bergantung pada izin melihat inventory di lapisan halaman.
  return true;
}
