import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, APPROVAL_STATUS, formatDateTime } from "@/lib/constants";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { isEligibleApprover } from "@/lib/approval";
import { Activity, ArrowRight, ClipboardCheck, ShieldCheck, UsersRound } from "lucide-react";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requirePermission(PERMISSIONS.DASHBOARD_VIEW);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [activeUsers, roleCount, pendingApprovals, auditToday, pendingAll, recentRequests] =
    await Promise.all([
      db.user.count({ where: { isActive: true } }),
      db.role.count(),
      db.approvalRequest.count({ where: { status: APPROVAL_STATUS.PENDING } }),
      db.auditLog.count({ where: { createdAt: { gte: startOfDay } } }),
      db.approvalRequest.findMany({
        where: {
          status: APPROVAL_STATUS.PENDING,
          requestedById: { not: user.id },
        },
        include: { steps: true },
        orderBy: { createdAt: "desc" },
      }),
      db.approvalRequest.findMany({
        where: { requestedById: user.id },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

  const myPending = pendingAll
    .filter((r) => {
      const current = r.steps.find((s) => s.stepOrder === r.currentStep);
      if (!current || current.status !== "PENDING") return false;
      if (r.steps.some((s) => s.actedById === user.id)) return false;
      return isEligibleApprover(user, current);
    })
    .slice(0, 5);

  const stats = [
    { label: "User Aktif", value: activeUsers, href: "/settings/users" },
    { label: "Role", value: roleCount, href: "/settings/roles" },
    { label: "Approval Pending", value: pendingApprovals, href: "/approvals" },
    { label: "Aktivitas Audit Hari Ini", value: auditToday, href: "/audit-log" },
  ];

  return (
    <div className="crm-dashboard">
      <PageHeader
        title={`Selamat datang, ${user.name}`}
        subtitle="Ringkasan operasional PerumNet CRM"
      />

      <section className="crm-metric-grid" aria-label="Ringkasan sistem">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="crm-metric-card">
            <span className="crm-metric-icon">
              {s.label === "User Aktif" ? <UsersRound /> : s.label === "Role" ? <ShieldCheck /> : s.label === "Approval Pending" ? <ClipboardCheck /> : <Activity />}
            </span>
            <span>
              <strong>{s.value}</strong>
              <small>{s.label}</small>
            </span>
          </Link>
        ))}
      </section>

      <section className="crm-dashboard-panels">
        <div className="crm-panel">
          <div className="crm-panel-heading">
            <div><h2>Menunggu Keputusan Anda</h2><p>Approval aktif yang membutuhkan tindakan Anda.</p></div>
            <Link href="/approvals">
              Lihat semua <ArrowRight aria-hidden="true" />
            </Link>
          </div>
          {myPending.length === 0 ? (
            <EmptyState message="Tidak ada approval yang menunggu keputusan Anda." />
          ) : (
            <ul className="crm-activity-list">
              {myPending.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/approvals/${r.id}`}
                    className="crm-activity-row"
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

        <div className="crm-panel">
          <div className="crm-panel-heading">
            <div><h2>Pengajuan Saya</h2><p>Riwayat pengajuan terbaru yang Anda buat.</p></div>
            <Link href="/approvals/new">
              Ajukan baru <ArrowRight aria-hidden="true" />
            </Link>
          </div>
          {recentRequests.length === 0 ? (
            <EmptyState message="Belum ada pengajuan." />
          ) : (
            <ul className="crm-activity-list">
              {recentRequests.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/approvals/${r.id}`}
                    className="crm-activity-row"
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
      </section>
    </div>
  );
}
