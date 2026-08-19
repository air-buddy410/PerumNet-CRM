import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { initialsOf } from "@/lib/avatar";
import { birthdayHeadline } from "@/lib/birthday";
import { birthdaysToday } from "@/lib/birthday-service";
import { PERMISSIONS, APPROVAL_STATUS, formatDateTime } from "@/lib/constants";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { isEligibleApprover } from "@/lib/approval";
import { loadStatusSistem } from "@/lib/system-status-service";
import { loadRingkasanDashboard } from "@/lib/dashboard-service";
import { DashboardOverview } from "@/components/dashboard-overview";
import { SystemStatusSummaryCard } from "@/components/system-status-view";
import { ArrowRight } from "lucide-react";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requirePermission(PERMISSIONS.DASHBOARD_VIEW);

  const [summary, pendingAll, recentRequests, birthdays, systemStatus] = await Promise.all([
    loadRingkasanDashboard(),
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
    birthdaysToday(),
    loadStatusSistem().catch(() => null),
  ]);

  const myPending = pendingAll
    .filter((r) => {
      const current = r.steps.find((s) => s.stepOrder === r.currentStep);
      if (!current || current.status !== "PENDING") return false;
      if (r.steps.some((s) => s.actedById === user.id)) return false;
      return isEligibleApprover(user, current);
    })
    .slice(0, 5);

  return (
    <div className="crm-dashboard">
      <PageHeader
        title={`Selamat datang, ${user.name}`}
        subtitle="Ringkasan operasional PerumNet CRM"
      />

      <DashboardOverview
        summary={summary}
        canOpenNoc={user.permissions.has(PERMISSIONS.NOC_VIEW)}
      />

      <div className="mt-[15px]">
        <SystemStatusSummaryCard
          status={systemStatus}
          canOpen={user.permissions.has(PERMISSIONS.NOC_VIEW)}
        />
      </div>

      {birthdays.length > 0 && (
        <section className="crm-panel crm-birthday-panel" aria-labelledby="birthday-panel-title">
          <div className="crm-panel-heading">
            <div>
              <h2 id="birthday-panel-title">{birthdayHeadline(birthdays)}</h2>
              <p>Ucapan untuk rekan yang berulang tahun hari ini.</p>
            </div>
          </div>
          <ul className="crm-birthday-list">
            {birthdays.map((person) => (
              <li key={person.employeeId} className="crm-birthday-row">
                <div className="crm-birthday-avatar" aria-hidden={person.avatarUrl ? undefined : true}>
                  {person.avatarUrl ? (
                    <img src={person.avatarUrl} alt={`Foto profil ${person.fullName}`} />
                  ) : (
                    <span>{initialsOf(person.fullName)}</span>
                  )}
                </div>
                <div className="crm-birthday-copy">
                  <strong>{person.fullName}</strong>
                  <span>{[person.jobTitle, person.divisionName].filter(Boolean).join(" · ") || "Rekan PerumNet"}</span>
                  <p>{person.greeting}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

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
