import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatRupiah } from "@/lib/constants";
import { merchantFeeSummary } from "@/lib/payments";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams, type TableSortOption } from "@/components/table-controls";
import { saveMerchantAction } from "../actions";

export const metadata = { title: "Merchant & Kolektor" };
const sortOptions: readonly TableSortOption[] = [
  { value: "code", label: "Kode" },
  { value: "name", label: "Nama" },
  { value: "feePercent", label: "Fee" },
];

export default async function MerchantsPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.BILLING_VIEW);
  const sp = await searchParams;
  const table = parseTableQuery(sp, { defaultSort: "code", defaultDirection: "asc", sortOptions });
  const canManage = user.permissions.has(PERMISSIONS.MERCHANTS_MANAGE);
  const orderBy: Prisma.MerchantOrderByWithRelationInput[] = table.sort === "name"
    ? [{ name: table.direction }, { id: "asc" }]
    : table.sort === "feePercent"
      ? [{ feePercent: table.direction }, { id: "asc" }]
      : [{ code: table.direction }, { id: "asc" }];

  const [merchants, total, cashbooks, fees, editRow] = await Promise.all([
    db.merchant.findMany({ orderBy, skip: (table.page - 1) * table.pageSize, take: table.pageSize }),
    db.merchant.count(),
    db.cashbook.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    merchantFeeSummary(),
    table.query.edit ? db.merchant.findUnique({ where: { id: table.query.edit } }) : Promise.resolve(null),
  ]);
  const feeOf = (id: string) => fees.find((f) => f.merchantId === id);

  return (
    <div>
      <PageHeader
        title="Merchant & Kolektor"
        subtitle="Kelola unit penagih dan mitra BUMDES; fee komisi direkap sebagai hutang fee."
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="crm-list-column">
          <div className="card overflow-x-auto">
          {merchants.length === 0 ? (
            <EmptyState message="Belum ada merchant." />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th"><SortableTableHeader basePath="/billing/merchants" currentDirection={table.direction} currentSort={table.sort} label="Kode" query={table.query} sortKey="code" /></th>
                  <th className="th"><SortableTableHeader basePath="/billing/merchants" currentDirection={table.direction} currentSort={table.sort} label="Nama" query={table.query} sortKey="name" /></th>
                  <th className="th">Fee %</th>
                  <th className="th">Payment Point</th>
                  <th className="th">Tertagih (posted)</th>
                  <th className="th">Hutang Fee</th>
                  <th className="th">Status</th>
                  {canManage && <th className="th"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {merchants.map((m) => {
                  const f = feeOf(m.id);
                  return (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="td font-mono text-xs">{m.code}</td>
                      <td className="td whitespace-nowrap text-xs font-medium">{m.name}</td>
                      <td className="td text-xs">{m.feePercent}%</td>
                      <td className="td text-xs">{m.isPaymentPoint ? "Ya" : "-"}</td>
                      <td className="td whitespace-nowrap text-xs">
                        {f ? `${formatRupiah(f.totalCollected)} (${f.paymentCount}×)` : "-"}
                      </td>
                      <td className="td whitespace-nowrap text-xs font-medium">
                        {f && f.totalFee > 0n ? formatRupiah(f.totalFee) : "-"}
                      </td>
                      <td className="td">
                        <Badge value={m.isActive ? "ACTIVE" : "INACTIVE"} label={m.isActive ? "Aktif" : "Nonaktif"} />
                      </td>
                      {canManage && (
                        <td className="td text-right text-xs">
                          <Link href={`/billing/merchants?edit=${m.id}`} className="text-brand-600 hover:underline">
                            Ubah
                          </Link>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          </div>

        <TableControls basePath="/billing/merchants" direction={table.direction} page={table.page} pageSize={table.pageSize} query={table.query} sort={table.sort} sortOptions={sortOptions} total={total} />
        </div>

        {canManage && (
          <div className="card h-fit p-5">
            <h2 className="mb-4 font-medium">{editRow ? `Ubah: ${editRow.code}` : "Merchant Baru"}</h2>
            <form action={saveMerchantAction} className="space-y-3">
              {editRow && <input type="hidden" name="id" value={editRow.id} />}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="code">Kode</label>
                  <input id="code" name="code" className="input" defaultValue={editRow?.code ?? ""} required placeholder="BUMDES-A" />
                </div>
                <div>
                  <label className="label" htmlFor="feePercent">Fee (%)</label>
                  <input id="feePercent" name="feePercent" type="number" step="0.01" min={0} max={100} className="input" required defaultValue={editRow?.feePercent ?? 0} />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="name">Nama</label>
                <input id="name" name="name" className="input" defaultValue={editRow?.name ?? ""} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="contactName">Kontak</label>
                  <input id="contactName" name="contactName" className="input" defaultValue={editRow?.contactName ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="phone">Telepon</label>
                  <input id="phone" name="phone" className="input" defaultValue={editRow?.phone ?? ""} />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="address">Alamat</label>
                <textarea id="address" name="address" rows={2} className="input" defaultValue={editRow?.address ?? ""} />
              </div>
              <div>
                <label className="label" htmlFor="cashbookId">Kas Setoran</label>
                <select id="cashbookId" name="cashbookId" className="input" defaultValue={editRow?.cashbookId ?? ""}>
                  <option value="">— pilih —</option>
                  {cashbooks.map((cb) => (
                    <option key={cb.id} value={cb.id}>{cb.code} · {cb.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isPaymentPoint" className="h-4 w-4" defaultChecked={editRow?.isPaymentPoint ?? false} />
                  Payment point
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isActive" className="h-4 w-4" defaultChecked={editRow?.isActive ?? true} />
                  Aktif
                </label>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary">{editRow ? "Simpan" : "Tambah"}</button>
                {editRow && <Link href="/billing/merchants" className="btn-secondary">Batal</Link>}
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
