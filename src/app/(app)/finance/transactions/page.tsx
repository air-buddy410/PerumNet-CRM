import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import {
  PERMISSIONS,
  CASH_TX_TYPES,
  CASH_TX_LABELS,
  statusLabel,
  formatRupiah,
  formatDateTime,
} from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams } from "@/components/table-controls";

export const metadata = { title: "Transaksi Kas" };

export default async function CashTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const isFinance = user.permissions.has(PERMISSIONS.FINANCE_VIEW);
  const canManage = user.permissions.has(PERMISSIONS.CASH_MANAGE);
  const tableOptions = [
    { value: "createdAt", label: "Dibuat" },
    { value: "txNumber", label: "Nomor" },
    { value: "status", label: "Status" },
  ] as const;
  const table = parseTableQuery(sp, { defaultSort: "createdAt", sortOptions: tableOptions });
  const where: Prisma.CashTransactionWhereInput = {
    ...(table.query.type ? { type: table.query.type } : {}),
    ...(table.query.status ? { status: table.query.status } : {}),
    // Non-finance hanya melihat pengajuannya sendiri.
    ...(isFinance ? {} : { createdById: user.id }),
  };
  const orderBy: Prisma.CashTransactionOrderByWithRelationInput[] = [
    { [table.sort]: table.direction },
    { id: "asc" },
  ];

  const [transactions, totalCount] = await Promise.all([
    db.cashTransaction.findMany({
      where,
      include: { cashbook: true, createdBy: true, category: true },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.cashTransaction.count({ where }),
  ]);

  const createTypes = [
    CASH_TX_TYPES.EXPENSE,
    CASH_TX_TYPES.REIMBURSEMENT,
    CASH_TX_TYPES.CASH_ADVANCE,
    CASH_TX_TYPES.ADVANCE_SETTLEMENT,
    ...(canManage ? [CASH_TX_TYPES.TOP_UP, CASH_TX_TYPES.CASH_TRANSFER] : []),
  ];

  return (
    <div>
      <PageHeader
        title="Transaksi Kas"
        subtitle="Saldo berubah saat posting. Expense, reimbursement, dan advance memerlukan persetujuan serta bukti."
      />
      {/* Toolbar berdiri sendiri: slot `action` PageHeader dirancang untuk satu
          tombol ringkas (flex: 0 0 auto), sehingga deretan tombol di sana
          mendesak judul sampai meluber di layar sempit. */}
      <div className="mb-4 flex flex-wrap gap-2">
        {createTypes.map((t) => (
          <Link
            key={t}
            href={`/finance/transactions/new?type=${t}`}
            className="btn-secondary px-3 py-1.5 text-xs"
          >
            + {CASH_TX_LABELS[t]}
          </Link>
        ))}
      </div>
      <Flash ok={table.query.ok} error={table.query.error} />

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="type">Tipe</label>
          <select id="type" name="type" className="input w-56" defaultValue={table.query.type ?? ""}>
            <option value="">Semua tipe</option>
            {Object.values(CASH_TX_TYPES).map((t) => (
              <option key={t} value={t}>{CASH_TX_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" className="input w-52" defaultValue={table.query.status ?? ""}>
            <option value="">Semua status</option>
            <option value="DRAFT">Draft</option>
            <option value="WAITING_APPROVAL">Menunggu Approval</option>
            <option value="POSTED">Posted</option>
            <option value="CANCELLED">Dibatalkan</option>
          </select>
        </div>
        <button type="submit" className="btn-secondary">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        {transactions.length === 0 ? (
          <EmptyState message="Belum ada transaksi kas." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th"><SortableTableHeader basePath="/finance/transactions" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="txNumber" label="Nomor" /></th>
                <th className="th">Tipe</th>
                <th className="th">Cashbook</th>
                <th className="th text-right">Nominal</th>
                <th className="th">Tujuan</th>
                <th className="th"><SortableTableHeader basePath="/finance/transactions" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="status" label="Status" /></th>
                <th className="th"><SortableTableHeader basePath="/finance/transactions" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="createdAt" label="Dibuat" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="td whitespace-nowrap">
                    <Link
                      href={`/finance/transactions/${t.id}`}
                      className="font-medium text-brand-600 hover:underline"
                    >
                      {t.txNumber}
                    </Link>
                    {t.reversalOfId && (
                      <span className="ml-1 text-xs text-amber-600">(reversal)</span>
                    )}
                  </td>
                  <td className="td text-xs">{CASH_TX_LABELS[t.type] ?? t.type}</td>
                  <td className="td text-xs">{t.cashbook.name}</td>
                  <td className="td whitespace-nowrap text-right">
                    {formatRupiah(t.amount)}
                    {t.cashReturnAmount > BigInt(0)
                      ? ` (+${formatRupiah(t.cashReturnAmount)} kas)`
                      : ""}
                  </td>
                  <td className="td max-w-56 truncate text-xs">{t.purpose}</td>
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
              ))}
            </tbody>
          </table>
          )}
          <TableControls
            basePath="/finance/transactions"
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
