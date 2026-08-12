// ── Siklus Kepegawaian & Pembekuan Akun (Fase 41–42) ────────────
// Modul MURNI: tidak menyentuh database.
//
// Alasannya sama seperti recovery.ts — aturan di sini menentukan kapan akun
// seseorang berhenti bisa dipakai. Itu terlalu berkonsekuensi untuk hanya
// diuji lewat jalur yang butuh database dan tanggal palsu.
//
// Pembagian yang dipegang seluruh modul ini:
//
//   AKUN (User)      → bisa dibekukan, dan setelah masa tenggang diarsipkan.
//   DATA PEGAWAI     → TIDAK PERNAH ikut dibekukan atau diarsipkan.
//
// Catatan absensi, cuti, lembur, dan jejak siapa menyetujui apa wajib
// bertahan bertahun-tahun untuk penggajian dan keperluan hukum. Kalau baris
// Employee ikut hilang, setiap dokumen lama yang menyebut namanya menggantung.

import { CONTRACTED_EMPLOYEE_TYPES } from "@/lib/constants";

/** Berapa lama akun dibiarkan beku sebelum diarsipkan. */
export const FREEZE_GRACE_MONTHS = 3;

/** Ambang peringatan kontrak akan berakhir, dalam hari. */
export const CONTRACT_WARNING_DAYS = [30, 7] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function isContracted(employeeType: string): boolean {
  return (CONTRACTED_EMPLOYEE_TYPES as readonly string[]).includes(employeeType);
}

// ── Validasi masa kontrak ───────────────────────────────────────

export interface ContractInput {
  employeeType: string;
  contractStartAt: Date | null;
  contractEndAt: Date | null;
}

/**
 * Alasan penolakan masa kontrak, atau null bila sah.
 *
 * Aturan "bukan kontrak berarti tanggalnya harus kosong" BUKAN sekadar
 * kerapian: penyapu Fase 42 membekukan akun berdasarkan contractEndAt. Satu
 * tanggal tertinggal pada karyawan tetap — misalnya sisa dari sebelum ia
 * diangkat — akan membekukan akun orang yang masih bekerja.
 */
export function contractRejection(c: ContractInput): string | null {
  const contracted = isContracted(c.employeeType);

  if (!contracted) {
    if (c.contractStartAt || c.contractEndAt) {
      return "Masa kontrak hanya berlaku untuk jenis Kontrak — kosongkan tanggalnya.";
    }
    return null;
  }

  if (!c.contractEndAt) {
    return "Kontrak wajib memiliki tanggal berakhir.";
  }
  if (Number.isNaN(c.contractEndAt.getTime())) {
    return "Tanggal berakhir kontrak tidak valid.";
  }
  if (c.contractStartAt) {
    if (Number.isNaN(c.contractStartAt.getTime())) {
      return "Tanggal mulai kontrak tidak valid.";
    }
    if (c.contractStartAt >= c.contractEndAt) {
      return "Tanggal berakhir kontrak harus setelah tanggal mulai.";
    }
  }
  return null;
}

// ── Fase kontrak ────────────────────────────────────────────────

export type ContractPhase = "NONE" | "OK" | "DUE_SOON" | "ENDED";

/** Sisa hari menuju berakhirnya kontrak; negatif berarti sudah lewat. */
export function contractRemainingDays(endAt: Date, now: Date): number {
  return Math.ceil((endAt.getTime() - now.getTime()) / MS_PER_DAY);
}

/**
 * Keadaan kontrak saat ini.
 *
 * `NONE` untuk yang memang tidak berkontrak — dibedakan dari `OK` supaya UI
 * bisa menyembunyikan bloknya sama sekali, bukan menampilkan "aman" pada
 * karyawan tetap yang tidak punya kontrak untuk diamankan.
 */
export function contractPhase(
  c: { employeeType: string; contractEndAt: Date | null },
  now: Date,
  warnDays: number = CONTRACT_WARNING_DAYS[0]
): ContractPhase {
  if (!isContracted(c.employeeType) || !c.contractEndAt) return "NONE";
  const remaining = contractRemainingDays(c.contractEndAt, now);
  if (remaining <= 0) return "ENDED";
  return remaining <= warnDays ? "DUE_SOON" : "OK";
}

/**
 * Ambang peringatan yang tepat dilewati HARI INI, atau null bila hari ini
 * bukan hari peringatan.
 *
 * Mengembalikan ambangnya (30 atau 7), bukan sekadar true, supaya pesan yang
 * dikirim bisa menyebut angkanya. Dipakai penyapu harian: hanya sisa hari yang
 * PERSIS sama dengan ambang yang memicu, sehingga peringatan tidak diulang
 * setiap hari selama sebulan penuh.
 */
export function contractWarningThreshold(
  c: { employeeType: string; contractEndAt: Date | null },
  now: Date,
  thresholds: readonly number[] = CONTRACT_WARNING_DAYS
): number | null {
  if (!isContracted(c.employeeType) || !c.contractEndAt) return null;
  const remaining = contractRemainingDays(c.contractEndAt, now);
  return thresholds.find((t) => t === remaining) ?? null;
}

// ── Pembekuan akun ──────────────────────────────────────────────

export interface FreezeCandidate {
  employeeType: string;
  contractEndAt: Date | null;
  employeeActive: boolean;
  userId: string | null;
  userFrozenAt: Date | null;
}

/**
 * Alasan sebuah akun TIDAK dibekukan, atau null bila memang harus dibekukan.
 *
 * Ditulis sebagai daftar alasan penolakan, bukan boolean, supaya penyapu bisa
 * melaporkan kenapa seseorang dilewati — tanpa itu, pegawai yang seharusnya
 * beku tapi tidak beku menjadi kesenyapan yang tak bisa ditelusuri.
 */
export function freezeBlocker(c: FreezeCandidate, now: Date): string | null {
  if (!isContracted(c.employeeType)) return "Bukan karyawan kontrak.";
  if (!c.contractEndAt) return "Tidak ada tanggal berakhir kontrak.";
  if (c.contractEndAt > now) return "Kontrak belum berakhir.";
  if (!c.employeeActive) return "Karyawan sudah dinonaktifkan manual.";
  if (!c.userId) return "Tidak memiliki akun sistem.";
  if (c.userFrozenAt) return "Akun sudah beku.";
  return null;
}

export function shouldFreeze(c: FreezeCandidate, now: Date): boolean {
  return freezeBlocker(c, now) === null;
}

// ── Pengarsipan setelah masa tenggang ───────────────────────────

/** Menambah bulan sambil menjaga akhir bulan tetap masuk akal (31 Jan + 1 bln = 28/29 Feb). */
export function addMonths(d: Date, months: number): Date {
  const x = new Date(d.getTime());
  const day = x.getDate();
  x.setMonth(x.getMonth() + months);
  if (x.getDate() < day) x.setDate(0); // meluber ke bulan berikutnya → mundur ke hari terakhir
  return x;
}

/** Kapan akun beku ini jatuh tempo untuk diarsipkan. */
export function archiveDueAt(
  frozenAt: Date,
  graceMonths: number = FREEZE_GRACE_MONTHS
): Date {
  return addMonths(frozenAt, graceMonths);
}

export function isArchiveDue(
  frozenAt: Date | null,
  now: Date,
  graceMonths: number = FREEZE_GRACE_MONTHS
): boolean {
  if (!frozenAt) return false;
  return archiveDueAt(frozenAt, graceMonths) <= now;
}

// ── Keadaan akun untuk ditampilkan ──────────────────────────────

export type AccountState = "ACTIVE" | "FROZEN" | "ARCHIVED";

/**
 * Beku dan diarsipkan sengaja dibedakan meski keduanya tidak bisa masuk.
 * Beku itu sementara dan dibalik dengan satu tombol; diarsipkan berarti sudah
 * keluar dari peredaran dan pemulihannya lewat halaman arsip.
 */
export function accountState(u: {
  isActive: boolean;
  frozenAt: Date | null;
}): AccountState {
  if (!u.isActive) return "ARCHIVED";
  return u.frozenAt ? "FROZEN" : "ACTIVE";
}

export const ACCOUNT_STATE_LABELS: Record<AccountState, string> = {
  ACTIVE: "Aktif",
  FROZEN: "Beku",
  ARCHIVED: "Diarsipkan",
};
