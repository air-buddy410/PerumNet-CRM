import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, PAYMENT_METHODS, formatRupiah, formatDateTime, statusLabel } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams, type TableSortOption } from "@/components/table-controls";

export const metadata = { title: "Payments" };
const sortOptions: readonly TableSortOption[] = [
  { value: "createdAt", label: "Tanggal dibuat" },
  { value: "paymentNumber", label: "Nomor" },
  { value: "paidAt", label: "Diterima" },
  { value: "status", label: "Status" },
];

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.BILLING_VIEW);
  const sp = await searchParams;
  const table = parseTableQuery(sp, { defaultSort: "createdAt", defaultDirection: "desc", sortOptions });
  const canCreate = user.permissions.has(PERMISSIONS.PAYMENTS_CREATE);
  const where = {
    ...(table.query.method ? { method: table.query.method } : {}),
    ...(table.query.status ? { status: table.query.status } : {}),
  };
  const orderBy: Prisma.PaymentOrderByWithRelationInput[] = table.sort === "paymentNumber"
    ? [{ paymentNumber: table.direction }, { id: "asc" }]
    : table.sort === "paidAt"
      ? [{ paidAt: table.direction }, { id: "asc" }]
      : table.sort === "status"
        ? [{ status: table.direction }, { id: "asc" }]
        : [{ createdAt: table.direction }, { id: "asc" }];

  const [payments, total] = await Promise.all([
    db.payment.findMany({
      where,
      include: {
        customer: true,
        merchant: true,
        receivedBy: true,
        _count: { select: { allocations: true } },
      },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.payment.count({ where }),
  ]);
  const methodLabel = (m: string) => PAYMENT_METHODS.find(([v]) => v === m)?.[1] ?? m;

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle="Catat pembayaran pelanggan dan alokasikan ke invoice terkait. Koreksi dilakukan melalui reversal."
        action={
          canCreate ? (
            <Link href="/billing/payments/new" className="btn-primary">
              Catat Pembayaran
            </Link>
          ) : undefined
        }
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="method">Metode</label>
          <select id="method" name="method" className="input w-44" defaultValue={table.query.method ?? ""}>
            <option value="">Semua metode</option>
            {PAYMENT_METHODS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" className="input w-40" defaultValue={table.query.status ?? ""}>
            <option value="">Semua status</option>
            <option value="DRAFT">Draft</option>
            <option value="POSTED">Posted</option>
            <option value="REVERSED">Di-reverse</option>
          </select>
        </div>
        <button type="submit" className="btn-secondary">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        {payments.length === 0 ? (
          <EmptyState message="Belum ada pembayaran." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th"><SortableTableHeader basePath="/billing/payments" currentDirection={table.direction} currentSort={table.sort} label="Nomor" query={table.query} sortKey="paymentNumber" /></th>
                <th className="th">Pelanggan</th>
                <th className="th">Metode</th>
                <th className="th">Merchant</th>
                <th className="th">Nominal</th>
                <th className="th">Fee</th>
                <th className="th">Invoice</th>
                <th className="th"><SortableTableHeader basePath="/billing/payments" currentDirection={table.direction} currentSort={table.sort} label="Diterima" query={table.query} sortKey="paidAt" /></th>
                <th className="th"><SortableTableHeader basePath="/billing/payments" currentDirection={table.direction} currentSort={table.sort} label="Status" query={table.query} sortKey="status" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="td whitespace-nowrap font-mono text-xs">
                    <Link href={`/billing/payments/${p.id}`} className="font-medium text-brand-600 hover:underline">
                      {p.paymentNumber}
                    </Link>
                    {p.reversalOfId && <span className="ml-1 text-xs text-amber-600">(reversal)</span>}
                  </td>
                  <td className="td whitespace-nowrap text-xs font-medium">{p.customer.name}</td>
                  <td className="td whitespace-nowrap text-xs">{methodLabel(p.method)}</td>
                  <td className="td whitespace-nowrap text-xs">{p.merchant?.name ?? "-"}</td>
                  <td className="td whitespace-nowrap text-xs font-medium">{formatRupiah(p.amount)}</td>
                  <td className="td whitespace-nowrap text-xs">{p.feeAmount > 0n ? formatRupiah(p.feeAmount) : "-"}</td>
                  <td className="td">{p._count.allocations}</td>
                  <td className="td whitespace-nowrap text-xs">
                    {p.receivedBy?.name ?? "Gateway"} · {formatDateTime(p.paidAt)}
                  </td>
                  <td className="td">
                    <Badge value={p.status} label={statusLabel(p.status)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <TableControls basePath="/billing/payments" direction={table.direction} page={table.page} pageSize={table.pageSize} query={table.query} sort={table.sort} sortOptions={sortOptions} total={total} />
    </div>
  );
}
