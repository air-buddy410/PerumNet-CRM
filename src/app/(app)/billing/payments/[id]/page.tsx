import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, PAYMENT_METHODS, formatRupiah, formatDateTime, statusLabel } from "@/lib/constants";
import { PageHeader, Flash, BackLink, Badge } from "@/components/ui";
import { postPaymentAction, reversePaymentAction } from "../../actions";

export const metadata = { title: "Detail Pembayaran" };

export default async function PaymentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.BILLING_VIEW);
  const { id } = await params;
  const sp = await searchParams;

  const payment = await db.payment.findUnique({
    where: { id },
    include: {
      customer: true,
      merchant: true,
      receivedBy: true,
      createdBy: true,
      gatewayTx: true,
      reversalOf: true,
      reversal: true,
      allocations: { include: { invoice: true } },
    },
  });
  if (!payment) notFound();

  const canPost = user.permissions.has(PERMISSIONS.PAYMENTS_POST);
  const canReverse = user.permissions.has(PERMISSIONS.PAYMENTS_REVERSE);
  const methodLabel = PAYMENT_METHODS.find(([v]) => v === payment.method)?.[1] ?? payment.method;

  return (
    <div className="max-w-4xl">
      <BackLink href="/billing/payments" label="Kembali ke daftar pembayaran" />
      <PageHeader
        title={`${payment.paymentNumber} — ${payment.customer.name}`}
        subtitle={`${methodLabel} · ${formatDateTime(payment.paidAt)} · dicatat ${payment.createdBy.name}`}
        action={<Badge value={payment.status} label={statusLabel(payment.status)} />}
      />
      <Flash ok={sp.ok} error={sp.error} />

      {payment.reversalOf && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Pembayaran ini adalah reversal dari{" "}
          <Link href={`/billing/payments/${payment.reversalOf.id}`} className="font-semibold underline">
            {payment.reversalOf.paymentNumber}
          </Link>.
        </div>
      )}
      {payment.reversal && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Sudah di-reverse oleh{" "}
          <Link href={`/billing/payments/${payment.reversal.id}`} className="font-semibold underline">
            {payment.reversal.paymentNumber}
          </Link>.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="card overflow-x-auto">
          <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-medium">Alokasi Invoice</h2>
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Invoice</th>
                <th className="th">Total Invoice</th>
                <th className="th">Alokasi</th>
                <th className="th">Status Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payment.allocations.map((a) => (
                <tr key={a.id}>
                  <td className="td whitespace-nowrap font-mono text-xs">
                    <Link href={`/billing/invoices/${a.invoiceId}`} className="text-brand-600 hover:underline">
                      {a.invoice.invoiceNumber}
                    </Link>
                  </td>
                  <td className="td whitespace-nowrap text-xs">{formatRupiah(a.invoice.totalAmount)}</td>
                  <td className="td whitespace-nowrap text-xs font-medium">{formatRupiah(a.amount)}</td>
                  <td className="td">
                    <Badge
                      value={a.invoice.status}
                      label={a.invoice.status === "OPEN" ? "Belum Dibayar" : statusLabel(a.invoice.status)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="mb-3 text-sm font-medium">Rincian</h2>
            <dl className="grid gap-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Nominal</dt>
                <dd className="mt-0.5 font-semibold">{formatRupiah(payment.amount)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Fee / Netto</dt>
                <dd className="mt-0.5">
                  {formatRupiah(payment.feeAmount)} / {formatRupiah(payment.netAmount)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Diterima Oleh</dt>
                <dd className="mt-0.5">{payment.receivedBy?.name ?? "Gateway (otomatis)"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Merchant</dt>
                <dd className="mt-0.5">{payment.merchant?.name ?? "-"}</dd>
              </div>
              {payment.gatewayTx && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Bundle Gateway</dt>
                  <dd className="mt-0.5 font-mono text-xs">{payment.gatewayTx.bundleRef}</dd>
                </div>
              )}
              {payment.notes && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Catatan</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap">{payment.notes}</dd>
                </div>
              )}
            </dl>
          </div>

          {payment.status === "DRAFT" && canPost && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Posting</h2>
              <p className="mb-3 text-xs text-slate-500">
                Posting menerapkan alokasi ke piutang invoice — setelah itu koreksi hanya via reversal.
              </p>
              <form action={postPaymentAction}>
                <input type="hidden" name="paymentId" value={payment.id} />
                <button type="submit" className="btn-primary w-full justify-center">Posting Pembayaran</button>
              </form>
            </div>
          )}

          {payment.status === "POSTED" && !payment.reversalOfId && !payment.reversal && canReverse && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Reversal</h2>
              <form action={reversePaymentAction} className="space-y-3">
                <input type="hidden" name="paymentId" value={payment.id} />
                <textarea name="reason" rows={2} className="input" placeholder="Alasan reversal (wajib)" required />
                <button type="submit" className="btn-danger w-full justify-center">Reverse — Kembalikan Piutang</button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
