import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, statusLabel } from "@/lib/constants";
import { PageHeader, Badge, EmptyState, Flash } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams, type TableSortOption } from "@/components/table-controls";

export const metadata = { title: "Customers" };
const sortOptions: readonly TableSortOption[] = [
  { value: "createdAt", label: "Terbaru" },
  { value: "customerNumber", label: "Nomor" },
  { value: "name", label: "Nama" },
  { value: "status", label: "Status" },
];

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  await requirePermission(PERMISSIONS.CUSTOMERS_VIEW);
  const sp = await searchParams;
  const table = parseTableQuery(sp, { defaultSort: "createdAt", defaultDirection: "desc", sortOptions });
  const where: Prisma.CustomerWhereInput | undefined = table.query.q
    ? {
        OR: [
          { name: { contains: table.query.q } },
          { customerNumber: { contains: table.query.q } },
          { phone: { contains: table.query.q } },
        ],
      }
    : undefined;
  const orderBy: Prisma.CustomerOrderByWithRelationInput[] = table.sort === "customerNumber"
    ? [{ customerNumber: table.direction }, { id: "asc" }]
    : table.sort === "name"
      ? [{ name: table.direction }, { id: "asc" }]
      : table.sort === "status"
        ? [{ status: table.direction }, { id: "asc" }]
        : [{ createdAt: table.direction }, { id: "asc" }];

  const [customers, total] = await Promise.all([
    db.customer.findMany({
      where,
      include: { area: true, salesOwner: true, _count: { select: { subscriptions: true } } },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.customer.count({ where }),
  ]);

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Pelanggan berasal dari konversi lead (dengan quotation Accepted) — traceability Lead → Customer terjaga."
        action={
          <a href="/api/export/customers" className="btn-secondary">
            Unduh CSV
          </a>
        }
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      <form method="GET" className="mb-4 flex items-end gap-3">
        <div className="w-72">
          <label className="label" htmlFor="q">Cari</label>
          <input
            id="q"
            name="q"
            className="input"
            placeholder="Nama / nomor / telepon"
            defaultValue={table.query.q ?? ""}
          />
        </div>
        <button type="submit" className="btn-secondary">Cari</button>
      </form>

      <div className="card overflow-x-auto">
        {customers.length === 0 ? (
          <EmptyState message="Belum ada customer. Konversi lead dengan quotation Accepted untuk membuat customer." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th"><SortableTableHeader basePath="/crm/customers" currentDirection={table.direction} currentSort={table.sort} label="Nomor" query={table.query} sortKey="customerNumber" /></th>
                <th className="th"><SortableTableHeader basePath="/crm/customers" currentDirection={table.direction} currentSort={table.sort} label="Nama" query={table.query} sortKey="name" /></th>
                <th className="th">Jenis</th>
                <th className="th">Telepon</th>
                <th className="th">Area</th>
                <th className="th">Sales Owner</th>
                <th className="th">Subscription</th>
                <th className="th"><SortableTableHeader basePath="/crm/customers" currentDirection={table.direction} currentSort={table.sort} label="Status" query={table.query} sortKey="status" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="td">
                    <Link
                      href={`/crm/customers/${c.id}`}
                      className="font-medium text-brand-600 hover:underline"
                    >
                      {c.customerNumber}
                    </Link>
                  </td>
                  <td className="td">
                    <div className="font-medium">{c.name}</div>
                    {c.company && <div className="text-xs text-slate-500">{c.company}</div>}
                  </td>
                  <td className="td text-xs">{statusLabel(c.customerType)}</td>
                  <td className="td whitespace-nowrap">{c.phone}</td>
                  <td className="td text-xs">{c.area?.name ?? "-"}</td>
                  <td className="td text-xs">{c.salesOwner?.name ?? "-"}</td>
                  <td className="td">{c._count.subscriptions}</td>
                  <td className="td">
                    <Badge value={c.status} label={statusLabel(c.status)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <TableControls basePath="/crm/customers" direction={table.direction} page={table.page} pageSize={table.pageSize} query={table.query} sort={table.sort} sortOptions={sortOptions} total={total} />
    </div>
  );
}
