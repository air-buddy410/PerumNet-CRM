import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { saveAttachment } from "@/lib/files";
import { PERMISSIONS } from "@/lib/constants";
import {
  cardNumberFor,
  CARD_TOKEN_BYTES,
  statusChangeRejection,
  publicVerification,
  verificationUrl,
  type CardAction,
  type PublicVerification,
} from "@/lib/employee-card";
import type { CurrentUser } from "@/lib/rbac";

// ── Penerbitan & pencabutan kartu pegawai (Fase 49) ─────────────
//
// Foto resmi diunggah HRD (keputusan K5), jadi seluruh pengelolaan kartu
// memakai izin yang sama: `hrd.manage`. Kartu adalah dokumen kepegawaian,
// bukan perangkat IT.
//
// Yang ditegakkan DI SINI, bukan di halaman:
//
//  - SATU KARTU AKTIF PER PEGAWAI. Menerbitkan kartu kedua tanpa mematikan
//    yang pertama berarti dua kartu fisik berlaku bersamaan, dan yang satu
//    entah di mana.
//  - KARTU LAMA TIDAK DIHAPUS. Diganti statusnya dan ditunjuk penggantinya,
//    sehingga riwayat pemegang kartu bisa ditelusuri.
//  - PENCABUTAN BERLAKU SEKETIKA, dan alasannya wajib.

type Result<T = undefined> =
  | { ok: true; id: string; data?: T }
  | { ok: false; error: string };

export const EMPLOYEE_PHOTO_ENTITY = "EmployeePhoto";

/** Token QR: acak, buram, tidak bermakna di luar sistem ini. */
export function newCardToken(): string {
  return randomBytes(CARD_TOKEN_BYTES).toString("base64url");
}

// ── Foto resmi pegawai ──────────────────────────────────────────

/**
 * Mengunggah foto resmi pegawai. Hanya HRD (keputusan K5).
 *
 * Foto lama TIDAK dihapus dari penyimpanan — ia mungkin tercetak di kartu yang
 * masih beredar, dan menghapusnya membuat kartu lama tidak bisa diverifikasi
 * lagi. Yang berpindah hanya penunjuk foto mana yang berlaku sekarang.
 */
export async function uploadEmployeePhoto(
  user: CurrentUser,
  employeeId: string,
  file: File
): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.HRD_MANAGE)) {
    return { ok: false, error: "Hanya HRD yang boleh mengunggah foto pegawai." };
  }
  const emp = await db.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, employeeNo: true, fullName: true, photoAttachmentId: true },
  });
  if (!emp) return { ok: false, error: "Karyawan tidak ditemukan." };

  const saved = await saveAttachment(file, EMPLOYEE_PHOTO_ENTITY, employeeId, user.id);
  if (!saved.ok) return saved;

  await db.employee.update({
    where: { id: employeeId },
    data: { photoAttachmentId: saved.id },
  });
  await logAudit({
    userId: user.id,
    action: "EMPLOYEE_PHOTO_UPLOAD",
    module: "hrd",
    entityType: "Employee",
    entityId: employeeId,
    description:
      `Mengunggah foto resmi ${emp.employeeNo} — ${emp.fullName}` +
      (emp.photoAttachmentId ? " (mengganti foto sebelumnya)" : ""),
  });
  return { ok: true, id: saved.id };
}

// ── Penerbitan kartu ────────────────────────────────────────────

export interface IssueCardInput {
  employeeId: string;
  expiresAt?: Date | null;
  nfcUid?: string | null;
  /** Kartu yang digantikan, bila ini kartu pengganti. */
  replacesId?: string | null;
}

/**
 * Menerbitkan kartu baru.
 *
 * Menolak bila pegawai masih punya kartu ACTIVE — pakai `replaceCard()`
 * supaya yang lama benar-benar mati lebih dulu. Dua kartu berlaku bersamaan
 * adalah keadaan yang tidak boleh bisa dicapai lewat jalur normal.
 */
export async function issueCard(user: CurrentUser, input: IssueCardInput): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.HRD_MANAGE)) {
    return { ok: false, error: "Hanya HRD yang boleh menerbitkan kartu." };
  }
  const emp = await db.employee.findUnique({
    where: { id: input.employeeId },
    select: { id: true, employeeNo: true, fullName: true, isActive: true, _count: { select: { cards: true } } },
  });
  if (!emp) return { ok: false, error: "Karyawan tidak ditemukan." };
  if (!emp.isActive) {
    return { ok: false, error: "Karyawan sudah tidak aktif — kartu tidak diterbitkan." };
  }

  const active = await db.employeeCard.findFirst({
    where: { employeeId: input.employeeId, status: "ACTIVE" },
    select: { id: true, cardNumber: true },
  });
  if (active && !input.replacesId) {
    return {
      ok: false,
      error: `Masih ada kartu berlaku (${active.cardNumber}). Pakai penggantian kartu agar yang lama dimatikan lebih dulu.`,
    };
  }

  const nfcUid = input.nfcUid?.trim() || null;
  if (nfcUid) {
    const taken = await db.employeeCard.findFirst({ where: { nfcUid }, select: { cardNumber: true } });
    if (taken) return { ok: false, error: `UID NFC sudah dipakai kartu ${taken.cardNumber}.` };
  }

  const card = await db.employeeCard.create({
    data: {
      employeeId: input.employeeId,
      cardNumber: cardNumberFor(emp.employeeNo, emp._count.cards + 1),
      publicToken: newCardToken(),
      nfcUid,
      issuedById: user.id,
      expiresAt: input.expiresAt ?? null,
      replacesId: input.replacesId ?? null,
    },
  });
  await logAudit({
    userId: user.id,
    action: "CARD_ISSUE",
    module: "hrd",
    entityType: "EmployeeCard",
    entityId: card.id,
    description: `Menerbitkan kartu ${card.cardNumber} untuk ${emp.fullName} (${emp.employeeNo})`,
  });
  return { ok: true, id: card.id };
}

/** Mengubah status kartu — hilang, dicabut, atau diganti. */
async function changeStatus(
  user: CurrentUser,
  cardId: string,
  next: CardAction,
  reason: string
): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.HRD_MANAGE)) {
    return { ok: false, error: "Hanya HRD yang boleh mengubah status kartu." };
  }
  const trimmed = reason?.trim() ?? "";
  if (trimmed.length < 3) {
    return { ok: false, error: "Alasan wajib diisi (minimal 3 karakter)." };
  }
  const card = await db.employeeCard.findUnique({
    where: { id: cardId },
    select: { id: true, status: true, cardNumber: true, employee: { select: { fullName: true } } },
  });
  if (!card) return { ok: false, error: "Kartu tidak ditemukan." };

  const rejection = statusChangeRejection(card.status, next);
  if (rejection) return { ok: false, error: rejection };

  await db.employeeCard.update({
    where: { id: cardId },
    data: {
      status: next,
      revokedAt: new Date(),
      revokedById: user.id,
      revokeReason: trimmed,
    },
  });
  await logAudit({
    userId: user.id,
    action: `CARD_${next}`,
    module: "hrd",
    entityType: "EmployeeCard",
    entityId: cardId,
    description: `Kartu ${card.cardNumber} (${card.employee.fullName}) → ${next} — ${trimmed}`,
  });
  return { ok: true, id: cardId };
}

export function markCardLost(user: CurrentUser, cardId: string, reason: string) {
  return changeStatus(user, cardId, "LOST", reason);
}

export function revokeCard(user: CurrentUser, cardId: string, reason: string) {
  return changeStatus(user, cardId, "REVOKED", reason);
}

/**
 * Mengganti kartu: yang lama dimatikan, yang baru terbit menunjuk padanya.
 *
 * Dua langkah ini menumpang SATU transaksi. Kalau tidak, kegagalan di tengah
 * meninggalkan pegawai tanpa kartu berlaku sama sekali, atau — lebih buruk —
 * dua kartu berlaku bersamaan.
 */
export async function replaceCard(
  user: CurrentUser,
  oldCardId: string,
  reason: string,
  opts: { expiresAt?: Date | null; nfcUid?: string | null } = {}
): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.HRD_MANAGE)) {
    return { ok: false, error: "Hanya HRD yang boleh mengganti kartu." };
  }
  const trimmed = reason?.trim() ?? "";
  if (trimmed.length < 3) return { ok: false, error: "Alasan wajib diisi (minimal 3 karakter)." };

  const old = await db.employeeCard.findUnique({
    where: { id: oldCardId },
    select: { id: true, status: true, employeeId: true, cardNumber: true },
  });
  if (!old) return { ok: false, error: "Kartu lama tidak ditemukan." };
  const rejection = statusChangeRejection(old.status, "REPLACED");
  if (rejection) return { ok: false, error: rejection };

  const emp = await db.employee.findUnique({
    where: { id: old.employeeId },
    select: { employeeNo: true, fullName: true, isActive: true, _count: { select: { cards: true } } },
  });
  if (!emp) return { ok: false, error: "Karyawan tidak ditemukan." };
  if (!emp.isActive) return { ok: false, error: "Karyawan sudah tidak aktif." };

  const nfcUid = opts.nfcUid?.trim() || null;
  if (nfcUid) {
    const taken = await db.employeeCard.findFirst({ where: { nfcUid }, select: { cardNumber: true } });
    if (taken) return { ok: false, error: `UID NFC sudah dipakai kartu ${taken.cardNumber}.` };
  }

  const newId = await db.$transaction(async (tx) => {
    await tx.employeeCard.update({
      where: { id: oldCardId },
      data: {
        status: "REPLACED",
        revokedAt: new Date(),
        revokedById: user.id,
        revokeReason: trimmed,
      },
    });
    const created = await tx.employeeCard.create({
      data: {
        employeeId: old.employeeId,
        cardNumber: cardNumberFor(emp.employeeNo, emp._count.cards + 1),
        publicToken: newCardToken(),
        nfcUid,
        issuedById: user.id,
        expiresAt: opts.expiresAt ?? null,
        replacesId: oldCardId,
      },
    });
    return created.id;
  });

  await logAudit({
    userId: user.id,
    action: "CARD_REPLACE",
    module: "hrd",
    entityType: "EmployeeCard",
    entityId: newId,
    description: `Mengganti kartu ${old.cardNumber} milik ${emp.fullName} — ${trimmed}`,
  });
  return { ok: true, id: newId };
}

// ── Pembacaan ───────────────────────────────────────────────────

export async function loadEmployeeCards(employeeId: string) {
  return db.employeeCard.findMany({
    where: { employeeId },
    select: {
      id: true,
      cardNumber: true,
      status: true,
      issuedAt: true,
      expiresAt: true,
      nfcUid: true,
      revokedAt: true,
      revokeReason: true,
      issuedBy: { select: { name: true } },
      revokedBy: { select: { name: true } },
    },
    orderBy: { issuedAt: "desc" },
  });
}

/**
 * Verifikasi publik dari token QR — TANPA login.
 *
 * Yang dikembalikan sudah disaring `publicVerification()`: hanya nama,
 * jabatan, foto, dan nomor kartu, dan hanya bila kartunya berlaku.
 */
export async function verifyCardToken(
  publicToken: string,
  now: Date = new Date()
): Promise<PublicVerification> {
  const token = publicToken?.trim() ?? "";
  // Token terlalu pendek tidak perlu menyentuh database sama sekali.
  if (token.length < 32) {
    return publicVerification(null, null, now);
  }
  const card = await db.employeeCard.findUnique({
    where: { publicToken: token },
    select: {
      cardNumber: true,
      status: true,
      expiresAt: true,
      employee: {
        select: {
          fullName: true,
          jobTitle: true,
          isActive: true,
          photoAttachmentId: true,
          user: { select: { frozenAt: true, isActive: true } },
        },
      },
    },
  });
  if (!card) return publicVerification(null, null, now);

  const e = card.employee;
  return publicVerification(
    {
      cardNumber: card.cardNumber,
      status: card.status,
      expiresAt: card.expiresAt,
      employeeActive: e.isActive,
      userFrozenAt: e.user?.frozenAt ?? null,
      // Tanpa akun sistem bukan berarti diarsipkan — banyak pegawai lapangan
      // memang tidak punya akun CRM.
      userArchived: e.user ? !e.user.isActive : false,
    },
    {
      fullName: e.fullName,
      jobTitle: e.jobTitle,
      // Fase 50 — menunjuk jalur PUBLIK berkunci token, bukan /api/files yang
      // butuh login dan izin hrd.view. Id lampirannya sengaja tidak pernah
      // ikut keluar: yang beredar di halaman publik cuma tokennya.
      photoUrl: e.photoAttachmentId ? `/api/verify/${token}/photo` : null,
    },
    now
  );
}

// ── QR ──────────────────────────────────────────────────────────

/**
 * QR berisi ALAMAT halaman verifikasi, bukan data pegawai.
 *
 * Dengan begitu ponsel mana pun bisa memindainya tanpa aplikasi khusus, dan
 * yang tersimpan di kartu tetap tidak bermakna di luar sistem ini.
 */
export async function cardQrSvg(appUrl: string, publicToken: string): Promise<string> {
  return QRCode.toString(verificationUrl(appUrl, publicToken), {
    type: "svg",
    margin: 1,
    // Toleransi galat sedang: kartu identitas kena gores dan kotor, tetapi
    // "high" memperbesar modulnya sehingga sulit dipindai dari jarak wajar.
    errorCorrectionLevel: "M",
  });
}
