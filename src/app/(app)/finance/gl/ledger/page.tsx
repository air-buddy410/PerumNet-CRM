import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatRupiah, formatDateTime } from "@/lib/constants";
import { ledger } from "@/lib/gl";
import { PageHeader, EmptyState } from "@/components/ui";
import Link from "next/link";

export const metadata = { title: "Buku Besar" };

function monthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string; from?: string; to?: string }>;
}) {
  await requirePermission(PERMISSIONS.GL_VIEW);
  const sp = await searchParams;
  const def = monthRange();
  const from = sp.from ?? def.from;
  const to = sp.to ?? def.to;

  const accounts = await db.account.findMany({ where: { isActive: true }, orderBy: { code: "asc" } });
  const account = sp.accountId ? accounts.find((a) => a.id === sp.accountId) : null;
  const report = account
    ? await ledger(account.id, new Date(from), new Date(`${to}T23:59:59`))
    : null;

  return (
    <div>
      <PageHeader
        title="Buku Besar"
        subtitle="Lihat mutasi per akun dan saldo berjalan yang dihitung dari jurnal."
      />

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-64">
          <label className="label" htmlFor="accountId">Akun</label>
          <select id="accountId" name="accountId" className="input" defaultValue={sp.accountId ?? ""}>
            <option value="">— pilih akun —</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.code} {a.name}</option>
            ))}
          </select>
        </div>
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

      {account && report && (
        <div className="card overflow-x-auto">
          <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 px-4 py-3 text-sm">
            <span className="font-medium">
              <span className="font-mono">{account.code}</span> {account.name}
            </span>
            <span>
              Saldo awal <strong>{formatRupiah(report.opening)}</strong> · Saldo akhir{" "}
              <strong>{formatRupiah(report.closing)}</strong>
            </span>
          </div>
          {report.entries.length === 0 ? (
            <EmptyState message="Tidak ada mutasi pada rentang ini." />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th">Tanggal</th>
                  <th className="th">Jurnal</th>
                  <th className="th">Keterangan</th>
                  <th className="th">Debit</th>
                  <th className="th">Kredit</th>
                  <th className="th">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.entries.map((e, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="td whitespace-nowrap text-xs">{formatDateTime(e.date)}</td>
                    <td className="td whitespace-nowrap font-mono text-xs">
                      <Link href={`/finance/gl/journal/${e.entryId}`} className="text-brand-600 hover:underline">
                        {e.entryNumber}
                      </Link>
                    </td>
                    <td className="td max-w-72 text-xs">
                      <span className="block truncate">{e.description ?? e.memo ?? "-"}</span>
                    </td>
                    <td className="td whitespace-nowrap text-xs">{e.debit > 0n ? formatRupiah(e.debit) : "-"}</td>
                    <td className="td whitespace-nowrap text-xs">{e.credit > 0n ? formatRupiah(e.credit) : "-"}</td>
                    <td className="td whitespace-nowrap text-xs font-medium">{formatRupiah(e.running)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
