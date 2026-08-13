import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatRupiah, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, ActiveBadge, EmptyState } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams } from "@/components/table-controls";
import { saveCashbookAction, toggleCashbookAction } from "./actions";

export const metadata = { title: "Cashbooks" };

export default async function CashbooksPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.FINANCE_VIEW);
  const sp = await searchParams;
  const canManage = user.permissions.has(PERMISSIONS.CASH_MANAGE);
  const tableOptions = [
    { value: "code", label: "Kode" },
    { value: "name", label: "Nama" },
  ] as const;
  const table = parseTableQuery(sp, {
    defaultSort: "code",
    defaultDirection: "asc",
    sortOptions: tableOptions,
  });
  const orderBy: Prisma.CashbookOrderByWithRelationInput[] = [
    { [table.sort]: table.direction },
    { id: "asc" },
  ];

  const [cashbooks, totalCount, editRow, totalBalance] = await Promise.all([
    db.cashbook.findMany({
      include: { _count: { select: { transactions: true } } },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.cashbook.count(),
    table.query.edit ? db.cashbook.findUnique({ where: { id: table.query.edit } }) : Promise.resolve(null),
    db.cashbook.aggregate({ where: { isActive: true }, _sum: { balance: true } }),
  ]);
  const total = totalBalance._sum.balance ?? BigInt(0);

  return (
    <div>
      <PageHeader
        title="Cashbooks"
        subtitle={`Saldo hanya berubah melalui transaksi yang diposting. Total kas aktif: ${formatRupiah(total)}.`}
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="card overflow-x-auto">
          {cashbooks.length === 0 ? (
            <EmptyState message="Belum ada cashbook." />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th"><SortableTableHeader basePath="/finance/cashbooks" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="code" label="Kode" /></th>
                  <th className="th"><SortableTableHeader basePath="/finance/cashbooks" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="name" label="Nama" /></th>
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
          <TableControls
            basePath="/finance/cashbooks"
            query={table.query}
            page={table.page}
            pageSize={table.pageSize}
            sort={table.sort}
            direction={table.direction}
            sortOptions={tableOptions}
            total={totalCount}
          />
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
