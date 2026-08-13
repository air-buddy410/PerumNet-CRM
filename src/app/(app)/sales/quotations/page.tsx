import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, statusLabel, formatRupiah, formatDateTime } from "@/lib/constants";
import { PageHeader, Badge, EmptyState, Flash } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams, type TableSortOption } from "@/components/table-controls";
import { formatUiDate } from "@/components/ui-formatters";

export const metadata = { title: "Quotations" };
const sortOptions: readonly TableSortOption[] = [
  { value: "createdAt", label: "Dibuat" },
  { value: "quotationNumber", label: "Nomor" },
  { value: "status", label: "Status" },
];

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.QUOTATIONS_VIEW);
  const sp = await searchParams;
  const table = parseTableQuery(sp, { defaultSort: "createdAt", defaultDirection: "desc", sortOptions });
  const orderBy: Prisma.QuotationOrderByWithRelationInput[] = table.sort === "quotationNumber"
    ? [{ quotationNumber: table.direction }, { id: "asc" }]
    : table.sort === "status"
      ? [{ status: table.direction }, { id: "asc" }]
      : [{ createdAt: table.direction }, { id: "asc" }];

  const [quotations, total] = await Promise.all([
    db.quotation.findMany({
      include: { lead: true, package: true },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.quotation.count(),
  ]);

  return (
    <div>
      <PageHeader
        title="Quotations"
        subtitle="Quotation yang diterima tidak dapat diedit; revisi membuat versi baru. Diskon memerlukan persetujuan."
        action={
          user.permissions.has(PERMISSIONS.QUOTATIONS_CREATE) ? (
            <Link href="/sales/quotations/new" className="btn-primary">+ Quotation</Link>
          ) : undefined
        }
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      <div className="card overflow-x-auto">
        {quotations.length === 0 ? (
          <EmptyState message="Belum ada quotation." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th"><SortableTableHeader basePath="/sales/quotations" currentDirection={table.direction} currentSort={table.sort} label="Nomor" query={table.query} sortKey="quotationNumber" /></th>
                <th className="th">Lead</th>
                <th className="th">Paket</th>
                <th className="th">Bulanan</th>
                <th className="th">Diskon</th>
                <th className="th">Berlaku s.d.</th>
                <th className="th"><SortableTableHeader basePath="/sales/quotations" currentDirection={table.direction} currentSort={table.sort} label="Status" query={table.query} sortKey="status" /></th>
                <th className="th">Dibuat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {quotations.map((q) => (
                <tr key={q.id} className="hover:bg-slate-50">
                  <td className="td whitespace-nowrap">
                    <Link
                      href={`/sales/quotations/${q.id}`}
                      className="font-medium text-brand-600 hover:underline"
                    >
                      {q.quotationNumber} v{q.version}
                    </Link>
                  </td>
                  <td className="td">{q.lead.name}</td>
                  <td className="td text-xs">{q.package.name}</td>
                  <td className="td whitespace-nowrap">{formatRupiah(q.monthlyPrice)}</td>
                  <td className="td whitespace-nowrap">
                    {q.discount > BigInt(0) ? formatRupiah(q.discount) : "-"}
                  </td>
                  <td className="td whitespace-nowrap text-xs">
                    {formatUiDate(q.validUntil, "-")}
                  </td>
                  <td className="td">
                    <Badge value={q.status} label={statusLabel(q.status)} />
                  </td>
                  <td className="td whitespace-nowrap text-xs text-slate-500">
                    {formatDateTime(q.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <TableControls basePath="/sales/quotations" direction={table.direction} page={table.page} pageSize={table.pageSize} query={table.query} sort={table.sort} sortOptions={sortOptions} total={total} />
    </div>
  );
}
