import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  TX_TYPES,
  TX_TYPE_LABELS,
  statusLabel,
  formatDateTime,
} from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams, type TableSortOption } from "@/components/table-controls";

export const metadata = { title: "Transaksi Stock" };
const sortOptions: readonly TableSortOption[] = [
  { value: "createdAt", label: "Terbaru" },
  { value: "txNumber", label: "Nomor" },
  { value: "status", label: "Status" },
  { value: "type", label: "Tipe" },
];

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  const sp = await searchParams;
  const table = parseTableQuery(sp, { defaultSort: "createdAt", defaultDirection: "desc", sortOptions });
  const canCreate = user.permissions.has(PERMISSIONS.STOCK_CREATE);
  const where = {
    ...(table.query.type ? { type: table.query.type } : {}),
    ...(table.query.status ? { status: table.query.status } : {}),
  };
  const orderBy: Prisma.StockTransactionOrderByWithRelationInput[] = table.sort === "txNumber"
    ? [{ txNumber: table.direction }, { id: "asc" }]
    : table.sort === "status"
      ? [{ status: table.direction }, { id: "asc" }]
      : table.sort === "type"
        ? [{ type: table.direction }, { id: "asc" }]
        : [{ createdAt: table.direction }, { id: "asc" }];

  const [transactions, total] = await Promise.all([
    db.stockTransaction.findMany({
      where,
      include: { warehouseFrom: true, warehouseTo: true, custodian: true, createdBy: true, workOrder: true, _count: { select: { lines: true } } },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.stockTransaction.count({ where }),
  ]);

  return (
    <div>
      <PageHeader
        title="Transaksi Stock"
        subtitle="Transaksi yang sudah diposting tidak dapat diedit; koreksi dilakukan melalui reversal."
      />
      {/* Toolbar berdiri sendiri: slot `action` PageHeader dirancang untuk satu
          tombol ringkas (flex: 0 0 auto), sehingga deretan tombol di sana
          mendesak judul sampai meluber di layar sempit. */}
      {canCreate && (
        <div className="mb-4 flex flex-wrap gap-2">
          {(["GOODS_RECEIPT", "STOCK_ISSUE", "STOCK_RETURN", "STOCK_TRANSFER"] as const).map((t) => (
            <Link
              key={t}
              href={`/inventory/transactions/new?type=${t}`}
              className="btn-secondary px-3 py-1.5 text-xs"
            >
              + {TX_TYPE_LABELS[t]}
            </Link>
          ))}
        </div>
      )}
      <Flash ok={table.query.ok} error={table.query.error} />

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="type">Tipe</label>
          <select id="type" name="type" className="input w-56" defaultValue={table.query.type ?? ""}>
            <option value="">Semua tipe</option>
            {Object.values(TX_TYPES).map((t) => (
              <option key={t} value={t}>{TX_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" className="input w-44" defaultValue={table.query.status ?? ""}>
            <option value="">Semua status</option>
            <option value="DRAFT">Draft</option>
            <option value="POSTED">Posted</option>
            <option value="CANCELLED">Dibatalkan</option>
          </select>
        </div>
        <button type="submit" className="btn-secondary">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        {transactions.length === 0 ? (
          <EmptyState message="Belum ada transaksi." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th"><SortableTableHeader basePath="/inventory/transactions" currentDirection={table.direction} currentSort={table.sort} label="Nomor" query={table.query} sortKey="txNumber" /></th>
                <th className="th"><SortableTableHeader basePath="/inventory/transactions" currentDirection={table.direction} currentSort={table.sort} label="Tipe" query={table.query} sortKey="type" /></th>
                <th className="th">Dari → Ke</th>
                <th className="th">Tujuan</th>
                <th className="th">Baris</th>
                <th className="th"><SortableTableHeader basePath="/inventory/transactions" currentDirection={table.direction} currentSort={table.sort} label="Status" query={table.query} sortKey="status" /></th>
                <th className="th">Dibuat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.map((t) => {
                const from = t.warehouseFrom?.name ?? (t.custodianId && t.type === "STOCK_RETURN" ? `Teknisi ${t.custodian?.name}` : "-");
                const to =
                  t.warehouseTo?.name ??
                  (t.custodianId && t.type === "STOCK_ISSUE" ? `Teknisi ${t.custodian?.name}` : "-");
                return (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="td whitespace-nowrap">
                      <Link
                        href={`/inventory/transactions/${t.id}`}
                        className="font-medium text-brand-600 hover:underline"
                      >
                        {t.txNumber}
                      </Link>
                      {t.reversalOfId && (
                        <span className="ml-1 text-xs text-amber-600">(reversal)</span>
                      )}
                    </td>
                    <td className="td whitespace-nowrap text-xs">{TX_TYPE_LABELS[t.type] ?? t.type}</td>
                    <td className="td whitespace-nowrap text-xs">{from} → {to}</td>
                    <td className="td max-w-56 truncate text-xs">
                      {t.purpose}
                      {t.workOrder ? ` · ${t.workOrder.woNumber}` : ""}
                    </td>
                    <td className="td">{t._count.lines}</td>
                    <td className="td">
                      <Badge
                        value={t.reversedById ? "REVERSED" : t.status}
                        label={t.reversedById ? "Di-reverse" : statusLabel(t.status)}
                      />
                    </td>
                    <td className="td whitespace-nowrap text-xs text-slate-500">
                      {t.createdBy.name} · {formatDateTime(t.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <TableControls basePath="/inventory/transactions" direction={table.direction} page={table.page} pageSize={table.pageSize} query={table.query} sort={table.sort} sortOptions={sortOptions} total={total} />
    </div>
  );
}
