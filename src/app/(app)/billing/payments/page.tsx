import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, PAYMENT_METHODS, formatRupiah, formatDateTime, statusLabel } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";

export const metadata = { title: "Payments" };

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; method?: string; status?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.BILLING_VIEW);
  const sp = await searchParams;
  const canCreate = user.permissions.has(PERMISSIONS.PAYMENTS_CREATE);

  const payments = await db.payment.findMany({
    where: {
      ...(sp.method ? { method: sp.method } : {}),
      ...(sp.status ? { status: sp.status } : {}),
    },
    include: {
      customer: true,
      merchant: true,
      receivedBy: true,
      _count: { select: { allocations: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 150,
  });
  const methodLabel = (m: string) => PAYMENT_METHODS.find(([v]) => v === m)?.[1] ?? m;

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle="Pembayaran pelanggan dengan alokasi eksplisit ke invoice (gap G2). Koreksi via reversal, bukan edit."
        action={
          canCreate ? (
            <Link href="/billing/payments/new" className="btn-primary">
              Catat Pembayaran
            </Link>
          ) : undefined
        }
      />
      <Flash ok={sp.ok} error={sp.error} />

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="method">Metode</label>
          <select id="method" name="method" className="input w-44" defaultValue={sp.method ?? ""}>
            <option value="">Semua metode</option>
            {PAYMENT_METHODS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" className="input w-40" defaultValue={sp.status ?? ""}>
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
                <th className="th">Nomor</th>
                <th className="th">Pelanggan</th>
                <th className="th">Metode</th>
                <th className="th">Merchant</th>
                <th className="th">Nominal</th>
                <th className="th">Fee</th>
                <th className="th">Invoice</th>
                <th className="th">Diterima</th>
                <th className="th">Status</th>
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
    </div>
  );
}
