import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  SUBSCRIPTION_STATUSES,
  statusLabel,
  formatRupiah,
  formatDateTime,
} from "@/lib/constants";
import { PageHeader, Badge, EmptyState, Flash } from "@/components/ui";
import {
  parseTableQuery,
  SortableTableHeader,
  TableControls,
  type TableSearchParams,
  type TableSortOption,
} from "@/components/table-controls";

export const metadata = { title: "Subscriptions" };

const sortOptions: readonly TableSortOption[] = [
  { value: "createdAt", label: "Tanggal dibuat" },
  { value: "serviceNumber", label: "Service ID" },
  { value: "status", label: "Status" },
];

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  await requirePermission(PERMISSIONS.SUBSCRIPTIONS_VIEW);
  const sp = await searchParams;
  const table = parseTableQuery(sp, {
    defaultSort: "createdAt",
    defaultDirection: "desc",
    sortOptions,
  });
  const where = table.query.status ? { status: table.query.status } : undefined;
  const orderBy: Prisma.SubscriptionOrderByWithRelationInput[] = table.sort === "serviceNumber"
    ? [{ serviceNumber: table.direction }, { id: "asc" }]
    : table.sort === "status"
      ? [{ status: table.direction }, { id: "asc" }]
      : [{ createdAt: table.direction }, { id: "asc" }];

  const [subscriptions, total] = await Promise.all([
    db.subscription.findMany({
      where,
      include: { customer: true, package: true },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.subscription.count({ where }),
  ]);

  return (
    <div>
      <PageHeader
        title="Subscriptions"
        subtitle="Aktivasi layanan dilakukan oleh petugas yang memiliki izin aktivasi."
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      <form method="GET" className="mb-4 flex items-end gap-3">
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" className="input w-56" defaultValue={table.query.status ?? ""}>
            <option value="">Semua status</option>
            {SUBSCRIPTION_STATUSES.map((s) => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        {subscriptions.length === 0 ? (
          <EmptyState message="Belum ada subscription." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th"><SortableTableHeader basePath="/crm/subscriptions" currentDirection={table.direction} currentSort={table.sort} label="Service ID" query={table.query} sortKey="serviceNumber" /></th>
                <th className="th">Customer</th>
                <th className="th">Paket</th>
                <th className="th">Harga/bln</th>
                <th className="th">PPPoE</th>
                <th className="th">Aktivasi</th>
                <th className="th"><SortableTableHeader basePath="/crm/subscriptions" currentDirection={table.direction} currentSort={table.sort} label="Status" query={table.query} sortKey="status" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {subscriptions.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="td">
                    <Link
                      href={`/crm/subscriptions/${s.id}`}
                      className="font-medium text-brand-600 hover:underline"
                    >
                      {s.serviceNumber}
                    </Link>
                  </td>
                  <td className="td">{s.customer.name}</td>
                  <td className="td text-xs">
                    {s.package.name} ({s.downloadMbps}/{s.uploadMbps} Mbps)
                  </td>
                  <td className="td whitespace-nowrap">{formatRupiah(s.monthlyPrice)}</td>
                  <td className="td text-xs">{s.pppoeUsername ?? "-"}</td>
                  <td className="td whitespace-nowrap text-xs">
                    {s.activatedAt ? formatDateTime(s.activatedAt) : "-"}
                  </td>
                  <td className="td">
                    <Badge value={s.status} label={statusLabel(s.status)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <TableControls
        basePath="/crm/subscriptions"
        direction={table.direction}
        page={table.page}
        pageSize={table.pageSize}
        query={table.query}
        sort={table.sort}
        sortOptions={sortOptions}
        total={total}
      />
    </div>
  );
}
