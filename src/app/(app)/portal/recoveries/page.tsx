import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, recoveryStatusLabel, formatDateTime, statusLabel } from "@/lib/constants";
import { isOverdue } from "@/lib/recovery";
import { PageHeader, Badge, EmptyState } from "@/components/ui";

export const metadata = { title: "Penarikan Saya" };

export default async function TechnicianRecoveryPortal({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.RECOVERY_PICKUP);
  const sp = await searchParams;
  const now = new Date();
  const recoveries = await db.deviceRecoveryIssue.findMany({
    where: {
      ...(sp.status ? { status: sp.status } : {}),
      OR: [{ assigneeId: user.id }, { workOrder: { technicianId: user.id } }],
    },
    include: {
      termination: {
        include: {
          customer: { select: { name: true, address: true } },
          subscription: { select: { serviceNumber: true } },
        },
      },
      workOrder: { select: { technicianId: true, scheduledAt: true } },
      items: { select: { status: true } },
    },
    orderBy: [{ scheduledAt: "asc" }, { slaDueAt: "asc" }, { createdAt: "desc" }],
    take: 100,
  });

  return (
    <div className="crm-portal-page">
      <PageHeader
        title="Penarikan Saya"
        subtitle="Daftar tugas perangkat yang ditugaskan kepada Anda. Catat kunjungan dan hasil lapangan dari perangkat mobile."
        action={<Link href="/portal" className="btn-secondary">Portal Material</Link>}
      />

      <form method="get" className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label" htmlFor="status">Status tugas</label>
          <select id="status" name="status" className="input" defaultValue={sp.status ?? ""}>
            <option value="">Semua status</option>
            {["OPEN", "ASSIGNED", "IN_PROGRESS", "PARTIAL", "RECOVERED", "INSPECTION", "COMPLETED", "CLOSED_UNRECOVERED"].map((value) => (
              <option key={value} value={value}>{recoveryStatusLabel(value)}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">Filter</button>
      </form>

      {recoveries.length === 0 ? (
        <div className="card"><EmptyState message="Belum ada penarikan yang ditugaskan kepada Anda." /></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {recoveries.map((recovery) => {
            const done = recovery.items.filter((item) => ["PICKED_UP", "RECEIVED", "INSPECTED", "NOT_RETURNED"].includes(item.status)).length;
            const overdue = isOverdue(recovery, now);
            return (
              <Link key={recovery.id} href={`/portal/recoveries/${recovery.id}`} className="card crm-recovery-portal-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><strong className="block truncate text-brand-700">{recovery.recoveryNumber}</strong><span className="block truncate text-xs text-slate-500">{recovery.termination.subscription.serviceNumber}</span></div>
                  <Badge value={recovery.status} label={recoveryStatusLabel(recovery.status)} />
                </div>
                <h2 className="mt-4 truncate text-base font-semibold text-slate-800">{recovery.termination.customer.name}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-slate-500">{recovery.termination.customer.address}</p>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div><dt className="text-slate-400">Jadwal</dt><dd className="mt-1 text-slate-700">{recovery.scheduledAt ? formatDateTime(recovery.scheduledAt) : "Belum dijadwalkan"}</dd></div>
                  <div><dt className="text-slate-400">SLA</dt><dd className={overdue ? "mt-1 font-semibold text-rose-700" : "mt-1 text-slate-700"}>{recovery.slaDueAt ? formatDateTime(recovery.slaDueAt) : "—"}</dd></div>
                </dl>
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                  <span className="text-slate-500">Progress perangkat</span><strong className="text-slate-700">{done}/{recovery.items.length} selesai</strong>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
