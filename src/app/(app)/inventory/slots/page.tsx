import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { PageHeader, EmptyState, Flash } from "@/components/ui";
import { createSlotAction, moveAllocationAction, deactivateSlotAction } from "./actions";

export const metadata = { title: "Slot Peruntukan" };

// Fase 20 (F9). "Belum dialokasikan" adalah TURUNAN (onHand − seluruh alokasi
// bernama), bukan baris data — jadi tidak pernah bisa menyimpang dari saldo.
export default async function SlotsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  const sp = await searchParams;

  const [warehouses, slotTypes, slots, items, levels, allocations, policy] = await Promise.all([
    db.warehouse.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    db.stockSlotType.findMany({ where: { isActive: true, isSystem: false }, orderBy: { code: "asc" } }),
    db.stockSlot.findMany({
      where: { isActive: true },
      include: { type: true, warehouse: true },
      orderBy: [{ warehouseId: "asc" }, { code: "asc" }],
    }),
    db.item.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    db.stockLevel.findMany(),
    db.slotAllocation.findMany({ include: { slot: true, item: true } }),
    db.slotTransferPolicy.findFirst({ where: { isActive: true } }),
  ]);

  const allocatedByWarehouseItem = new Map<string, number>();
  for (const a of allocations) {
    const key = `${a.slot.warehouseId}::${a.itemId}`;
    allocatedByWarehouseItem.set(key, (allocatedByWarehouseItem.get(key) ?? 0) + a.qty);
  }

  const unallocatedRows = levels
    .map((l) => {
      const allocated = allocatedByWarehouseItem.get(`${l.warehouseId}::${l.itemId}`) ?? 0;
      return { ...l, allocated, unallocated: l.onHand - allocated };
    })
    .filter((r) => r.onHand > 0);

  const itemName = new Map(items.map((i) => [i.id, i.name]));
  const warehouseCode = new Map(warehouses.map((w) => [w.id, w.code]));

  return (
    <div>
      <PageHeader
        title="Slot Peruntukan"
        subtitle={`Alokasi stock menurut peruntukan. ${policy ? `Perpindahan di atas ${policy.maxQty} unit butuh izin khusus.` : "Belum ada kebijakan ambang."}`}
      />

      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-medium">Pindahkan Alokasi</h2>
          <form action={moveAllocationAction} className="space-y-3">
            <select name="warehouseId" className="input w-full" required aria-label="Gudang">
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
              ))}
            </select>
            <select name="itemId" className="input w-full" required aria-label="Material">
              {items.map((i) => (
                <option key={i.id} value={i.id}>{i.code} · {i.name}</option>
              ))}
            </select>
            <div className="grid gap-2 sm:grid-cols-2">
              <select name="fromSlotId" className="input" aria-label="Dari slot">
                <option value="">— dari sisa belum dialokasikan —</option>
                {slots.map((s) => (
                  <option key={s.id} value={s.id}>{s.warehouse.code}/{s.code}</option>
                ))}
              </select>
              <select name="toSlotId" className="input" aria-label="Ke slot">
                <option value="">— kembalikan ke sisa —</option>
                {slots.map((s) => (
                  <option key={s.id} value={s.id}>{s.warehouse.code}/{s.code}</option>
                ))}
              </select>
            </div>
            <input type="number" name="qty" min={1} defaultValue={1} className="input w-full" aria-label="Jumlah" />
            <input type="text" name="note" placeholder="Catatan (opsional)" className="input w-full" />
            <button type="submit" className="btn-primary w-full justify-center">Pindahkan</button>
          </form>
        </div>

        <div className="card p-5">
          <h2 className="mb-3 text-sm font-medium">Tambah Slot</h2>
          <form action={createSlotAction} className="space-y-3">
            <select name="warehouseId" className="input w-full" required aria-label="Gudang slot">
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
              ))}
            </select>
            <select name="typeId" className="input w-full" required aria-label="Tipe slot">
              {slotTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.code} — {t.name}</option>
              ))}
            </select>
            <input type="text" name="code" placeholder="Kode slot" className="input w-full" required />
            <input type="text" name="name" placeholder="Nama (opsional)" className="input w-full" />
            <button type="submit" className="btn-secondary w-full justify-center">Tambah</button>
          </form>
        </div>
      </div>

      <h2 className="mb-3 mt-6 text-sm font-medium">Sisa Belum Dialokasikan</h2>
      <div className="card overflow-x-auto">
        {unallocatedRows.length === 0 ? (
          <EmptyState message="Belum ada stock di gudang manapun." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Gudang</th>
                <th className="th">Material</th>
                <th className="th text-right">Fisik</th>
                <th className="th text-right">Teralokasi</th>
                <th className="th text-right">Belum dialokasikan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {unallocatedRows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="td font-mono text-xs">{warehouseCode.get(r.warehouseId) ?? "-"}</td>
                  <td className="td">{itemName.get(r.itemId) ?? "-"}</td>
                  <td className="td text-right">{r.onHand}</td>
                  <td className="td text-right">{r.allocated}</td>
                  <td className={`td text-right font-semibold ${r.unallocated < 0 ? "text-red-600" : ""}`}>
                    {r.unallocated}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2 className="mb-3 mt-6 text-sm font-medium">Slot Aktif</h2>
      <div className="card overflow-x-auto">
        {slots.length === 0 ? (
          <EmptyState message="Belum ada slot." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Gudang</th>
                <th className="th">Kode</th>
                <th className="th">Tipe</th>
                <th className="th text-right">Total Alokasi</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {slots.map((s) => {
                const total = allocations
                  .filter((a) => a.slotId === s.id)
                  .reduce((sum, a) => sum + a.qty, 0);
                return (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="td font-mono text-xs">{s.warehouse.code}</td>
                    <td className="td font-medium">{s.code}</td>
                    <td className="td text-xs">{s.type.code} — {s.type.name}</td>
                    <td className="td text-right">{total}</td>
                    <td className="td text-right">
                      <form action={deactivateSlotAction}>
                        <input type="hidden" name="slotId" value={s.id} />
                        <button type="submit" className="btn-danger text-xs">Nonaktifkan</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
