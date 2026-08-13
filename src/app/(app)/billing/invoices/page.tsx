import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, INVOICE_TYPES, INVOICE_STATUSES, formatRupiah, formatDateTime, statusLabel } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams, type TableSortOption } from "@/components/table-controls";

export const metadata = { title: "Invoices" };

const invoiceStatusLabel = (s: string) => (s === "OPEN" ? "Belum Dibayar" : statusLabel(s));
const sortOptions: readonly TableSortOption[] = [
  { value: "createdAt", label: "Tanggal dibuat" },
  { value: "invoiceNumber", label: "Nomor" },
  { value: "dueAt", label: "Jatuh tempo" },
  { value: "status", label: "Status" },
];

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.BILLING_VIEW);
  const sp = await searchParams;
  const table = parseTableQuery(sp, { defaultSort: "createdAt", defaultDirection: "desc", sortOptions });
  const canCreate = user.permissions.has(PERMISSIONS.INVOICES_CREATE);
  const where = {
    ...(table.query.status ? { status: table.query.status } : {}),
    ...(table.query.period ? { period: table.query.period } : {}),
    ...(table.query.type ? { type: table.query.type } : {}),
  };
  const orderBy: Prisma.InvoiceOrderByWithRelationInput[] = table.sort === "invoiceNumber"
    ? [{ invoiceNumber: table.direction }, { id: "asc" }]
    : table.sort === "dueAt"
      ? [{ dueAt: table.direction }, { id: "asc" }]
      : table.sort === "status"
        ? [{ status: table.direction }, { id: "asc" }]
        : [{ createdAt: table.direction }, { id: "asc" }];

  const [invoices, total] = await Promise.all([
    db.invoice.findMany({
      where,
      include: { customer: true, subscription: true },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.invoice.count({ where }),
  ]);
  const typeLabel = (t: string) => INVOICE_TYPES.find(([v]) => v === t)?.[1] ?? t;

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle="Kelola tagihan pelanggan. Invoice yang terbit tidak dapat diedit; koreksi dilakukan dengan void dan invoice pengganti."
        action={
          canCreate ? (
            <Link href="/billing/invoices/new" className="btn-primary">
              Invoice Manual
            </Link>
          ) : undefined
        }
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" className="input w-44" defaultValue={table.query.status ?? ""}>
            <option value="">Semua status</option>
            {INVOICE_STATUSES.map((s) => (
              <option key={s} value={s}>{invoiceStatusLabel(s)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="type">Jenis</label>
          <select id="type" name="type" className="input w-44" defaultValue={table.query.type ?? ""}>
            <option value="">Semua jenis</option>
            {INVOICE_TYPES.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="period">Periode</label>
          <input id="period" name="period" type="month" className="input w-44" defaultValue={table.query.period ?? ""} />
        </div>
        <button type="submit" className="btn-secondary">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        {invoices.length === 0 ? (
          <EmptyState message="Tidak ada invoice pada filter ini." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th"><SortableTableHeader basePath="/billing/invoices" currentDirection={table.direction} currentSort={table.sort} label="Nomor" query={table.query} sortKey="invoiceNumber" /></th>
                <th className="th">Pelanggan</th>
                <th className="th">Jenis</th>
                <th className="th">Periode</th>
                <th className="th">Total</th>
                <th className="th">Dibayar</th>
                <th className="th"><SortableTableHeader basePath="/billing/invoices" currentDirection={table.direction} currentSort={table.sort} label="Jatuh Tempo" query={table.query} sortKey="dueAt" /></th>
                <th className="th"><SortableTableHeader basePath="/billing/invoices" currentDirection={table.direction} currentSort={table.sort} label="Status" query={table.query} sortKey="status" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map((inv) => {
                const overdue = ["OPEN", "PARTIAL"].includes(inv.status) && inv.dueAt < new Date();
                return (
                  <tr key={inv.id} className={overdue ? "bg-red-50/40" : "hover:bg-slate-50"}>
                    <td className="td whitespace-nowrap font-mono text-xs">
                      <Link href={`/billing/invoices/${inv.id}`} className="font-medium text-brand-600 hover:underline">
                        {inv.invoiceNumber}
                      </Link>
                    </td>
                    <td className="td whitespace-nowrap text-xs font-medium">{inv.customer.name}</td>
                    <td className="td whitespace-nowrap text-xs">{typeLabel(inv.type)}</td>
                    <td className="td font-mono text-xs">{inv.period ?? "-"}</td>
                    <td className="td whitespace-nowrap text-xs font-medium">{formatRupiah(inv.totalAmount)}</td>
                    <td className="td whitespace-nowrap text-xs">{formatRupiah(inv.paidAmount)}</td>
                    <td className="td whitespace-nowrap text-xs">
                      <span className={overdue ? "font-semibold text-red-600" : ""}>
                        {formatDateTime(inv.dueAt)}
                      </span>
                    </td>
                    <td className="td">
                      <Badge value={inv.status} label={invoiceStatusLabel(inv.status)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <TableControls basePath="/billing/invoices" direction={table.direction} page={table.page} pageSize={table.pageSize} query={table.query} sort={table.sort} sortOptions={sortOptions} total={total} />
    </div>
  );
}
