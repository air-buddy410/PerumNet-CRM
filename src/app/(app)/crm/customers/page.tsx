import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { redactCustomers } from "@/lib/customer-pii";
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

const CUSTOMER_STATUSES = [
  ["", "Semua status"],
  ["ACTIVE", "Aktif"],
  ["INACTIVE", "Nonaktif"],
] as const;

const PPPOE_FILTERS = [
  ["", "Semua username PPPoE"],
  ["has", "Sudah punya username"],
  ["missing", "Belum punya username"],
] as const;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.CUSTOMERS_VIEW);
  const sp = await searchParams;
  const table = parseTableQuery(sp, { defaultSort: "createdAt", defaultDirection: "desc", sortOptions });
  const status = CUSTOMER_STATUSES.some(([value]) => value === table.query.status)
    ? table.query.status
    : "";
  const pppoe = PPPOE_FILTERS.some(([value]) => value === table.query.pppoe)
    ? table.query.pppoe
    : "";
  const subscriptionWhere: Prisma.SubscriptionWhereInput = {};
  if (table.query.packageId) subscriptionWhere.packageId = table.query.packageId;
  if (table.query.odpId) subscriptionWhere.odpPort = { is: { odpId: table.query.odpId } };
  if (pppoe === "has") subscriptionWhere.pppoeUsername = { not: null };
  if (pppoe === "missing") {
    subscriptionWhere.OR = [{ pppoeUsername: null }, { pppoeUsername: "" }];
  }

  const whereParts: Prisma.CustomerWhereInput[] = [];
  if (table.query.q) {
    whereParts.push({
      OR: [
        { name: { contains: table.query.q } },
        { customerNumber: { contains: table.query.q } },
        { phone: { contains: table.query.q } },
      ],
    });
  }
  if (status) whereParts.push({ status });
  if (Object.keys(subscriptionWhere).length > 0) {
    whereParts.push({ subscriptions: { some: subscriptionWhere } });
  }
  const where: Prisma.CustomerWhereInput | undefined = whereParts.length > 0
    ? { AND: whereParts }
    : undefined;
  const orderBy: Prisma.CustomerOrderByWithRelationInput[] = table.sort === "customerNumber"
    ? [{ customerNumber: table.direction }, { id: "asc" }]
    : table.sort === "name"
      ? [{ name: table.direction }, { id: "asc" }]
      : table.sort === "status"
        ? [{ status: table.direction }, { id: "asc" }]
        : [{ createdAt: table.direction }, { id: "asc" }];

  const [rawCustomers, total, packages, odps] = await Promise.all([
    db.customer.findMany({
      where,
      include: { area: true, salesOwner: true, _count: { select: { subscriptions: true } } },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.customer.count({ where }),
    db.package.findMany({
      where: { isActive: true },
      select: { id: true, name: true, downloadMbps: true, uploadMbps: true },
      orderBy: { name: "asc" },
    }),
    db.odp.findMany({
      where: { status: { not: "INACTIVE" } },
      select: { id: true, code: true, role: true },
      orderBy: { code: "asc" },
    }),
  ]);

  // Penyamaran di JALUR DATA, bukan di JSX. Bentuknya tidak berubah, jadi
  // tabel di bawah tidak perlu tahu apa pun soal izin PII — dan kolom baru
  // yang ditambahkan nanti ikut aman tanpa ada yang perlu mengingatnya.
  const customers = redactCustomers(rawCustomers, user.permissions.has(PERMISSIONS.CUSTOMERS_PII_VIEW));

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Kelola data pelanggan, layanan aktif, dan kesiapan pemantauan PPPoE."
        action={
          <a href="/api/export/customers" className="btn-secondary">
            Unduh CSV
          </a>
        }
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      <form method="GET" className="card mb-5 grid min-w-0 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-[minmax(16rem,1.6fr)_minmax(10rem,1fr)_minmax(12rem,1.2fr)_minmax(12rem,1.2fr)_auto] xl:items-end">
        <input type="hidden" name="page" value="1" />
        <input type="hidden" name="pageSize" value={table.pageSize} />
        <input type="hidden" name="sort" value={table.sort} />
        <input type="hidden" name="direction" value={table.direction} />
        <div className="min-w-0">
          <label className="label" htmlFor="q">Cari customer</label>
          <input
            id="q"
            name="q"
            className="input"
            placeholder="Nama / nomor / telepon"
            defaultValue={table.query.q ?? ""}
          />
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" className="input" defaultValue={status}>
            {CUSTOMER_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="packageId">Paket</label>
          <select id="packageId" name="packageId" className="input" defaultValue={table.query.packageId ?? ""}>
            <option value="">Semua paket</option>
            {packages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.name} ({pkg.downloadMbps}/{pkg.uploadMbps} Mbps)
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="odpId">ODP</label>
          <select id="odpId" name="odpId" className="input" defaultValue={table.query.odpId ?? ""}>
            <option value="">Semua ODP</option>
            {odps.map((odp) => (
              <option key={odp.id} value={odp.id}>{odp.code}{odp.role === "MS" ? " · MS" : ""}</option>
            ))}
          </select>
        </div>
        <div className="min-w-0 sm:col-span-2 xl:col-span-1">
          <label className="label" htmlFor="pppoe">PPPoE</label>
          <div className="flex gap-2">
            <select id="pppoe" name="pppoe" className="input min-w-0" defaultValue={pppoe}>
              {PPPOE_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button type="submit" className="btn-secondary shrink-0">Terapkan</button>
          </div>
        </div>
      </form>

      <div className="card overflow-x-auto">
        {customers.length === 0 ? (
          <EmptyState message="Belum ada customer. Konversi lead dengan quotation Accepted untuk membuat customer." />
        ) : (
          <table className="w-full min-w-[880px]">
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
