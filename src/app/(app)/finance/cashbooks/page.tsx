import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatRupiah, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, ActiveBadge, EmptyState } from "@/components/ui";
import { saveCashbookAction, toggleCashbookAction } from "./actions";

export const metadata = { title: "Cashbooks" };

export default async function CashbooksPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; edit?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.FINANCE_VIEW);
  const sp = await searchParams;
  const canManage = user.permissions.has(PERMISSIONS.CASH_MANAGE);

  const cashbooks = await db.cashbook.findMany({
    include: { _count: { select: { transactions: true } } },
    orderBy: { code: "asc" },
  });
  const editRow = sp.edit ? (cashbooks.find((c) => c.id === sp.edit) ?? null) : null;
  const total = cashbooks
    .filter((c) => c.isActive)
    .reduce((s, c) => s + c.balance, BigInt(0));

  return (
    <div>
      <PageHeader
        title="Cashbooks"
        subtitle={`Saldo hanya berubah melalui transaksi yang diposting. Total kas aktif: ${formatRupiah(total)}.`}
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="card overflow-x-auto">
          {cashbooks.length === 0 ? (
            <EmptyState message="Belum ada cashbook." />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th">Kode</th>
                  <th className="th">Nama</th>
                  <th className="th text-right">Saldo</th>
                  <th className="th">Terkunci s.d.</th>
                  <th className="th">Transaksi</th>
                  <th className="th">Status</th>
                  {canManage && <th className="th"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cashbooks.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="td font-mono text-xs">{c.code}</td>
                    <td className="td font-medium">{c.name}</td>
                    <td className="td text-right font-semibold">{formatRupiah(c.balance)}</td>
                    <td className="td text-xs">
                      {c.lockedUntil ? formatDateTime(c.lockedUntil) : "—"}
                    </td>
                    <td className="td">{c._count.transactions}</td>
                    <td className="td"><ActiveBadge isActive={c.isActive} /></td>
                    {canManage && (
                      <td className="td whitespace-nowrap text-right text-xs">
                        <Link href={`/finance/cashbooks?edit=${c.id}`} className="text-brand-600 hover:underline">
                          Ubah
                        </Link>
                        <form action={toggleCashbookAction} className="ml-3 inline">
                          <input type="hidden" name="id" value={c.id} />
                          <button type="submit" className="text-slate-500 hover:underline">
                            {c.isActive ? "Nonaktifkan" : "Aktifkan"}
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {canManage && (
          <div className="card h-fit p-5">
            <h2 className="mb-4 font-medium">
              {editRow ? `Ubah: ${editRow.code}` : "Cashbook Baru"}
            </h2>
            <form action={saveCashbookAction} className="space-y-3">
              {editRow && <input type="hidden" name="id" value={editRow.id} />}
              <div>
                <label className="label" htmlFor="code">Kode</label>
                <input id="code" name="code" className="input" defaultValue={editRow?.code ?? ""} required />
              </div>
              <div>
                <label className="label" htmlFor="name">Nama</label>
                <input id="name" name="name" className="input" defaultValue={editRow?.name ?? ""} required />
              </div>
              <p className="text-xs text-slate-500">
                Saldo tidak dapat diedit — gunakan Top-up / transaksi.
              </p>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary">{editRow ? "Simpan" : "Tambah"}</button>
                {editRow && <Link href="/finance/cashbooks" className="btn-secondary">Batal</Link>}
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
