import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, INVOICE_TYPES, INVOICE_LINE_KINDS, formatRupiah, formatDateTime, statusLabel } from "@/lib/constants";
import { PageHeader, Flash, BackLink, Badge } from "@/components/ui";
import { voidInvoiceAction } from "../../actions";

export const metadata = { title: "Detail Invoice" };

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.BILLING_VIEW);
  const { id } = await params;
  const sp = await searchParams;

  const inv = await db.invoice.findUnique({
    where: { id },
    include: {
      customer: true,
      subscription: { include: { package: true } },
      invoiceRun: true,
      createdBy: true,
      lines: true,
      allocations: {
        include: { payment: true },
        orderBy: { payment: { paidAt: "asc" } },
      },
    },
  });
  if (!inv) notFound();

  const canPost = user.permissions.has(PERMISSIONS.INVOICES_POST);
  const typeLabel = INVOICE_TYPES.find(([v]) => v === inv.type)?.[1] ?? inv.type;
  const kindLabel = (k: string) => INVOICE_LINE_KINDS.find(([v]) => v === k)?.[1] ?? k;
  const statusText = inv.status === "OPEN" ? "Belum Dibayar" : statusLabel(inv.status);
  const outstanding = inv.totalAmount - inv.paidAmount;

  return (
    <div className="max-w-4xl">
      <BackLink href="/billing/invoices" label="Kembali ke daftar invoice" />
      <PageHeader
        title={`${inv.invoiceNumber} — ${inv.customer.name}`}
        subtitle={`${typeLabel}${inv.period ? ` · periode ${inv.period}` : ""} · terbit ${formatDateTime(inv.issuedAt)} · dibuat ${inv.createdBy.name}`}
        action={<Badge value={inv.status} label={statusText} />}
      />
      <Flash ok={sp.ok} error={sp.error} />

      {inv.status === "VOID" && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Invoice di-void: {inv.voidReason}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Jenis</th>
                <th className="th">Deskripsi</th>
                <th className="th">Qty</th>
                <th className="th">Harga</th>
                <th className="th">Jumlah</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {inv.lines.map((l) => (
                <tr key={l.id}>
                  <td className="td whitespace-nowrap text-xs">{kindLabel(l.kind)}</td>
                  <td className="td text-xs">{l.description}</td>
                  <td className="td">{l.quantity}</td>
                  <td className="td whitespace-nowrap text-xs">{formatRupiah(l.unitPrice)}</td>
                  <td className="td whitespace-nowrap text-xs">{formatRupiah(l.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-slate-200 text-sm">
              <tr>
                <td colSpan={4} className="td text-right text-xs text-slate-500">Subtotal</td>
                <td className="td whitespace-nowrap text-xs">{formatRupiah(inv.subtotal)}</td>
              </tr>
              <tr>
                <td colSpan={4} className="td text-right text-xs text-slate-500">PPN {inv.taxPercent}%</td>
                <td className="td whitespace-nowrap text-xs">{formatRupiah(inv.taxAmount)}</td>
              </tr>
              <tr className="font-semibold">
                <td colSpan={4} className="td text-right text-xs">Total</td>
                <td className="td whitespace-nowrap text-xs">{formatRupiah(inv.totalAmount)}</td>
              </tr>
              <tr>
                <td colSpan={4} className="td text-right text-xs text-slate-500">Dibayar</td>
                <td className="td whitespace-nowrap text-xs">{formatRupiah(inv.paidAmount)}</td>
              </tr>
              {["OPEN", "PARTIAL"].includes(inv.status) && (
                <tr className="text-red-600">
                  <td colSpan={4} className="td text-right text-xs font-medium">Sisa Tagihan</td>
                  <td className="td whitespace-nowrap text-xs font-semibold">{formatRupiah(outstanding)}</td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>

        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="mb-3 text-sm font-medium">Info</h2>
            <dl className="grid gap-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Pelanggan</dt>
                <dd className="mt-0.5">{inv.customer.customerNumber} · {inv.customer.name}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Layanan</dt>
                <dd className="mt-0.5">
                  {inv.subscription
                    ? `${inv.subscription.serviceNumber} — ${inv.subscription.package.name}`
                    : "-"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Jatuh Tempo</dt>
                <dd className="mt-0.5">{formatDateTime(inv.dueAt)}</dd>
              </div>
              {inv.invoiceRun && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Invoice Run</dt>
                  <dd className="mt-0.5">
                    <Link href={`/billing/runs/${inv.invoiceRun.id}`} className="text-brand-600 hover:underline">
                      {inv.invoiceRun.period}
                    </Link>
                  </dd>
                </div>
              )}
              {inv.notes && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Catatan</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap">{inv.notes}</dd>
                </div>
              )}
            </dl>
          </div>

          {inv.allocations.length > 0 && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Riwayat Pembayaran</h2>
              <ul className="space-y-2 text-sm">
                {inv.allocations.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    <Link href={`/billing/payments/${a.paymentId}`} className="font-mono text-xs text-brand-600 hover:underline">
                      {a.payment.paymentNumber}
                    </Link>
                    <span className={`text-xs ${a.payment.status === "REVERSED" ? "text-slate-400 line-through" : ""}`}>
                      {formatRupiah(a.amount)}
                      {a.payment.reversalOfId ? " (reversal)" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {canPost && ["OPEN", "DRAFT"].includes(inv.status) && inv.paidAmount === 0n && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Void Invoice</h2>
              <p className="mb-3 text-xs text-slate-500">
                Invoice tidak dihapus — di-void dengan alasan, lalu buat invoice pengganti bila perlu (§2.2).
              </p>
              <form action={voidInvoiceAction} className="space-y-3">
                <input type="hidden" name="invoiceId" value={inv.id} />
                <textarea name="reason" rows={2} className="input" placeholder="Alasan void (wajib)" required />
                <button type="submit" className="btn-danger w-full justify-center">Void</button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
