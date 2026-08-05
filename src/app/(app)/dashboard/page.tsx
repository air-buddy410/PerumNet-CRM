import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, APPROVAL_STATUS, formatDateTime } from "@/lib/constants";
import { PageHeader, Badge, EmptyState } from "@/components/ui";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requirePermission(PERMISSIONS.DASHBOARD_VIEW);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const roleIds = user.roles.map((r) => r.id);
  const [activeUsers, roleCount, pendingApprovals, auditToday, myPending, recentRequests] =
    await Promise.all([
      db.user.count({ where: { isActive: true } }),
      db.role.count(),
      db.approvalRequest.count({ where: { status: APPROVAL_STATUS.PENDING } }),
      db.auditLog.count({ where: { createdAt: { gte: startOfDay } } }),
      db.approvalRequest.findMany({
        where: {
          status: APPROVAL_STATUS.PENDING,
          requestedById: { not: user.id },
          steps: {
            some: { status: "PENDING", roleId: { in: roleIds } },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      db.approvalRequest.findMany({
        where: { requestedById: user.id },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

  const stats = [
    { label: "User Aktif", value: activeUsers, href: "/settings/users" },
    { label: "Role", value: roleCount, href: "/settings/roles" },
    { label: "Approval Pending", value: pendingApprovals, href: "/approvals" },
    { label: "Aktivitas Audit Hari Ini", value: auditToday, href: "/audit-log" },
  ];

  return (
    <div>
      <PageHeader
        title={`Selamat datang, ${user.name}`}
        subtitle="Ringkasan sistem — Phase 1 Foundation"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card p-5 transition hover:shadow-md">
            <div className="text-3xl font-semibold text-slate-900">{s.value}</div>
            <div className="mt-1 text-sm text-slate-500">{s.label}</div>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="font-medium">Menunggu Keputusan Anda</h2>
            <Link href="/approvals" className="text-sm text-brand-600 hover:underline">
              Lihat semua
            </Link>
          </div>
          {myPending.length === 0 ? (
            <EmptyState message="Tidak ada approval yang menunggu keputusan Anda." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {myPending.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/approvals/${r.id}`}
                    className="flex items-center justify-between px-5 py-3 hover:bg-slate-50"
                  >
                    <div>
                      <div className="text-sm font-medium">{r.title}</div>
                      <div className="text-xs text-slate-500">
                        {r.requestNumber} · {formatDateTime(r.createdAt)}
                      </div>
                    </div>
                    <Badge value={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="font-medium">Pengajuan Saya</h2>
            <Link href="/approvals/new" className="text-sm text-brand-600 hover:underline">
              Ajukan baru
            </Link>
          </div>
          {recentRequests.length === 0 ? (
            <EmptyState message="Belum ada pengajuan." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentRequests.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/approvals/${r.id}`}
                    className="flex items-center justify-between px-5 py-3 hover:bg-slate-50"
                  >
                    <div>
                      <div className="text-sm font-medium">{r.title}</div>
                      <div className="text-xs text-slate-500">
                        {r.requestNumber} · {formatDateTime(r.createdAt)}
                      </div>
                    </div>
                    <Badge value={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
