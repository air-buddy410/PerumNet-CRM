import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  WO_STATUSES,
  statusLabel,
  formatDateTime,
} from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams, type TableSortOption } from "@/components/table-controls";

export const metadata = { title: "Work Orders" };
const sortOptions: readonly TableSortOption[] = [
  { value: "createdAt", label: "Terbaru" },
  { value: "woNumber", label: "Nomor" },
  { value: "scheduledAt", label: "Jadwal" },
  { value: "status", label: "Status" },
];

export default async function WorkOrdersPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.WORK_ORDERS_VIEW);
  const sp = await searchParams;
  const table = parseTableQuery(sp, { defaultSort: "createdAt", defaultDirection: "desc", sortOptions });
  const canCreate = user.permissions.has(PERMISSIONS.WORK_ORDERS_CREATE);

  // Teknisi tanpa izin luas hanya melihat WO miliknya.
  const technicianOnly =
    user.permissions.has(PERMISSIONS.WORK_ORDERS_EXECUTE) &&
    !user.permissions.has(PERMISSIONS.WORK_ORDERS_CREATE) &&
    !user.permissions.has(PERMISSIONS.WORK_ORDERS_CLOSE) &&
    !user.roles.some((r) => ["super_admin", "management"].includes(r.code));

  const where: Prisma.WorkOrderWhereInput = {
      ...(table.query.status ? { status: table.query.status } : {}),
      ...(technicianOnly || table.query.mine === "1" ? { technicianId: user.id } : {}),
  };
  const orderBy: Prisma.WorkOrderOrderByWithRelationInput[] = table.sort === "woNumber"
    ? [{ woNumber: table.direction }, { id: "asc" }]
    : table.sort === "scheduledAt"
      ? [{ scheduledAt: table.direction }, { id: "asc" }]
      : table.sort === "status"
        ? [{ status: table.direction }, { id: "asc" }]
        : [{ createdAt: table.direction }, { id: "asc" }];

  const [workOrders, total] = await Promise.all([
    db.workOrder.findMany({
    where,
    include: { customer: true, technician: true, createdBy: true },
    orderBy,
    skip: (table.page - 1) * table.pageSize,
    take: table.pageSize,
  }),
    db.workOrder.count({ where }),
  ]);

  return (
    <div>
      <PageHeader
        title="Work Orders"
        subtitle="Work order ditutup setelah material dipertanggungjawabkan, bukti foto tersedia, dan pelanggan mengonfirmasi."
        action={
          canCreate ? (
            <Link href="/operations/work-orders/new" className="btn-primary">
              + Work Order
            </Link>
          ) : undefined
        }
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" className="input w-48" defaultValue={table.query.status ?? ""}>
            <option value="">Semua status</option>
            {WO_STATUSES.map((s) => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
        </div>
        {!technicianOnly && (
          <div>
            <label className="label" htmlFor="mine">Teknisi</label>
            <select id="mine" name="mine" className="input w-40" defaultValue={table.query.mine ?? ""}>
              <option value="">Semua</option>
              <option value="1">Milik saya</option>
            </select>
          </div>
        )}
        <button type="submit" className="btn-secondary">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        {workOrders.length === 0 ? (
          <EmptyState message="Tidak ada work order." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th"><SortableTableHeader basePath="/operations/work-orders" currentDirection={table.direction} currentSort={table.sort} label="Nomor" query={table.query} sortKey="woNumber" /></th>
                <th className="th">Jenis</th>
                <th className="th">Customer / Alamat</th>
                <th className="th">Teknisi</th>
                <th className="th"><SortableTableHeader basePath="/operations/work-orders" currentDirection={table.direction} currentSort={table.sort} label="Jadwal" query={table.query} sortKey="scheduledAt" /></th>
                <th className="th"><SortableTableHeader basePath="/operations/work-orders" currentDirection={table.direction} currentSort={table.sort} label="Status" query={table.query} sortKey="status" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {workOrders.map((wo) => (
                <tr key={wo.id} className="hover:bg-slate-50">
                  <td className="td whitespace-nowrap">
                    <Link
                      href={`/operations/work-orders/${wo.id}`}
                      className="font-medium text-brand-600 hover:underline"
                    >
                      {wo.woNumber}
                    </Link>
                  </td>
                  <td className="td text-xs">{statusLabel(wo.type)}</td>
                  <td className="td">
                    <div className="text-xs font-medium">{wo.customer?.name ?? "-"}</div>
                    <div className="max-w-56 truncate text-xs text-slate-500">{wo.address}</div>
                  </td>
                  <td className="td text-xs">{wo.technician?.name ?? <span className="text-amber-600">Belum ada</span>}</td>
                  <td className="td whitespace-nowrap text-xs">
                    {wo.scheduledAt ? formatDateTime(wo.scheduledAt) : "-"}
                  </td>
                  <td className="td">
                    <Badge value={wo.status} label={statusLabel(wo.status)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <TableControls basePath="/operations/work-orders" direction={table.direction} page={table.page} pageSize={table.pageSize} query={table.query} sort={table.sort} sortOptions={sortOptions} total={total} />
    </div>
  );
}
