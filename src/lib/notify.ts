import { db } from "@/lib/db";
import { APPROVER_TYPES, USER_LEVELS } from "@/lib/constants";
import type { CurrentUser } from "@/lib/rbac";

// ── Notification Engine (PRD §50) ───────────────────────────────
// Event-based: service layer memanggil notify* saat event bisnis terjadi.
// Channel awal IN_APP; adapter WhatsApp/email tinggal ditambah di sini
// tanpa mengubah pemanggil (§56 — menunggu kredensial gateway).
//
// Prinsip: notifikasi TIDAK BOLEH menggagalkan operasi bisnis — semua
// fungsi kirim menelan error (log ke console, bukan throw).

export interface NotifyData {
  type: string; // kode event, mis. APPROVAL_PENDING
  title: string;
  body?: string;
  link?: string; // path in-app
  module: string;
}

export async function notifyUsers(userIds: string[], data: NotifyData): Promise<void> {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return;
  try {
    await db.notification.createMany({
      data: unique.map((userId) => ({
        userId,
        type: data.type,
        title: data.title,
        body: data.body ?? null,
        link: data.link ?? null,
        module: data.module,
      })),
    });
  } catch (e) {
    console.error("[notify] gagal membuat notifikasi:", e);
  }
}

// Kirim ke semua user aktif pemegang permission tertentu.
export async function notifyPermission(
  permissionCode: string,
  data: NotifyData,
  excludeUserId?: string
): Promise<void> {
  try {
    const users = await db.user.findMany({
      where: {
        isActive: true,
        roles: {
          some: {
            role: { permissions: { some: { permission: { code: permissionCode } } } },
          },
        },
      },
      select: { id: true },
    });
    await notifyUsers(
      users.map((u) => u.id).filter((id) => id !== excludeUserId),
      data
    );
  } catch (e) {
    console.error("[notify] gagal resolve permission:", e);
  }
}

// Kirim ke user yang berhak memutus sebuah approval step
// (audiens utama step — owner tidak dibanjiri notifikasi step ROLE).
export async function notifyStepApprovers(
  step: { approverType: string; roleId: string | null; divisionId: string | null },
  data: NotifyData,
  excludeUserId?: string
): Promise<void> {
  try {
    let where;
    if (step.approverType === APPROVER_TYPES.OWNER) {
      where = { isActive: true, level: USER_LEVELS.OWNER };
    } else if (step.approverType === APPROVER_TYPES.SUPERVISOR) {
      if (!step.divisionId) return;
      where = { isActive: true, level: USER_LEVELS.SUPERVISOR, divisionId: step.divisionId };
    } else {
      if (!step.roleId) return;
      where = { isActive: true, roles: { some: { roleId: step.roleId } } };
    }
    const users = await db.user.findMany({ where, select: { id: true } });
    await notifyUsers(
      users.map((u) => u.id).filter((id) => id !== excludeUserId),
      data
    );
  } catch (e) {
    console.error("[notify] gagal resolve step approver:", e);
  }
}

// ── Baca / tandai dibaca (dipakai halaman /notifications) ───────

export async function unreadCount(userId: string): Promise<number> {
  try {
    return await db.notification.count({ where: { userId, readAt: null } });
  } catch {
    return 0;
  }
}

export async function markRead(
  user: CurrentUser,
  notificationId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const n = await db.notification.findUnique({ where: { id: notificationId } });
  if (!n || n.userId !== user.id) {
    return { ok: false, error: "Notifikasi tidak ditemukan." };
  }
  if (!n.readAt) {
    await db.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }
  return { ok: true };
}

export async function markAllRead(user: CurrentUser): Promise<{ ok: true }> {
  await db.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return { ok: true };
}
