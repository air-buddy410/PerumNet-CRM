import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatRupiah, formatDateTime, statusLabel } from "@/lib/constants";
import { PageHeader, Flash, BackLink, Badge, EmptyState } from "@/components/ui";
import {
  generateInvoiceRunAction,
  postInvoiceRunAction,
  cancelInvoiceRunAction,
} from "../../actions";

export const metadata = { title: "Detail Invoice Run" };

export default async function InvoiceRunDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.BILLING_VIEW);
  const { id } = await params;
  const sp = await searchParams;

  const run = await db.invoiceRun.findUnique({
    where: { id },
    include: {
      createdBy: true,
      invoices: {
        include: { customer: true, subscription: true },
        orderBy: { invoiceNumber: "asc" },
      },
    },
  });
  if (!run) notFound();

  const canCreate = user.permissions.has(PERMISSIONS.INVOICES_CREATE);
  const canPost = user.permissions.has(PERMISSIONS.INVOICES_POST);
  const editable = ["DRAFT", "PREVIEW"].includes(run.status);

  return (
    <div>
      <BackLink href="/billing/runs" label="Kembali ke daftar run" />
      <PageHeader
        title={`Invoice Run ${run.period}`}
        subtitle={`${run.totalCount} invoice · ${formatRupiah(run.totalAmount)} · dibuat ${run.createdBy.name}${run.postedAt ? ` · diposting ${formatDateTime(run.postedAt)}` : ""}`}
        action={<Badge value={run.status} label={statusLabel(run.status)} />}
      />
      <Flash ok={sp.ok} error={sp.error} />

      {editable && (
        <div className="mb-4 flex flex-wrap gap-2">
          {canCreate && (
            <form action={generateInvoiceRunAction}>
              <input type="hidden" name="runId" value={run.id} />
              <button type="submit" className="btn-secondary">
                {run.status === "DRAFT" ? "Generate Preview" : "Generate Ulang (idempoten)"}
              </button>
            </form>
          )}
          {canPost && run.status === "PREVIEW" && (
            <form action={postInvoiceRunAction}>
              <input type="hidden" name="runId" value={run.id} />
              <button type="submit" className="btn-primary">Posting — Terbitkan Semua</button>
            </form>
          )}
          {canCreate && (
            <form action={cancelInvoiceRunAction} className="flex items-center gap-2">
              <input type="hidden" name="runId" value={run.id} />
              <input name="reason" className="input w-56" placeholder="Alasan batal (wajib)" required />
              <button type="submit" className="btn-danger">Batalkan Run</button>
            </form>
          )}
        </div>
      )}

      <div className="card overflow-x-auto">
        {run.invoices.length === 0 ? (
          <EmptyState message='Belum ada invoice — klik "Generate Preview".' />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Nomor</th>
                <th className="th">Pelanggan</th>
                <th className="th">Layanan</th>
                <th className="th">Subtotal</th>
                <th className="th">PPN</th>
                <th className="th">Total</th>
                <th className="th">Jatuh Tempo</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {run.invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="td whitespace-nowrap font-mono text-xs">
                    <Link href={`/billing/invoices/${inv.id}`} className="text-brand-600 hover:underline">
                      {inv.invoiceNumber}
                    </Link>
                  </td>
                  <td className="td whitespace-nowrap text-xs font-medium">{inv.customer.name}</td>
                  <td className="td whitespace-nowrap font-mono text-xs">{inv.subscription?.serviceNumber ?? "-"}</td>
                  <td className="td whitespace-nowrap text-xs">{formatRupiah(inv.subtotal)}</td>
                  <td className="td whitespace-nowrap text-xs">
                    {formatRupiah(inv.taxAmount)} ({inv.taxPercent}%)
                  </td>
                  <td className="td whitespace-nowrap text-xs font-medium">{formatRupiah(inv.totalAmount)}</td>
                  <td className="td whitespace-nowrap text-xs">{formatDateTime(inv.dueAt)}</td>
                  <td className="td">
                    <Badge value={inv.status} label={inv.status === "OPEN" ? "Belum Dibayar" : statusLabel(inv.status)} />
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
