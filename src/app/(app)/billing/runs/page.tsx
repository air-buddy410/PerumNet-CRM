import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatRupiah, formatDateTime, statusLabel } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams, type TableSortOption } from "@/components/table-controls";
import { createInvoiceRunAction } from "../actions";

export const metadata = { title: "Invoice Runs" };
const sortOptions: readonly TableSortOption[] = [
  { value: "period", label: "Periode" },
  { value: "createdAt", label: "Dibuat" },
  { value: "status", label: "Status" },
];

export default async function InvoiceRunsPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.BILLING_VIEW);
  const sp = await searchParams;
  const table = parseTableQuery(sp, { defaultSort: "period", defaultDirection: "desc", sortOptions });
  const canCreate = user.permissions.has(PERMISSIONS.INVOICES_CREATE);
  const orderBy: Prisma.InvoiceRunOrderByWithRelationInput[] = table.sort === "createdAt"
    ? [{ createdAt: table.direction }, { id: "asc" }]
    : table.sort === "status"
      ? [{ status: table.direction }, { id: "asc" }]
      : [{ period: table.direction }, { id: "asc" }];

  const [runs, total] = await Promise.all([
    db.invoiceRun.findMany({
      include: { createdBy: true },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.invoiceRun.count(),
  ]);
  const now = new Date();
  const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  return (
    <div>
      <PageHeader
        title="Invoice Runs"
        subtitle="Proses tagihan bulanan yang aman dijalankan ulang tanpa menggandakan invoice."
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="card overflow-x-auto">
          {runs.length === 0 ? (
            <EmptyState message="Belum ada invoice run." />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                <th className="th"><SortableTableHeader basePath="/billing/runs" currentDirection={table.direction} currentSort={table.sort} label="Periode" query={table.query} sortKey="period" /></th>
                  <th className="th">Invoice</th>
                  <th className="th">Total</th>
                  <th className="th">Dibuat</th>
                  <th className="th">Diposting</th>
                <th className="th"><SortableTableHeader basePath="/billing/runs" currentDirection={table.direction} currentSort={table.sort} label="Status" query={table.query} sortKey="status" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="td font-mono text-xs">
                      <Link href={`/billing/runs/${r.id}`} className="font-medium text-brand-600 hover:underline">
                        {r.period}
                      </Link>
                    </td>
                    <td className="td">{r.totalCount}</td>
                    <td className="td whitespace-nowrap text-xs">{formatRupiah(r.totalAmount)}</td>
                    <td className="td whitespace-nowrap text-xs">{r.createdBy.name}</td>
                    <td className="td whitespace-nowrap text-xs">{r.postedAt ? formatDateTime(r.postedAt) : "-"}</td>
                    <td className="td"><Badge value={r.status} label={statusLabel(r.status)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <TableControls basePath="/billing/runs" direction={table.direction} page={table.page} pageSize={table.pageSize} query={table.query} sort={table.sort} sortOptions={sortOptions} total={total} />

        {canCreate && (
          <div className="card h-fit p-5">
            <h2 className="mb-1 font-medium">Run Baru</h2>
            <p className="mb-4 text-xs text-slate-500">
              Satu run per periode. Alur: buat → generate preview → periksa → posting.
            </p>
            <form action={createInvoiceRunAction} className="space-y-3">
              <div>
                <label className="label" htmlFor="period">Periode</label>
                <input id="period" name="period" type="month" className="input" required defaultValue={defaultPeriod} />
              </div>
              <button type="submit" className="btn-primary w-full justify-center">Buat Run</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
