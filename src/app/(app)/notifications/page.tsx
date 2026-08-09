import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, EmptyState } from "@/components/ui";
import { openNotificationAction, markAllReadAction } from "./actions";

export const metadata = { title: "Notifikasi" };

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  const notifications = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Notifikasi"
        subtitle={unread > 0 ? `${unread} belum dibaca.` : "Semua sudah dibaca."}
        action={
          unread > 0 ? (
            <form action={markAllReadAction}>
              <button type="submit" className="btn-secondary">
                Tandai Semua Dibaca
              </button>
            </form>
          ) : undefined
        }
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="card divide-y divide-slate-100">
        {notifications.length === 0 ? (
          <EmptyState message="Belum ada notifikasi." />
        ) : (
          notifications.map((n) => (
            <form key={n.id} action={openNotificationAction}>
              <input type="hidden" name="notificationId" value={n.id} />
              <button
                type="submit"
                className={`block w-full px-4 py-3 text-left transition hover:bg-slate-50 ${n.readAt ? "opacity-60" : ""}`}
              >
                <span className="flex items-start gap-2">
                  {!n.readAt && (
                    <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" />
                  )}
                  <span className="min-w-0">
                    <span className={`block text-sm ${n.readAt ? "" : "font-semibold"}`}>{n.title}</span>
                    {n.body && (
                      <span className="mt-0.5 block truncate text-xs text-slate-500">{n.body}</span>
                    )}
                    <span className="mt-0.5 block text-xs text-slate-400">
                      {formatDateTime(n.createdAt)}
                    </span>
                  </span>
                </span>
              </button>
            </form>
          ))
        )}
      </div>
    </div>
  );
}
