import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  RECOVERY_STATUSES,
  recoveryStatusLabel,
  formatDateTime,
} from "@/lib/constants";
import { isOverdue } from "@/lib/recovery";
import { PageHeader, Badge, EmptyState, Flash } from "@/components/ui";

export const metadata = { title: "Penarikan Perangkat" };

export default async function DeviceRecoveriesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; status?: string; overdue?: string }>;
}) {
  await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  const sp = await searchParams;
  const now = new Date();

  const recoveries = await db.deviceRecoveryIssue.findMany({
    where: {
      ...(sp.status ? { status: sp.status } : {}),
      ...(sp.overdue === "1"
        ? {
            slaDueAt: { lte: now },
            status: { notIn: ["COMPLETED", "CLOSED_UNRECOVERED"] },
          }
        : {}),
    },
    include: {
      termination: {
        include: {
          customer: { select: { name: true } },
          subscription: { select: { serviceNumber: true } },
        },
      },
      assignee: { select: { name: true } },
      items: { select: { status: true } },
    },
    orderBy: [{ slaDueAt: "asc" }, { createdAt: "desc" }],
    take: 100,
  });

  const overdueCount = recoveries.filter((r) => isOverdue(r, now)).length;

  return (
    <div>
      <PageHeader
        title="Penarikan Perangkat"
        subtitle="Perangkat hasil penarikan selalu masuk karantina dulu — tidak pernah langsung menambah stok tersedia."
        action={
          <Link href="/inventory/device-recoveries/report" className="btn-secondary">
            Laporan & KPI
          </Link>
        }
      />
      <Flash ok={sp.ok} error={sp.error} />

      {overdueCount > 0 && sp.overdue !== "1" && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {overdueCount} penarikan melewati batas SLA.{" "}
          <Link href="/inventory/device-recoveries?overdue=1" className="font-semibold underline">
            Lihat saja yang terlambat
          </Link>
        </div>
      )}

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" className="input w-56" defaultValue={sp.status ?? ""}>
            <option value="">Semua status</option>
            {RECOVERY_STATUSES.map((s) => (
              <option key={s} value={s}>{recoveryStatusLabel(s)}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        {recoveries.length === 0 ? (
          <EmptyState message="Belum ada penarikan perangkat." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Nomor</th>
                <th className="th">Pelanggan</th>
                <th className="th">Teknisi</th>
                <th className="th">Perangkat</th>
                <th className="th">Batas SLA</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recoveries.map((r) => {
                const done = r.items.filter((i) =>
                  ["RECEIVED", "INSPECTED", "NOT_RETURNED"].includes(i.status)
                ).length;
                const late = isOverdue(r, now);
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="td">
                      <Link
                        href={`/inventory/device-recoveries/${r.id}`}
                        className="font-semibold text-brand-600 hover:underline"
                      >
                        {r.recoveryNumber}
                      </Link>
                    </td>
                    <td className="td text-sm">
                      {r.termination.customer.name}
                      <span className="block font-mono text-xs text-slate-400">
                        {r.termination.subscription.serviceNumber}
                      </span>
                    </td>
                    <td className="td text-xs">{r.assignee?.name ?? "—"}</td>
                    <td className="td text-xs">
                      {done}/{r.items.length}
                    </td>
                    <td className={`td text-xs ${late ? "font-semibold text-amber-700" : ""}`}>
                      {r.slaDueAt ? formatDateTime(r.slaDueAt) : "—"}
                      {late ? " · terlambat" : ""}
                    </td>
                    <td className="td">
                      <Badge value={r.status} label={recoveryStatusLabel(r.status)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
