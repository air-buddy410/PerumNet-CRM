import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatRupiah, statusLabel } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams } from "@/components/table-controls";
import {
  saveBillingProfileAction,
  attachAddonAction,
  detachAddonAction,
} from "../actions";

export const metadata = { title: "Billing Profiles" };

export default async function BillingProfilesPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.BILLING_VIEW);
  const sp = await searchParams;
  const canManage = user.permissions.has(PERMISSIONS.BILLING_MANAGE);
  const tableOptions = [
    { value: "serviceNumber", label: "Layanan" },
    { value: "monthlyPrice", label: "Harga" },
    { value: "status", label: "Status" },
  ] as const;
  const table = parseTableQuery(sp, { defaultSort: "serviceNumber", defaultDirection: "asc", sortOptions: tableOptions });
  const orderBy: Prisma.SubscriptionOrderByWithRelationInput[] = [
    { [table.sort]: table.direction },
    { id: "asc" },
  ];
  const listWhere: Prisma.SubscriptionWhereInput = { status: { notIn: ["DRAFT", "TERMINATED"] } };
  const subscriptionInclude = {
    customer: true,
    package: true,
    billingProfile: true,
    addons: { where: { endedAt: null }, include: { addon: true } },
  } as const;

  const [subs, totalCount, editRow, addonMaster] = await Promise.all([
    db.subscription.findMany({
      where: listWhere,
      include: subscriptionInclude,
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.subscription.count({ where: listWhere }),
    table.query.edit
      ? db.subscription.findUnique({ where: { id: table.query.edit }, include: subscriptionInclude })
      : Promise.resolve(null),
    db.addonService.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Billing Profiles"
        subtitle="Atur awal penagihan, tanggal terbit, jatuh tempo, PPN, dan layanan tambahan."
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="card overflow-x-auto">
          {subs.length === 0 ? (
            <EmptyState message="Belum ada langganan aktif." />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th"><SortableTableHeader basePath="/billing/profiles" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="serviceNumber" label="Layanan" /></th>
                  <th className="th">Pelanggan</th>
                  <th className="th">Paket</th>
                  <th className="th"><SortableTableHeader basePath="/billing/profiles" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="monthlyPrice" label="Harga + Addon" /></th>
                  <th className="th">Terbit / Tempo</th>
                  <th className="th">PPN</th>
                  <th className="th"><SortableTableHeader basePath="/billing/profiles" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="status" label="Profil" /></th>
                  {canManage && <th className="th"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {subs.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="td whitespace-nowrap font-mono text-xs">{s.serviceNumber}</td>
                    <td className="td whitespace-nowrap text-xs font-medium">{s.customer.name}</td>
                    <td className="td whitespace-nowrap text-xs">{s.package.name}</td>
                    <td className="td whitespace-nowrap text-xs">
                      {formatRupiah(s.monthlyPrice)}
                      {s.addons.length > 0 && (
                        <span className="block text-[10px] text-slate-400">
                          +{s.addons.length} addon
                        </span>
                      )}
                    </td>
                    <td className="td whitespace-nowrap text-xs">
                      {s.billingProfile
                        ? `tgl ${s.billingProfile.invoiceDay} / ${s.billingProfile.dueDays} hari`
                        : "-"}
                    </td>
                    <td className="td text-xs">
                      {s.billingProfile ? `${s.billingProfile.taxPercent}%` : "-"}
                    </td>
                    <td className="td">
                      {s.billingProfile ? (
                        <Badge
                          value={s.billingProfile.isActive ? "ACTIVE" : "INACTIVE"}
                          label={s.billingProfile.isActive ? "Aktif" : "Nonaktif"}
                        />
                      ) : (
                        <Badge value="PENDING" label="Belum diatur" />
                      )}
                    </td>
                    {canManage && (
                      <td className="td text-right text-xs">
                        <Link href={`/billing/profiles?edit=${s.id}`} className="text-brand-600 hover:underline">
                          Atur
                        </Link>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <TableControls
            basePath="/billing/profiles"
            query={table.query}
            page={table.page}
            pageSize={table.pageSize}
            sort={table.sort}
            direction={table.direction}
            sortOptions={tableOptions}
            total={totalCount}
          />
        </div>

        {canManage && editRow && (
          <div className="space-y-6">
            <div className="card h-fit p-5">
              <h2 className="mb-1 font-medium">{editRow.serviceNumber}</h2>
              <p className="mb-4 text-xs text-slate-500">
                {editRow.customer.name} · {editRow.package.name} · {formatRupiah(editRow.monthlyPrice)}/bulan · {statusLabel(editRow.status)}
              </p>
              <form action={saveBillingProfileAction} className="space-y-3">
                <input type="hidden" name="subscriptionId" value={editRow.id} />
                <div>
                  <label className="label" htmlFor="billingStartAt">Mulai Ditagih</label>
                  <input
                    id="billingStartAt"
                    name="billingStartAt"
                    type="date"
                    className="input"
                    required
                    defaultValue={
                      (editRow.billingProfile?.billingStartAt ?? editRow.activatedAt ?? new Date())
                        .toISOString()
                        .slice(0, 10)
                    }
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="label" htmlFor="invoiceDay">Tgl Terbit</label>
                    <input id="invoiceDay" name="invoiceDay" type="number" min={1} max={28} className="input" required defaultValue={editRow.billingProfile?.invoiceDay ?? editRow.billingCycleDay} />
                  </div>
                  <div>
                    <label className="label" htmlFor="dueDays">Tempo (hari)</label>
                    <input id="dueDays" name="dueDays" type="number" min={1} max={60} className="input" required defaultValue={editRow.billingProfile?.dueDays ?? 20} />
                  </div>
                  <div>
                    <label className="label" htmlFor="isolirDay">Tgl Isolir</label>
                    <input id="isolirDay" name="isolirDay" type="number" min={1} max={28} className="input" defaultValue={editRow.billingProfile?.isolirDay ?? ""} />
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="taxPercent">PPN (%)</label>
                  <input id="taxPercent" name="taxPercent" type="number" step="0.01" min={0} max={100} className="input" required defaultValue={editRow.billingProfile?.taxPercent ?? 11} />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isActive" className="h-4 w-4" defaultChecked={editRow.billingProfile?.isActive ?? true} />
                  Aktif ditagih oleh generator bulanan
                </label>
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary">Simpan Profil</button>
                  <Link href="/billing/profiles" className="btn-secondary">Tutup</Link>
                </div>
              </form>
            </div>

            <div className="card h-fit p-5">
              <h2 className="mb-3 text-sm font-medium">Addon Langganan</h2>
              {editRow.addons.length === 0 ? (
                <p className="mb-3 text-xs text-slate-500">Belum ada addon aktif.</p>
              ) : (
                <ul className="mb-3 space-y-1 text-sm">
                  {editRow.addons.map((sa) => (
                    <li key={sa.id} className="flex items-center justify-between gap-2">
                      <span>
                        {sa.addon.name}{" "}
                        <span className="text-xs text-slate-500">
                          {formatRupiah(sa.priceOverride ?? sa.addon.monthlyPrice)}/bln
                        </span>
                      </span>
                      <form action={detachAddonAction}>
                        <input type="hidden" name="subscriptionAddonId" value={sa.id} />
                        <input type="hidden" name="subscriptionId" value={editRow.id} />
                        <button type="submit" className="text-xs text-red-600 hover:underline">Hentikan</button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
              <form action={attachAddonAction} className="space-y-3">
                <input type="hidden" name="subscriptionId" value={editRow.id} />
                <select name="addonId" className="input" required defaultValue="">
                  <option value="" disabled>— pilih addon —</option>
                  {addonMaster.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({formatRupiah(a.monthlyPrice)}/bln)
                    </option>
                  ))}
                </select>
                <input name="priceOverride" inputMode="numeric" className="input" placeholder="Harga khusus (kosongkan = harga master)" />
                <button type="submit" className="btn-secondary w-full justify-center">Tambah Addon</button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
