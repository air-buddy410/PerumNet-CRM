import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatRupiah, formatDateTime, statusLabel } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams } from "@/components/table-controls";

export const metadata = { title: "Jurnal Umum" };

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.GL_VIEW);
  const sp = await searchParams;
  const canPost = user.permissions.has(PERMISSIONS.GL_POST);
  const tableOptions = [
    { value: "createdAt", label: "Dibuat" },
    { value: "entryNumber", label: "Nomor" },
    { value: "entryDate", label: "Tanggal" },
  ] as const;
  const table = parseTableQuery(sp, { defaultSort: "createdAt", sortOptions: tableOptions });
  const where: Prisma.JournalEntryWhereInput = table.query.source ? { source: table.query.source } : {};
  const orderBy: Prisma.JournalEntryOrderByWithRelationInput[] = [
    { [table.sort]: table.direction },
    { id: "asc" },
  ];

  const [entries, totalCount] = await Promise.all([
    db.journalEntry.findMany({
      where,
      include: { lines: true, postedBy: true },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.journalEntry.count({ where }),
  ]);
  const sources = ["INVOICE", "PAYMENT", "COLLECTOR_FEE", "MANUAL", "REVERSAL"];

  return (
    <div>
      <PageHeader
        title="Jurnal Umum"
        subtitle="Jurnal hanya dapat ditambah; koreksi dilakukan melalui jurnal balik. Jurnal berasal dari invoice, pembayaran, atau input manual."
        action={
          canPost ? (
            <Link href="/finance/gl/journal/new" className="btn-primary">
              Jurnal Manual
            </Link>
          ) : undefined
        }
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="source">Sumber</label>
          <select id="source" name="source" className="input w-48" defaultValue={table.query.source ?? ""}>
            <option value="">Semua sumber</option>
            {sources.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        {entries.length === 0 ? (
          <EmptyState message="Belum ada jurnal." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th"><SortableTableHeader basePath="/finance/gl/journal" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="entryNumber" label="Nomor" /></th>
                <th className="th"><SortableTableHeader basePath="/finance/gl/journal" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="entryDate" label="Tanggal" /></th>
                <th className="th">Sumber</th>
                <th className="th">Memo</th>
                <th className="th">Nilai</th>
                <th className="th">Oleh</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((e) => {
                const total = e.lines.reduce((acc, l) => acc + l.debit, 0n);
                return (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="td whitespace-nowrap font-mono text-xs">
                      <Link href={`/finance/gl/journal/${e.id}`} className="font-medium text-brand-600 hover:underline">
                        {e.entryNumber}
                      </Link>
                    </td>
                    <td className="td whitespace-nowrap text-xs">{formatDateTime(e.entryDate)}</td>
                    <td className="td whitespace-nowrap font-mono text-xs">{e.source}</td>
                    <td className="td max-w-72 text-xs">
                      <span className="block truncate" title={e.memo ?? ""}>{e.memo ?? "-"}</span>
                    </td>
                    <td className="td whitespace-nowrap text-xs font-medium">{formatRupiah(total)}</td>
                    <td className="td whitespace-nowrap text-xs">{e.postedBy?.name ?? "Sistem"}</td>
                    <td className="td"><Badge value={e.status} label={statusLabel(e.status)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          )}
          <TableControls
            basePath="/finance/gl/journal"
            query={table.query}
            page={table.page}
            pageSize={table.pageSize}
            sort={table.sort}
            direction={table.direction}
            sortOptions={tableOptions}
            total={totalCount}
          />
        </div>
    </div>
  );
}
