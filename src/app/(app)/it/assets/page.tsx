import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, IT_ASSET_TYPES, statusLabel, formatRupiah } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { saveItAssetAction } from "../actions";

export const metadata = { title: "Domain, SSL & License" };

export default async function ItAssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; edit?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.IT_VIEW);
  const sp = await searchParams;
  const canManage = user.permissions.has(PERMISSIONS.IT_ASSETS_MANAGE);

  const [assets, users] = await Promise.all([
    db.itAsset.findMany({
      include: { owner: true },
      orderBy: [{ expiryDate: "asc" }],
    }),
    db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);
  const editRow = sp.edit ? (assets.find((a) => a.id === sp.edit) ?? null) : null;
  const typeLabel = (t: string) => IT_ASSET_TYPES.find(([v]) => v === t)?.[1] ?? t;
  const now = Date.now();
  const daysLeft = (d: Date | null) =>
    d === null ? null : Math.ceil((d.getTime() - now) / 86400e3);

  return (
    <div>
      <PageHeader
        title="Domain, SSL, License & Subscription"
        subtitle="Pantau aset digital, tanggal kedaluwarsa, dan pengingat perpanjangan."
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="card overflow-x-auto">
          {assets.length === 0 ? (
            <EmptyState message="Belum ada aset terdaftar." />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th">Nama</th>
                  <th className="th">Jenis</th>
                  <th className="th">Provider</th>
                  <th className="th">Expiry</th>
                  <th className="th">Auto-Renew</th>
                  <th className="th">Biaya</th>
                  <th className="th">Status</th>
                  {canManage && <th className="th"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assets.map((a) => {
                  const left = daysLeft(a.expiryDate);
                  const warn = left !== null && left <= a.reminderDays && a.status === "ACTIVE";
                  return (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="td font-medium">{a.name}</td>
                      <td className="td text-xs">{typeLabel(a.assetType)}</td>
                      <td className="td text-xs">{a.provider ?? "-"}</td>
                      <td className="td text-xs">
                        {a.expiryDate ? (
                          <span className={warn ? "font-semibold text-red-600" : ""}>
                            {a.expiryDate.toLocaleDateString("id-ID")}
                            {left !== null && left >= 0 ? ` (${left} hari)` : left !== null ? " (lewat!)" : ""}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="td text-xs">{a.autoRenewal ? "Ya" : "-"}</td>
                      <td className="td text-xs">{a.cost !== null ? formatRupiah(a.cost) : "-"}</td>
                      <td className="td"><Badge value={a.status} label={statusLabel(a.status)} /></td>
                      {canManage && (
                        <td className="td text-right text-xs">
                          <Link href={`/it/assets?edit=${a.id}`} className="text-brand-600 hover:underline">
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

        {canManage && (
          <div className="card h-fit p-5">
            <h2 className="mb-4 font-medium">{editRow ? `Ubah: ${editRow.name}` : "Aset Baru"}</h2>
            <form action={saveItAssetAction} className="space-y-3">
              {editRow && <input type="hidden" name="id" value={editRow.id} />}
              <div>
                <label className="label" htmlFor="name">Nama</label>
                <input id="name" name="name" className="input" defaultValue={editRow?.name ?? ""} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="assetType">Jenis</label>
                  <select id="assetType" name="assetType" className="input" defaultValue={editRow?.assetType ?? "DOMAIN"}>
                    {IT_ASSET_TYPES.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="provider">Provider</label>
                  <input id="provider" name="provider" className="input" defaultValue={editRow?.provider ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="purchaseDate">Tgl Pembelian</label>
                  <input id="purchaseDate" name="purchaseDate" type="date" className="input" defaultValue={editRow?.purchaseDate ? editRow.purchaseDate.toISOString().slice(0, 10) : ""} />
                </div>
                <div>
                  <label className="label" htmlFor="expiryDate">Expiry</label>
                  <input id="expiryDate" name="expiryDate" type="date" className="input" defaultValue={editRow?.expiryDate ? editRow.expiryDate.toISOString().slice(0, 10) : ""} />
                </div>
                <div>
                  <label className="label" htmlFor="cost">Biaya (Rp)</label>
                  <input id="cost" name="cost" inputMode="numeric" className="input" defaultValue={editRow?.cost !== null && editRow !== null ? String(editRow.cost) : ""} />
                </div>
                <div>
                  <label className="label" htmlFor="paymentMethod">Pembayaran</label>
                  <input id="paymentMethod" name="paymentMethod" className="input" defaultValue={editRow?.paymentMethod ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="ownerId">Owner</label>
                  <select id="ownerId" name="ownerId" className="input" defaultValue={editRow?.ownerId ?? ""}>
                    <option value="">— pilih —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="reminderDays">Reminder (hari)</label>
                  <input id="reminderDays" name="reminderDays" type="number" min={1} className="input" defaultValue={editRow?.reminderDays ?? 30} />
                </div>
                <div>
                  <label className="label" htmlFor="status">Status</label>
                  <select id="status" name="status" className="input" defaultValue={editRow?.status ?? "ACTIVE"}>
                    <option value="ACTIVE">Aktif</option>
                    <option value="EXPIRED">Kedaluwarsa</option>
                    <option value="CANCELLED">Dibatalkan</option>
                  </select>
                </div>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <input type="checkbox" name="autoRenewal" className="h-4 w-4" defaultChecked={editRow?.autoRenewal ?? false} />
                  Auto-renewal
                </label>
              </div>
              <div>
                <label className="label" htmlFor="notes">Catatan</label>
                <textarea id="notes" name="notes" rows={2} className="input" defaultValue={editRow?.notes ?? ""} />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary">{editRow ? "Simpan" : "Tambah"}</button>
                {editRow && <Link href="/it/assets" className="btn-secondary">Batal</Link>}
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
