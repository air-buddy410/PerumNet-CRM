import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatRupiah, formatDateTime, statusLabel } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { createInvoiceRunAction } from "../actions";

export const metadata = { title: "Invoice Runs" };

export default async function InvoiceRunsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.BILLING_VIEW);
  const sp = await searchParams;
  const canCreate = user.permissions.has(PERMISSIONS.INVOICES_CREATE);

  const runs = await db.invoiceRun.findMany({
    include: { createdBy: true },
    orderBy: { period: "desc" },
    take: 60,
  });
  const now = new Date();
  const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  return (
    <div>
      <PageHeader
        title="Invoice Runs"
        subtitle="Batch tagihan bulanan — idempoten: dijalankan ulang tidak menggandakan invoice (gap G4)."
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="card overflow-x-auto">
          {runs.length === 0 ? (
            <EmptyState message="Belum ada invoice run." />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th">Periode</th>
                  <th className="th">Invoice</th>
                  <th className="th">Total</th>
                  <th className="th">Dibuat</th>
                  <th className="th">Diposting</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="td font-mono text-xs">
                      <Link href={`/billing/runs/${r.id}`} className="font-medium text-brand-600 hover:underline">
                        {r.period}
                      </Link>
                    </td>
                    <td className="td">{r.totalCount}</td>
                    <td className="td whitespace-nowrap text-xs">{formatRupiah(r.totalAmount)}</td>
                    <td className="td whitespace-nowrap text-xs">{r.createdBy.name}</td>
                    <td className="td whitespace-nowrap text-xs">{r.postedAt ? formatDateTime(r.postedAt) : "-"}</td>
                    <td className="td"><Badge value={r.status} label={statusLabel(r.status)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {canCreate && (
          <div className="card h-fit p-5">
            <h2 className="mb-1 font-medium">Run Baru</h2>
            <p className="mb-4 text-xs text-slate-500">
              Satu run per periode. Alur: buat → generate preview → periksa → posting.
            </p>
            <form action={createInvoiceRunAction} className="space-y-3">
              <div>
                <label className="label" htmlFor="period">Periode</label>
                <input id="period" name="period" type="month" className="input" required defaultValue={defaultPeriod} />
              </div>
              <button type="submit" className="btn-primary w-full justify-center">Buat Run</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
