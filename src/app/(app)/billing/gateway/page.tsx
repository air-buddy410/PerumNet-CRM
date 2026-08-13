import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, GATEWAY_PROVIDERS, formatRupiah, formatDateTime, statusLabel } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams, type TableSortOption } from "@/components/table-controls";

export const metadata = { title: "Gateway Bundles" };
const sortOptions: readonly TableSortOption[] = [
  { value: "createdAt", label: "Tanggal dibuat" },
  { value: "bundleRef", label: "Bundle Ref" },
  { value: "status", label: "Status" },
];

export default async function GatewayPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.BILLING_VIEW);
  const sp = await searchParams;
  const table = parseTableQuery(sp, { defaultSort: "createdAt", defaultDirection: "desc", sortOptions });
  const canCreate = user.permissions.has(PERMISSIONS.PAYMENTS_CREATE);
  const orderBy: Prisma.PaymentGatewayTxOrderByWithRelationInput[] = table.sort === "bundleRef"
    ? [{ bundleRef: table.direction }, { id: "asc" }]
    : table.sort === "status"
      ? [{ status: table.direction }, { id: "asc" }]
      : [{ createdAt: table.direction }, { id: "asc" }];

  const [bundles, total] = await Promise.all([
    db.paymentGatewayTx.findMany({
      include: {
        customer: true,
        integration: true,
        _count: { select: { invoices: true } },
      },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.paymentGatewayTx.count(),
  ]);
  const provLabel = (p: string) => GATEWAY_PROVIDERS.find(([v]) => v === p)?.[1] ?? p;

  return (
    <div>
      <PageHeader
        title="Gateway Bundles"
        subtitle="Pembayaran gabungan multi-invoice via payment gateway. Status berubah dari webhook — PAID otomatis memposting pembayaran."
        action={
          canCreate ? (
            <Link href="/billing/gateway/new" className="btn-primary">
              Bundle Baru
            </Link>
          ) : undefined
        }
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      <div className="card overflow-x-auto">
        {bundles.length === 0 ? (
          <EmptyState message="Belum ada bundle gateway." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th"><SortableTableHeader basePath="/billing/gateway" currentDirection={table.direction} currentSort={table.sort} label="Bundle Ref" query={table.query} sortKey="bundleRef" /></th>
                <th className="th">Pelanggan</th>
                <th className="th">Provider</th>
                <th className="th">Invoice</th>
                <th className="th">Total</th>
                <th className="th">Dibayar</th>
                <th className="th">Kedaluwarsa</th>
                <th className="th"><SortableTableHeader basePath="/billing/gateway" currentDirection={table.direction} currentSort={table.sort} label="Status" query={table.query} sortKey="status" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bundles.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50">
                  <td className="td whitespace-nowrap font-mono text-xs">{b.bundleRef}</td>
                  <td className="td whitespace-nowrap text-xs font-medium">{b.customer.name}</td>
                  <td className="td whitespace-nowrap text-xs">
                    {provLabel(b.provider)}
                    {b.integration && (
                      <span className="block text-[10px] text-slate-400">via {b.integration.code}</span>
                    )}
                  </td>
                  <td className="td">{b._count.invoices}</td>
                  <td className="td whitespace-nowrap text-xs font-medium">{formatRupiah(b.totalAmount)}</td>
                  <td className="td whitespace-nowrap text-xs">{formatRupiah(b.paidAmount)}</td>
                  <td className="td whitespace-nowrap text-xs">{b.expiresAt ? formatDateTime(b.expiresAt) : "-"}</td>
                  <td className="td">
                    <Badge value={b.status} label={statusLabel(b.status)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <TableControls basePath="/billing/gateway" direction={table.direction} page={table.page} pageSize={table.pageSize} query={table.query} sort={table.sort} sortOptions={sortOptions} total={total} />
    </div>
  );
}
