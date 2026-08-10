import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  TRACKING_TYPES,
  ITEM_UNITS,
  statusLabel,
} from "@/lib/constants";
import { PageHeader, Flash, Badge, ActiveBadge, EmptyState } from "@/components/ui";
import { saveItemAction, toggleItemAction } from "../actions";

export const metadata = { title: "Item Master" };

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; edit?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  const sp = await searchParams;
  const canManage = user.permissions.has(PERMISSIONS.ITEMS_MANAGE);

  const [items, categories] = await Promise.all([
    db.item.findMany({
      include: {
        category: true,
        stockLevels: true,
        _count: { select: { devices: true } },
      },
      orderBy: { code: "asc" },
    }),
    db.category.findMany({ where: { type: "ITEM", isActive: true }, orderBy: { name: "asc" } }),
  ]);
  const editRow = sp.edit ? (items.find((i) => i.id === sp.edit) ?? null) : null;

  return (
    <div>
      <PageHeader
        title="Item Master"
        subtitle="Stock hanya berubah lewat transaksi resmi — tidak ada edit qty langsung (PRD §7.1)."
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="card overflow-x-auto">
          {items.length === 0 ? (
            <EmptyState message="Belum ada item." />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th">Kode</th>
                  <th className="th">Nama</th>
                  <th className="th">Tracking</th>
                  <th className="th">Total Stock</th>
                  <th className="th">Min</th>
                  <th className="th">Status</th>
                  {canManage && <th className="th"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => {
                  // Tersedia = fisik − ditahan draft (PRD-WAREHOUSE-ENHANCEMENT F1).
                  const total = item.stockLevels.reduce((s, l) => s + l.onHand - l.reserved, 0);
                  const low = total < item.minStock;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="td font-mono text-xs">{item.code}</td>
                      <td className="td">
                        <div className="font-medium">{item.name}</div>
                        <div className="text-xs text-slate-500">
                          {[item.brand, item.model, item.category?.name].filter(Boolean).join(" · ")}
                        </div>
                      </td>
                      <td className="td">
                        <Badge value={item.trackingType} label={statusLabel(item.trackingType)} />
                      </td>
                      <td className="td whitespace-nowrap">
                        <span className={low ? "font-bold text-red-600" : ""}>
                          {total} {item.unit}
                        </span>
                        {low && <span className="ml-1 text-xs text-red-500">(low)</span>}
                        {item.trackingType === "SERIALIZED" && (
                          <span className="ml-1 text-xs text-slate-400">
                            · {item._count.devices} unit terdaftar
                          </span>
                        )}
                      </td>
                      <td className="td">{item.minStock}</td>
                      <td className="td"><ActiveBadge isActive={item.isActive} /></td>
                      {canManage && (
                        <td className="td whitespace-nowrap text-right text-xs">
                          <Link href={`/inventory/items?edit=${item.id}`} className="text-brand-600 hover:underline">
                            Ubah
                          </Link>
                          <form action={toggleItemAction} className="ml-3 inline">
                            <input type="hidden" name="id" value={item.id} />
                            <button type="submit" className="text-slate-500 hover:underline">
                              {item.isActive ? "Nonaktifkan" : "Aktifkan"}
                            </button>
                          </form>
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
            <h2 className="mb-4 font-medium">{editRow ? `Ubah: ${editRow.code}` : "Item Baru"}</h2>
            <form action={saveItemAction} className="space-y-3">
              {editRow && <input type="hidden" name="id" value={editRow.id} />}
              <div>
                <label className="label" htmlFor="code">Kode</label>
                <input id="code" name="code" className="input" defaultValue={editRow?.code ?? ""} required />
              </div>
              <div>
                <label className="label" htmlFor="name">Nama</label>
                <input id="name" name="name" className="input" defaultValue={editRow?.name ?? ""} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="brand">Brand</label>
                  <input id="brand" name="brand" className="input" defaultValue={editRow?.brand ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="model">Model</label>
                  <input id="model" name="model" className="input" defaultValue={editRow?.model ?? ""} />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="categoryId">Kategori</label>
                <select id="categoryId" name="categoryId" className="input" defaultValue={editRow?.categoryId ?? ""}>
                  <option value="">— tanpa kategori —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="unit">Satuan</label>
                  <select id="unit" name="unit" className="input" defaultValue={editRow?.unit ?? "pcs"}>
                    {ITEM_UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="minStock">Min. Stock</label>
                  <input id="minStock" name="minStock" type="number" min={0} className="input" defaultValue={editRow?.minStock ?? 0} />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="trackingType">Tracking</label>
                <select id="trackingType" name="trackingType" className="input" defaultValue={editRow?.trackingType ?? "BULK"}>
                  {TRACKING_TYPES.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  Tracking type terkunci setelah item memiliki transaksi.
                </p>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary">{editRow ? "Simpan" : "Tambah"}</button>
                {editRow && <Link href="/inventory/items" className="btn-secondary">Batal</Link>}
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
