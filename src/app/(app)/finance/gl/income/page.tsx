import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatRupiah } from "@/lib/constants";
import { incomeStatement } from "@/lib/gl";
import { PageHeader, EmptyState } from "@/components/ui";

export const metadata = { title: "Laba Rugi" };

function monthRange(): { from: string; to: string } {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
  };
}

export default async function IncomePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requirePermission(PERMISSIONS.GL_VIEW);
  const sp = await searchParams;
  const def = monthRange();
  const from = sp.from ?? def.from;
  const to = sp.to ?? def.to;
  const report = await incomeStatement(new Date(from), new Date(`${to}T23:59:59`));

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Laba Rugi"
        subtitle={`Periode ${from} s.d. ${to} — laporan diturunkan dari jurnal.`}
      />

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="from">Dari</label>
          <input id="from" name="from" type="date" className="input" defaultValue={from} />
        </div>
        <div>
          <label className="label" htmlFor="to">Sampai</label>
          <input id="to" name="to" type="date" className="input" defaultValue={to} />
        </div>
        <button type="submit" className="btn-secondary">Tampilkan</button>
      </form>

      <div className="card p-6">
        {report.income.length === 0 && report.expense.length === 0 ? (
          <EmptyState message="Belum ada mutasi pendapatan/beban pada periode ini." />
        ) : (
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="mb-1 font-semibold">Pendapatan</dt>
              {report.income.map((a) => (
                <dd key={a.accountId} className="flex justify-between border-b border-slate-50 py-1">
                  <span><span className="font-mono text-xs">{a.code}</span> {a.name}</span>
                  <span>{formatRupiah(a.balance)}</span>
                </dd>
              ))}
              <dd className="flex justify-between py-1 font-semibold">
                <span>Total Pendapatan</span>
                <span>{formatRupiah(report.totalIncome)}</span>
              </dd>
            </div>
            <div>
              <dt className="mb-1 font-semibold">Beban</dt>
              {report.expense.map((a) => (
                <dd key={a.accountId} className="flex justify-between border-b border-slate-50 py-1">
                  <span><span className="font-mono text-xs">{a.code}</span> {a.name}</span>
                  <span>({formatRupiah(a.balance)})</span>
                </dd>
              ))}
              <dd className="flex justify-between py-1 font-semibold">
                <span>Total Beban</span>
                <span>({formatRupiah(report.totalExpense)})</span>
              </dd>
            </div>
            <div className={`flex justify-between border-t-2 border-slate-200 pt-3 text-base font-bold ${report.netIncome < 0n ? "text-red-600" : "text-emerald-700"}`}>
              <span>{report.netIncome < 0n ? "Rugi Bersih" : "Laba Bersih"}</span>
              <span>{formatRupiah(report.netIncome)}</span>
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}
