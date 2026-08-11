import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, ACCOUNT_CATEGORIES, POSTING_EVENTS, formatRupiah } from "@/lib/constants";
import { PageHeader, Flash, ActiveBadge, EmptyState } from "@/components/ui";
import { saveAccountAction, savePostingRuleAction } from "../actions";

export const metadata = { title: "Chart of Accounts" };

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; edit?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.GL_VIEW);
  const sp = await searchParams;
  const canManage = user.permissions.has(PERMISSIONS.GL_MANAGE);

  const [accounts, cashbooks, rules, balances] = await Promise.all([
    db.account.findMany({ include: { parent: true }, orderBy: { code: "asc" } }),
    db.cashbook.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    db.postingRule.findMany({ include: { debitAccount: true, creditAccount: true } }),
    db.journalLine.groupBy({ by: ["accountId"], _sum: { debit: true, credit: true } }),
  ]);
  const editRow = sp.edit ? (accounts.find((a) => a.id === sp.edit) ?? null) : null;
  const catLabel = (c: string) => ACCOUNT_CATEGORIES.find(([v]) => v === c)?.[1] ?? c;
  const balanceOf = (a: (typeof accounts)[number]) => {
    const b = balances.find((x) => x.accountId === a.id);
    if (!b) return 0n;
    const raw = (b._sum.debit ?? 0n) - (b._sum.credit ?? 0n);
    return a.normalSide === "DEBIT" ? raw : -raw;
  };

  return (
    <div>
      <PageHeader
        title="Chart of Accounts"
        subtitle="Akun berjenjang dengan saldo yang diturunkan dari jurnal. Cashbook terhubung melalui pemetaan akun."
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <div className="card overflow-x-auto">
            {accounts.length === 0 ? (
              <EmptyState message="Belum ada akun." />
            ) : (
              <table className="w-full">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className="th">Kode</th>
                    <th className="th">Nama</th>
                    <th className="th">Kategori</th>
                    <th className="th">Normal</th>
                    <th className="th">Cashbook</th>
                    <th className="th">Saldo</th>
                    <th className="th">Status</th>
                    {canManage && <th className="th"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {accounts.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="td whitespace-nowrap font-mono text-xs">{a.code}</td>
                      <td className="td whitespace-nowrap text-xs font-medium">
                        {a.parent ? <span className="text-slate-400">↳ </span> : null}
                        {a.name}
                        {a.isTaxAccount && (
                          <span className="ml-1 text-[10px] text-amber-600">pajak {a.taxPercent}%</span>
                        )}
                      </td>
                      <td className="td whitespace-nowrap text-xs">{catLabel(a.category)}</td>
                      <td className="td text-xs">{a.normalSide === "DEBIT" ? "Debit" : "Kredit"}</td>
                      <td className="td whitespace-nowrap text-xs">{cashbooks.find((cb) => cb.id === a.cashbookId)?.code ?? "-"}</td>
                      <td className="td whitespace-nowrap text-xs font-medium">{formatRupiah(balanceOf(a))}</td>
                      <td className="td"><ActiveBadge isActive={a.isActive} /></td>
                      {canManage && (
                        <td className="td text-right text-xs">
                          <Link href={`/finance/gl/accounts?edit=${a.id}`} className="text-brand-600 hover:underline">
                            Ubah
                          </Link>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card overflow-x-auto">
            <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-medium">
              Posting Rules — pemetaan peristiwa → akun (bukan hardcode)
            </h2>
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th">Peristiwa</th>
                  <th className="th">Debit</th>
                  <th className="th">Kredit</th>
                  {canManage && <th className="th">Ubah Pemetaan</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {POSTING_EVENTS.map(([event, label]) => {
                  const rule = rules.find((r) => r.event === event);
                  return (
                    <tr key={event}>
                      <td className="td text-xs">
                        <span className="font-mono">{event}</span>
                        <span className="block text-[10px] text-slate-400">{label}</span>
                      </td>
                      <td className="td whitespace-nowrap text-xs">
                        {rule?.debitAccount ? `${rule.debitAccount.code} ${rule.debitAccount.name}` : "-"}
                      </td>
                      <td className="td whitespace-nowrap text-xs">
                        {rule?.creditAccount ? `${rule.creditAccount.code} ${rule.creditAccount.name}` : "-"}
                      </td>
                      {canManage && (
                        <td className="td">
                          <form action={savePostingRuleAction} className="flex flex-wrap items-center gap-1">
                            <input type="hidden" name="event" value={event} />
                            <input type="hidden" name="isActive" value="on" />
                            <select name="debitAccountId" className="input w-40 px-1 py-0.5 text-xs" defaultValue={rule?.debitAccountId ?? ""}>
                              <option value="">— debit —</option>
                              {accounts.filter((a) => a.isActive).map((a) => (
                                <option key={a.id} value={a.id}>{a.code} {a.name}</option>
                              ))}
                            </select>
                            <select name="creditAccountId" className="input w-40 px-1 py-0.5 text-xs" defaultValue={rule?.creditAccountId ?? ""}>
                              <option value="">— kredit —</option>
                              {accounts.filter((a) => a.isActive).map((a) => (
                                <option key={a.id} value={a.id}>{a.code} {a.name}</option>
                              ))}
                            </select>
                            <button type="submit" className="text-xs text-brand-600 hover:underline">Simpan</button>
                          </form>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {canManage && (
          <div className="card h-fit p-5">
            <h2 className="mb-4 font-medium">{editRow ? `Ubah: ${editRow.code}` : "Akun Baru"}</h2>
            <form action={saveAccountAction} className="space-y-3">
              {editRow && <input type="hidden" name="id" value={editRow.id} />}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="code">Kode</label>
                  <input id="code" name="code" className="input" required placeholder="1-10100" defaultValue={editRow?.code ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="category">Kategori</label>
                  <select id="category" name="category" className="input" defaultValue={editRow?.category ?? "KAS_BANK"}>
                    {ACCOUNT_CATEGORIES.map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="name">Nama</label>
                <input id="name" name="name" className="input" required defaultValue={editRow?.name ?? ""} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="parentId">Akun Induk</label>
                  <select id="parentId" name="parentId" className="input" defaultValue={editRow?.parentId ?? ""}>
                    <option value="">— tanpa induk —</option>
                    {accounts.filter((a) => a.id !== editRow?.id).map((a) => (
                      <option key={a.id} value={a.id}>{a.code} {a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="cashbookId">Jembatan Cashbook</label>
                  <select id="cashbookId" name="cashbookId" className="input" defaultValue={editRow?.cashbookId ?? ""}>
                    <option value="">— tidak —</option>
                    {cashbooks.map((cb) => (
                      <option key={cb.id} value={cb.id}>{cb.code}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="taxPercent">Persen Pajak</label>
                  <input id="taxPercent" name="taxPercent" type="number" step="0.01" min={0} max={100} className="input" defaultValue={editRow?.taxPercent ?? ""} />
                </div>
                <div className="flex flex-col justify-end gap-1 pb-1">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="isTaxAccount" className="h-4 w-4" defaultChecked={editRow?.isTaxAccount ?? false} />
                    Akun pajak
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="isActive" className="h-4 w-4" defaultChecked={editRow?.isActive ?? true} />
                    Aktif
                  </label>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary">{editRow ? "Simpan" : "Tambah"}</button>
                {editRow && <Link href="/finance/gl/accounts" className="btn-secondary">Batal</Link>}
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
