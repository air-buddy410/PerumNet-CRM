import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatRupiah } from "@/lib/constants";
import { balanceSheet } from "@/lib/gl";
import { PageHeader, EmptyState } from "@/components/ui";

export const metadata = { title: "Neraca" };

export default async function BalanceSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string }>;
}) {
  await requirePermission(PERMISSIONS.GL_VIEW);
  const sp = await searchParams;
  const asOf = sp.asOf ?? new Date().toISOString().slice(0, 10);
  const report = await balanceSheet(new Date(`${asOf}T23:59:59`));
  const totalPasiva = report.totalLiabilities + report.totalEquity + report.retainedEarnings;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Neraca"
        subtitle={`Per ${asOf} — ${report.balanced ? "SEIMBANG ✓" : "TIDAK SEIMBANG!"} (aktiva = kewajiban + ekuitas + laba berjalan)`}
      />

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="asOf">Per Tanggal</label>
          <input id="asOf" name="asOf" type="date" className="input" defaultValue={asOf} />
        </div>
        <button type="submit" className="btn-secondary">Tampilkan</button>
      </form>

      {report.assets.length === 0 && report.liabilities.length === 0 ? (
        <div className="card"><EmptyState message="Belum ada jurnal sampai tanggal ini." /></div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="card p-6">
            <h2 className="mb-3 font-semibold">Aktiva</h2>
            <dl className="space-y-1 text-sm">
              {report.assets.map((a) => (
                <dd key={a.accountId} className="flex justify-between border-b border-slate-50 py-1">
                  <span><span className="font-mono text-xs">{a.code}</span> {a.name}</span>
                  <span>{formatRupiah(a.balance)}</span>
                </dd>
              ))}
              <dd className="flex justify-between pt-2 text-base font-bold">
                <span>Total Aktiva</span>
                <span>{formatRupiah(report.totalAssets)}</span>
              </dd>
            </dl>
          </div>
          <div className="card p-6">
            <h2 className="mb-3 font-semibold">Kewajiban & Ekuitas</h2>
            <dl className="space-y-1 text-sm">
              {report.liabilities.map((a) => (
                <dd key={a.accountId} className="flex justify-between border-b border-slate-50 py-1">
                  <span><span className="font-mono text-xs">{a.code}</span> {a.name}</span>
                  <span>{formatRupiah(a.balance)}</span>
                </dd>
              ))}
              {report.equity.map((a) => (
                <dd key={a.accountId} className="flex justify-between border-b border-slate-50 py-1">
                  <span><span className="font-mono text-xs">{a.code}</span> {a.name}</span>
                  <span>{formatRupiah(a.balance)}</span>
                </dd>
              ))}
              <dd className="flex justify-between border-b border-slate-50 py-1">
                <span>Laba Berjalan</span>
                <span>{formatRupiah(report.retainedEarnings)}</span>
              </dd>
              <dd className="flex justify-between pt-2 text-base font-bold">
                <span>Total Pasiva</span>
                <span>{formatRupiah(totalPasiva)}</span>
              </dd>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
