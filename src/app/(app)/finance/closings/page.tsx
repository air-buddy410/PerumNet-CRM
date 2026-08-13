import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, statusLabel, formatRupiah, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams } from "@/components/table-controls";
import { createClosingAction } from "./actions";

export const metadata = { title: "Closing Kas" };

export default async function ClosingsPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.FINANCE_VIEW);
  const sp = await searchParams;
  const canManage = user.permissions.has(PERMISSIONS.CLOSINGS_MANAGE);
  const tableOptions = [
    { value: "createdAt", label: "Tanggal" },
    { value: "closingNumber", label: "Nomor" },
  ] as const;
  const table = parseTableQuery(sp, {
    defaultSort: "createdAt",
    sortOptions: tableOptions,
  });
  const orderBy: Prisma.CashClosingOrderByWithRelationInput[] = [
    { [table.sort]: table.direction },
    { id: "asc" },
  ];

  const [closings, totalCount, varianceCount, cashbooks] = await Promise.all([
    db.cashClosing.findMany({
      include: { cashbook: true, createdBy: true },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.cashClosing.count(),
    db.cashClosing.count({ where: { variance: { not: BigInt(0) } } }),
    db.cashbook.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Closing Kas"
        subtitle={`Harian: bandingkan kas fisik dengan sistem dan beri alasan untuk setiap selisih. Bulanan: kunci periode. ${varianceCount} closing dengan selisih.`}
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="card overflow-x-auto">
          {closings.length === 0 ? (
            <EmptyState message="Belum ada closing." />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th"><SortableTableHeader basePath="/finance/closings" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="closingNumber" label="Nomor" /></th>
                  <th className="th">Cashbook</th>
                  <th className="th">Jenis</th>
                  <th className="th text-right">Sistem</th>
                  <th className="th text-right">Fisik</th>
                  <th className="th text-right">Variance</th>
                  <th className="th">Oleh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {closings.map((c) => (
                  <tr key={c.id} className={c.variance !== BigInt(0) ? "bg-red-50/50" : "hover:bg-slate-50"}>
                    <td className="td whitespace-nowrap font-medium">{c.closingNumber}</td>
                    <td className="td text-xs">{c.cashbook.name}</td>
                    <td className="td">
                      <Badge
                        value={c.type === "MONTHLY" ? "APPROVED" : "PENDING"}
                        label={statusLabel(c.type)}
                      />
                    </td>
                    <td className="td text-right">{formatRupiah(c.systemBalance)}</td>
                    <td className="td text-right">{formatRupiah(c.physicalBalance)}</td>
                    <td className={`td text-right font-semibold ${c.variance !== BigInt(0) ? "text-red-600" : ""}`}>
                      {c.variance === BigInt(0) ? "0" : formatRupiah(c.variance)}
                      {c.reason && (
                        <span className="block text-xs font-normal text-slate-500">{c.reason}</span>
                      )}
                    </td>
                    <td className="td whitespace-nowrap text-xs text-slate-500">
                      {c.createdBy.name} · {formatDateTime(c.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <TableControls
            basePath="/finance/closings"
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
            <h2 className="mb-4 font-medium">Buat Closing</h2>
            <form action={createClosingAction} className="space-y-3">
              <div>
                <label className="label" htmlFor="cashbookId">Cashbook</label>
                <select id="cashbookId" name="cashbookId" className="input" required defaultValue="">
                  <option value="" disabled>— pilih —</option>
                  {cashbooks.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — saldo sistem {formatRupiah(c.balance)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="type">Jenis</label>
                <select id="type" name="type" className="input" defaultValue="DAILY">
                  <option value="DAILY">Harian (variance check)</option>
                  <option value="MONTHLY">Bulanan (kunci periode)</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="physicalBalance">Kas Fisik (Rp)</label>
                <input id="physicalBalance" name="physicalBalance" inputMode="numeric" className="input" required />
              </div>
              <div>
                <label className="label" htmlFor="reason">Alasan Variance</label>
                <textarea id="reason" name="reason" rows={2} className="input" placeholder="wajib bila ada selisih" />
              </div>
              <div>
                <label className="label" htmlFor="lockedUntil">Kunci Periode s.d. (bulanan)</label>
                <input id="lockedUntil" name="lockedUntil" type="date" className="input" />
              </div>
              <button type="submit" className="btn-primary w-full justify-center">
                Simpan Closing
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
