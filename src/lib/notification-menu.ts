import { db } from "@/lib/db";
import { safeInternalHref } from "@/lib/internal-link";

// ── Loader dropdown notifikasi (Fase 34, PRD Frontend §9 & §13) ─
//
// Bentuk datanya mengikuti kontrak yang ditetapkan frontend, bukan bentuk
// tabelnya. Dua hal yang ditegakkan di sini karena tidak boleh bergantung
// pada kedisiplinan pemanggil:
//   1. Kepemilikan — kueri SELALU dibatasi userId. Tidak ada parameter yang
//      bisa melebarkannya ke notifikasi orang lain.
//   2. Keamanan tautan — `link` dari database divalidasi sebagai path
//      internal; yang tidak lolos menjadi null dan ditampilkan tanpa tautan.

export interface NotificationPreview {
  id: string;
  type: string;
  title: string;
  body: string | null;
  module: string;
  href: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationMenuData {
  unreadCount: number;
  items: NotificationPreview[];
  hasMore: boolean;
}

export const NOTIFICATION_MENU_LIMIT = 5;

export async function notificationMenuData(
  userId: string,
  limit: number = NOTIFICATION_MENU_LIMIT
): Promise<NotificationMenuData> {
  const take = Math.max(1, Math.min(limit, 20));

  // Diambil satu lebih banyak dari yang ditampilkan — itulah cara mengetahui
  // "masih ada lagi" tanpa menghitung ulang seluruh tabel.
  const [rows, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: take + 1,
    }),
    db.notification.count({ where: { userId, readAt: null } }),
  ]);

  const items = rows.slice(0, take).map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    module: n.module,
    href: safeInternalHref(n.link),
    createdAt: n.createdAt.toISOString(),
    readAt: n.readAt?.toISOString() ?? null,
  }));

  return { unreadCount, items, hasMore: rows.length > take };
}
