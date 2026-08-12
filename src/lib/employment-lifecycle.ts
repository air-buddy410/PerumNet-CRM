import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { notifyUsers, notifyPermission } from "@/lib/notify";
import { PERMISSIONS } from "@/lib/constants";
import { archiveRecord } from "@/lib/archive";
import {
  FREEZE_GRACE_MONTHS,
  archiveDueAt,
  contractWarningThreshold,
  freezeBlocker,
  isArchiveDue,
} from "@/lib/employment";
import type { CurrentUser } from "@/lib/rbac";

// ── Kontrak berakhir → beku → arsip (Fase 42) ───────────────────
//
// Yang ditegakkan di sini:
//
//  - MEMPERINGATKAN DULU, BARU MEMBEKUKAN. H-30 dan H-7 ke HRD dan ke
//    atasannya, supaya perpanjangan sempat diurus. Membekukan akun orang yang
//    masih bekerja karena tak ada yang sempat memperpanjang adalah kegagalan
//    sistem, bukan kegagalan orangnya.
//  - YANG DIBEKUKAN ADALAH AKUN, BUKAN DATA PEGAWAI. Baris Employee tidak
//    disentuh sama sekali. Absensi, cuti, lembur, dan jejak persetujuannya
//    tetap utuh dan tetap terlihat.
//  - BEKU BISA DIBATALKAN MANUSIA. Tanggal kontrak bisa salah ketik, dan
//    akibat salah ketik tidak boleh permanen.
//  - SETELAH MASA TENGGANG BARU DIARSIPKAN, dan arsipnya pun bisa dipulihkan.
//    Tidak ada satu pun jalur yang menghapus baris.

type Result<T = undefined> =
  | { ok: true; id: string; data?: T }
  | { ok: false; error: string };

/** Menahan pesan berulang: satu jenis peringatan per akun per 20 jam. */
async function notifiedRecently(type: string, link: string, hours = 20): Promise<boolean> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const existing = await db.notification.findFirst({
    where: { type, link, createdAt: { gte: since } },
    select: { id: true },
  });
  return existing !== null;
}

/**
 * Membekukan satu akun.
 *
 * Menaikkan sessionEpoch supaya sesi yang sedang berjalan di perangkat lain
 * ikut tertutup saat itu juga — tanpa itu, "beku" hanya berarti tidak bisa
 * login lagi, sementara tab yang sudah terbuka tetap bekerja seperti biasa.
 */
export async function freezeAccount(
  actorId: string | null,
  userId: string,
  reason: string
): Promise<Result> {
  const trimmed = reason?.trim() ?? "";
  if (trimmed.length < 3) {
    return { ok: false, error: "Alasan pembekuan wajib diisi (minimal 3 karakter)." };
  }
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, error: "Akun tidak ditemukan." };
  if (target.frozenAt) return { ok: false, error: "Akun sudah beku." };
  if (!target.isActive) return { ok: false, error: "Akun sudah diarsipkan — pulihkan dari halaman arsip." };

  await db.user.update({
    where: { id: userId },
    data: {
      frozenAt: new Date(),
      freezeReason: trimmed,
      sessionEpoch: { increment: 1 },
    },
  });
  await logAudit({
    userId: actorId ?? undefined,
    action: "USER_FREEZE",
    module: "users",
    entityType: "User",
    entityId: userId,
    description: `Membekukan akun ${target.username} — ${trimmed}`,
  });
  await notifyUsers([userId], {
    type: "ACCOUNT_FROZEN",
    title: "Akun Anda dibekukan",
    body: trimmed,
    link: "/profile",
    module: "users",
  });
  return { ok: true, id: userId };
}

/** Mencairkan akun beku — mis. kontrak diperpanjang atau tanggalnya salah. */
export async function unfreezeAccount(
  user: CurrentUser,
  userId: string,
  reason: string
): Promise<Result> {
  const trimmed = reason?.trim() ?? "";
  if (trimmed.length < 3) {
    return { ok: false, error: "Alasan pencairan wajib diisi (minimal 3 karakter)." };
  }
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, error: "Akun tidak ditemukan." };
  if (!target.frozenAt) return { ok: false, error: "Akun tidak sedang beku." };

  await db.user.update({
    where: { id: userId },
    data: {
      frozenAt: null,
      freezeReason: null,
      // Naikkan lagi: selama beku, token lama bisa saja berpindah tangan.
      sessionEpoch: { increment: 1 },
    },
  });
  await logAudit({
    userId: user.id,
    action: "USER_UNFREEZE",
    module: "users",
    entityType: "User",
    entityId: userId,
    description: `Mencairkan akun ${target.username} — ${trimmed}`,
  });
  await notifyUsers([userId], {
    type: "ACCOUNT_UNFROZEN",
    title: "Akun Anda aktif kembali",
    body: trimmed,
    link: "/profile",
    module: "users",
  });
  return { ok: true, id: userId };
}

/**
 * Mengarsipkan akun beku yang sudah melewati masa tenggang.
 *
 * `isActive: false` yang membuatnya keluar dari daftar aktif; barisnya sendiri
 * tetap ada karena dirujuk audit log, approval, dan hampir setiap dokumen yang
 * pernah ia sentuh. Menghapusnya akan meninggalkan riwayat yang menggantung.
 */
async function archiveAccount(userId: string, reason: string): Promise<boolean> {
  const target = await db.user.findUnique({
    where: { id: userId },
    include: { division: { select: { code: true, name: true } } },
  });
  if (!target || !target.isActive) return false;

  const archived = await archiveRecord(null, {
    entityType: "User",
    entityId: userId,
    label: `${target.name} — ${target.username}`,
    // passwordHash SENGAJA tidak ikut. Snapshot ditampilkan di halaman arsip;
    // memasukkan hash ke sana memindahkan rahasia ke tempat yang lebih mudah
    // dibaca daripada tabel aslinya.
    snapshot: {
      username: target.username,
      email: target.email,
      name: target.name,
      phone: target.phone,
      level: target.level,
      division: target.division?.name ?? null,
      frozenAt: target.frozenAt,
      freezeReason: target.freezeReason,
      createdAt: target.createdAt,
    },
    reason,
  });
  if (!archived.ok) {
    console.error("[employment] gagal mengarsipkan akun:", archived.error);
    return false;
  }
  await db.user.update({
    where: { id: userId },
    data: { isActive: false, sessionEpoch: { increment: 1 } },
  });
  return true;
}

export interface LifecycleSweepResult {
  warned: number;
  frozen: number;
  archived: number;
  attemptedFreeze: number;
  summary: string;
}

/**
 * Penyapu harian: memperingatkan, membekukan, lalu mengarsipkan.
 *
 * Dijalankan worker Fase 27. Sengaja tidak pernah menghapus apa pun, dan
 * sengaja tidak menyentuh baris Employee.
 */
export async function sweepEmploymentLifecycle(now: Date = new Date()): Promise<LifecycleSweepResult> {
  let warned = 0;
  let frozen = 0;
  let archived = 0;
  let attemptedFreeze = 0;

  // ── 1. Peringatan H-30 dan H-7 ────────────────────────────────
  const contracted = await db.employee.findMany({
    where: { employeeType: "CONTRACT", contractEndAt: { not: null }, isActive: true },
    include: {
      user: { select: { id: true, username: true, frozenAt: true, isActive: true } },
      supervisor: { select: { userId: true } },
    },
  });

  for (const emp of contracted) {
    const threshold = contractWarningThreshold(emp, now);
    if (threshold === null) continue;
    const link = `/hrd/employees?edit=${emp.id}`;
    const type = `CONTRACT_ENDING_${threshold}`;
    if (await notifiedRecently(type, link)) continue;

    warned++;
    const due = emp.contractEndAt!.toLocaleDateString("id-ID");
    const payload = {
      type,
      title: `Kontrak berakhir ${threshold} hari lagi: ${emp.fullName}`,
      body: `${emp.employeeNo} — kontrak berakhir ${due}. Perpanjang atau biarkan akun dibekukan otomatis.`,
      link,
      module: "hrd",
    };
    await notifyPermission(PERMISSIONS.HRD_MANAGE, payload);
    // Atasan langsung ikut diberi tahu — dialah yang tahu orangnya masih
    // dibutuhkan atau tidak, dan HRD sering hanya meneruskan.
    if (emp.supervisor?.userId) await notifyUsers([emp.supervisor.userId], payload);
  }

  // ── 2. Pembekuan akun yang kontraknya sudah berakhir ──────────
  for (const emp of contracted) {
    const blocker = freezeBlocker(
      {
        employeeType: emp.employeeType,
        contractEndAt: emp.contractEndAt,
        employeeActive: emp.isActive,
        userId: emp.userId,
        userFrozenAt: emp.user?.frozenAt ?? null,
      },
      now
    );
    if (blocker) continue;
    attemptedFreeze++;
    const due = emp.contractEndAt!.toLocaleDateString("id-ID");
    const result = await freezeAccount(
      null,
      emp.userId!,
      `Kontrak berakhir ${due} (otomatis).`
    );
    if (!result.ok) {
      console.error(`[employment] gagal membekukan ${emp.employeeNo}:`, result.error);
      continue;
    }
    frozen++;
    await notifyPermission(PERMISSIONS.HRD_MANAGE, {
      type: "ACCOUNT_FROZEN_AUTO",
      title: `Akun dibekukan: ${emp.fullName}`,
      body: `${emp.employeeNo} — kontrak berakhir ${due}. Akan diarsipkan ${archiveDueAt(
        now
      ).toLocaleDateString("id-ID")} bila tidak dicairkan.`,
      link: `/hrd/employees?edit=${emp.id}`,
      module: "hrd",
    });
  }

  // ── 3. Pengarsipan akun yang sudah beku melewati masa tenggang ─
  const frozenAccounts = await db.user.findMany({
    where: { frozenAt: { not: null }, isActive: true },
    select: { id: true, username: true, name: true, frozenAt: true, freezeReason: true },
  });
  for (const acc of frozenAccounts) {
    if (!isArchiveDue(acc.frozenAt, now)) continue;
    const since = acc.frozenAt!.toLocaleDateString("id-ID");
    const done = await archiveAccount(
      acc.id,
      `Beku sejak ${since}, melewati masa tenggang ${FREEZE_GRACE_MONTHS} bulan (otomatis).`
    );
    if (done) archived++;
  }

  const summary =
    `${warned} peringatan kontrak · ${frozen} akun dibekukan · ${archived} akun diarsipkan`;
  return { warned, frozen, archived, attemptedFreeze, summary };
}
