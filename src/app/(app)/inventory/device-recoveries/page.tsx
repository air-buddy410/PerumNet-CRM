import Link from "next/link";
import { Prisma } from "@prisma/client";
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
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams, type TableSortOption } from "@/components/table-controls";

export const metadata = { title: "Penarikan Perangkat" };
const sortOptions: readonly TableSortOption[] = [
  { value: "slaDueAt", label: "Batas SLA" },
  { value: "createdAt", label: "Terbaru" },
  { value: "recoveryNumber", label: "Nomor" },
  { value: "status", label: "Status" },
];

export default async function DeviceRecoveriesPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  const sp = await searchParams;
  const table = parseTableQuery(sp, { defaultSort: "slaDueAt", defaultDirection: "asc", sortOptions });
  const now = new Date();
  const query = table.query.q?.trim();
  const canViewAll = [
    PERMISSIONS.RECOVERY_ASSIGN,
    PERMISSIONS.RECOVERY_RECEIVE,
    PERMISSIONS.RECOVERY_INSPECT,
    PERMISSIONS.RECOVERY_ESCALATE,
  ].some((permission) => user.permissions.has(permission));
  const scopedToTechnician = !canViewAll;

  const technicians = canViewAll
    ? await db.user.findMany({
        where: { isActive: true, roles: { some: { role: { code: "technician" } } } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  const where: Prisma.DeviceRecoveryIssueWhereInput = {
      ...(table.query.status ? { status: table.query.status } : {}),
      ...(table.query.overdue === "1"
        ? {
            slaDueAt: { lte: now },
            status: { notIn: ["COMPLETED", "CLOSED_UNRECOVERED"] },
          }
        : {}),
      ...(scopedToTechnician
        ? { OR: [{ assigneeId: user.id }, { workOrder: { technicianId: user.id } }] }
        : table.query.technician
          ? { OR: [{ assigneeId: table.query.technician }, { workOrder: { technicianId: table.query.technician } }] }
          : {}),
      ...(query
        ? {
            AND: [{
              OR: [
                { recoveryNumber: { contains: query, mode: "insensitive" } },
                { termination: { customer: { name: { contains: query, mode: "insensitive" } } } },
                { termination: { customer: { phone: { contains: query, mode: "insensitive" } } } },
                { termination: { subscription: { serviceNumber: { contains: query, mode: "insensitive" } } } },
                { items: { some: { snapshotSerial: { contains: query, mode: "insensitive" } } } },
                { items: { some: { actualSerial: { contains: query, mode: "insensitive" } } } },
                { items: { some: { actualMac: { contains: query, mode: "insensitive" } } } },
              ],
            }] as const,
          }
        : {}),
    };
  const orderBy: Prisma.DeviceRecoveryIssueOrderByWithRelationInput[] = table.sort === "createdAt"
    ? [{ createdAt: table.direction }, { id: "asc" }]
    : table.sort === "recoveryNumber"
      ? [{ recoveryNumber: table.direction }, { id: "asc" }]
      : table.sort === "status"
        ? [{ status: table.direction }, { id: "asc" }]
        : [{ slaDueAt: table.direction }, { id: "asc" }];

  const [recoveries, total] = await Promise.all([
    db.deviceRecoveryIssue.findMany({
    where,
    include: {
      termination: {
        include: {
          customer: { select: { name: true } },
          subscription: { select: { serviceNumber: true } },
        },
      },
      assignee: { select: { name: true } },
      items: { select: { status: true, snapshotSerial: true, actualSerial: true, actualMac: true, mismatchNote: true } },
    },
    orderBy,
    skip: (table.page - 1) * table.pageSize,
    take: table.pageSize,
  }),
    db.deviceRecoveryIssue.count({ where }),
  ]);

  const overdueCount = recoveries.filter((r) => isOverdue(r, now)).length;
  const completedCount = recoveries.filter((r) => ["COMPLETED", "CLOSED_UNRECOVERED"].includes(r.status)).length;
  const mismatchCount = recoveries.reduce(
    (total, recovery) => total + recovery.items.filter((item) => Boolean(item.mismatchNote)).length,
    0,
  );

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
      <Flash ok={table.query.ok} error={table.query.error} />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card p-4"><span className="text-xs text-slate-500">Ditampilkan</span><strong className="mt-1 block text-xl">{recoveries.length}</strong></div>
        <div className="card p-4"><span className="text-xs text-slate-500">Selesai</span><strong className="mt-1 block text-xl text-emerald-700">{completedCount}</strong></div>
        <div className="card p-4"><span className="text-xs text-slate-500">Lewat SLA</span><strong className="mt-1 block text-xl text-amber-700">{overdueCount}</strong></div>
        <div className="card p-4"><span className="text-xs text-slate-500">Mismatch</span><strong className="mt-1 block text-xl text-rose-700">{mismatchCount}</strong></div>
      </div>

      {overdueCount > 0 && table.query.overdue !== "1" && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {overdueCount} penarikan melewati batas SLA.{" "}
            <Link href={"/inventory/device-recoveries?overdue=1"} className="font-semibold underline">
            Lihat saja yang terlambat
          </Link>
        </div>
      )}

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label className="label" htmlFor="q">Cari recovery, pelanggan, serial, atau MAC</label>
          <input id="q" name="q" className="input" defaultValue={table.query.q ?? ""} placeholder="Contoh: DRI-, pelanggan, SN, MAC" />
        </div>
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" className="input w-56" defaultValue={table.query.status ?? ""}>
            <option value="">Semua status</option>
            {RECOVERY_STATUSES.map((s) => (
              <option key={s} value={s}>{recoveryStatusLabel(s)}</option>
            ))}
          </select>
        </div>
        {canViewAll && (
          <div>
            <label className="label" htmlFor="technician">Teknisi</label>
            <select id="technician" name="technician" className="input w-56" defaultValue={table.query.technician ?? ""}>
              <option value="">Semua teknisi</option>
              {technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}
            </select>
          </div>
        )}
        {scopedToTechnician && <span className="text-xs text-slate-500">Menampilkan tugas yang ditugaskan kepada Anda.</span>}
        <button type="submit" className="btn-secondary">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        {recoveries.length === 0 ? (
          <EmptyState message="Belum ada penarikan perangkat." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th"><SortableTableHeader basePath="/inventory/device-recoveries" currentDirection={table.direction} currentSort={table.sort} label="Nomor" query={table.query} sortKey="recoveryNumber" /></th>
                <th className="th">Pelanggan</th>
                <th className="th">Teknisi</th>
                <th className="th">Perangkat</th>
                <th className="th">Mismatch</th>
                <th className="th"><SortableTableHeader basePath="/inventory/device-recoveries" currentDirection={table.direction} currentSort={table.sort} label="Batas SLA" query={table.query} sortKey="slaDueAt" /></th>
                <th className="th"><SortableTableHeader basePath="/inventory/device-recoveries" currentDirection={table.direction} currentSort={table.sort} label="Status" query={table.query} sortKey="status" /></th>
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
                    <td className="td text-xs">
                      {r.items.filter((item) => Boolean(item.mismatchNote)).length || "—"}
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
      <TableControls basePath="/inventory/device-recoveries" direction={table.direction} page={table.page} pageSize={table.pageSize} query={table.query} sort={table.sort} sortOptions={sortOptions} total={total} />
    </div>
  );
}
