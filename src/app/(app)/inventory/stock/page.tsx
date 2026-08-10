import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { PageHeader, EmptyState } from "@/components/ui";

export const metadata = { title: "Stock" };

export default async function StockPage() {
  await requirePermission(PERMISSIONS.INVENTORY_VIEW);

  const [items, warehouses] = await Promise.all([
    db.item.findMany({
      where: { isActive: true },
      include: { stockLevels: true },
      orderBy: { code: "asc" },
    }),
    db.warehouse.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
  ]);

  // available = onHand − reserved (PRD-WAREHOUSE-ENHANCEMENT F1).
  // Yang dipakai untuk keputusan "bisa dijanjikan atau tidak" adalah available.
  const availableOf = (levels: { onHand: number; reserved: number }[]) =>
    levels.reduce((s, l) => s + l.onHand - l.reserved, 0);

  const lowCount = items.filter((i) => availableOf(i.stockLevels) < i.minStock).length;
  const reservedTotal = items.reduce(
    (s, i) => s + i.stockLevels.reduce((a, l) => a + l.reserved, 0),
    0
  );

  return (
    <div>
      <PageHeader
        title="Posisi Stock"
        subtitle={`Tersedia = fisik − ditahan draft. ${lowCount > 0 ? `${lowCount} item di bawah minimum.` : "Semua item di atas minimum."}${reservedTotal > 0 ? ` ${reservedTotal} unit sedang ditahan draft.` : ""}`}
      />

      <div className="card overflow-x-auto">
        {items.length === 0 ? (
          <EmptyState message="Belum ada item." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Item</th>
                {warehouses.map((w) => (
                  <th key={w.id} className="th text-right">{w.code}</th>
                ))}
                <th className="th text-right">Tersedia</th>
                <th className="th text-right">Fisik</th>
                <th className="th text-right">Ditahan</th>
                <th className="th text-right">Min</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => {
                const available = availableOf(item.stockLevels);
                const onHand = item.stockLevels.reduce((s, l) => s + l.onHand, 0);
                const reserved = item.stockLevels.reduce((s, l) => s + l.reserved, 0);
                const low = available < item.minStock;
                return (
                  <tr key={item.id} className={low ? "bg-red-50/50" : "hover:bg-slate-50"}>
                    <td className="td">
                      <span className="font-mono text-xs">{item.code}</span>{" "}
                      <span className="font-medium">{item.name}</span>
                    </td>
                    {warehouses.map((w) => {
                      const level = item.stockLevels.find((l) => l.warehouseId === w.id);
                      const cellAvailable = (level?.onHand ?? 0) - (level?.reserved ?? 0);
                      return (
                        <td key={w.id} className="td text-right">
                          {cellAvailable}
                          {level && level.reserved > 0 && (
                            <span className="ml-1 text-xs text-amber-600">
                              (−{level.reserved})
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className={`td text-right font-semibold ${low ? "text-red-600" : ""}`}>
                      {available} {item.unit}
                    </td>
                    <td className="td text-right text-slate-500">{onHand}</td>
                    <td className={`td text-right ${reserved > 0 ? "text-amber-600" : "text-slate-400"}`}>
                      {reserved}
                    </td>
                    <td className="td text-right text-slate-400">{item.minStock}</td>
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
