import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, ACCOUNT_CATEGORIES, formatRupiah } from "@/lib/constants";
import { trialBalance } from "@/lib/gl";
import { PageHeader, EmptyState } from "@/components/ui";

export const metadata = { title: "Neraca Saldo" };

function monthRange(): { from: string; to: string } {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
  };
}

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requirePermission(PERMISSIONS.GL_VIEW);
  const sp = await searchParams;
  const def = monthRange();
  const from = sp.from ?? def.from;
  const to = sp.to ?? def.to;
  const report = await trialBalance(new Date(from), new Date(`${to}T23:59:59`));
  const catLabel = (c: string) => ACCOUNT_CATEGORIES.find(([v]) => v === c)?.[1] ?? c;
  const balanced = report.totalDebit === report.totalCredit;

  return (
    <div>
      <PageHeader
        title="Neraca Saldo"
        subtitle={`Saldo awal / pergerakan / saldo akhir per akun. Pergerakan debit ${formatRupiah(report.totalDebit)} vs kredit ${formatRupiah(report.totalCredit)} — ${balanced ? "SEIMBANG ✓" : "TIDAK SEIMBANG!"}`}
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

      <div className="card overflow-x-auto">
        {report.rows.length === 0 ? (
          <EmptyState message="Belum ada mutasi jurnal pada rentang ini." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Akun</th>
                <th className="th">Kategori</th>
                <th className="th">Saldo Awal</th>
                <th className="th">Debit</th>
                <th className="th">Kredit</th>
                <th className="th">Saldo Akhir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.rows.map((r) => (
                <tr key={r.account.accountId} className="hover:bg-slate-50">
                  <td className="td whitespace-nowrap text-xs">
                    <span className="font-mono">{r.account.code}</span>{" "}
                    <span className="font-medium">{r.account.name}</span>
                  </td>
                  <td className="td whitespace-nowrap text-xs">{catLabel(r.account.category)}</td>
                  <td className="td whitespace-nowrap text-xs">{formatRupiah(r.opening)}</td>
                  <td className="td whitespace-nowrap text-xs">{r.moveDebit > 0n ? formatRupiah(r.moveDebit) : "-"}</td>
                  <td className="td whitespace-nowrap text-xs">{r.moveCredit > 0n ? formatRupiah(r.moveCredit) : "-"}</td>
                  <td className="td whitespace-nowrap text-xs font-semibold">{formatRupiah(r.closing)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-slate-200 font-semibold">
              <tr>
                <td colSpan={3} className="td text-right text-xs">Total Pergerakan</td>
                <td className="td whitespace-nowrap text-xs">{formatRupiah(report.totalDebit)}</td>
                <td className="td whitespace-nowrap text-xs">{formatRupiah(report.totalCredit)}</td>
                <td className="td text-xs">{balanced ? "✓ seimbang" : "✗"}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
