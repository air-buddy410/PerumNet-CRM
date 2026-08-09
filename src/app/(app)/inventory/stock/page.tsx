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

  const lowCount = items.filter(
    (i) => i.stockLevels.reduce((s, l) => s + l.qty, 0) < i.minStock
  ).length;

  return (
    <div>
      <PageHeader
        title="Posisi Stock"
        subtitle={`Saldo per gudang — hasil transaksi posted. ${lowCount > 0 ? `${lowCount} item di bawah minimum.` : "Semua item di atas minimum."}`}
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
                <th className="th text-right">Total</th>
                <th className="th text-right">Min</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => {
                const total = item.stockLevels.reduce((s, l) => s + l.qty, 0);
                const low = total < item.minStock;
                return (
                  <tr key={item.id} className={low ? "bg-red-50/50" : "hover:bg-slate-50"}>
                    <td className="td">
                      <span className="font-mono text-xs">{item.code}</span>{" "}
                      <span className="font-medium">{item.name}</span>
                    </td>
                    {warehouses.map((w) => {
                      const level = item.stockLevels.find((l) => l.warehouseId === w.id);
                      return (
                        <td key={w.id} className="td text-right">
                          {level?.qty ?? 0}
                        </td>
                      );
                    })}
                    <td className={`td text-right font-semibold ${low ? "text-red-600" : ""}`}>
                      {total} {item.unit}
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
