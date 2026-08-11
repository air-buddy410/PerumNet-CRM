import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  CUSTODY_OVERDUE_DAYS,
  statusLabel,
  formatDateTime,
} from "@/lib/constants";
import { PageHeader, Badge, EmptyState } from "@/components/ui";

export const metadata = { title: "Technician Custody" };

export default async function CustodyPage() {
  const user = await requirePermission(PERMISSIONS.CUSTODY_VIEW);

  // Teknisi hanya melihat custody miliknya; role lain melihat semua.
  const seeAll = user.permissions.has(PERMISSIONS.INVENTORY_VIEW) &&
    user.permissions.has(PERMISSIONS.STOCK_POST) ||
    user.permissions.has(PERMISSIONS.WORK_ORDERS_CLOSE) ||
    user.roles.some((r) => ["super_admin", "management", "warehouse"].includes(r.code));

  const [devices, bulkLevels] = await Promise.all([
    db.serializedDevice.findMany({
      where: {
        status: "IN_CUSTODY",
        ...(seeAll ? {} : { custodianId: user.id }),
      },
      include: { item: true, custodian: true },
      orderBy: { updatedAt: "asc" },
    }),
    db.custodyLevel.findMany({
      where: { qty: { gt: 0 }, ...(seeAll ? {} : { custodianId: user.id }) },
      include: { item: true, custodian: true },
      orderBy: [{ custodianId: "asc" }],
    }),
  ]);

  const now = Date.now();
  const overdueMs = CUSTODY_OVERDUE_DAYS * 24 * 60 * 60 * 1000;
  const overdueCount = devices.filter((d) => now - d.updatedAt.getTime() > overdueMs).length;

  return (
    <div>
      <PageHeader
        title="Technician Custody"
        subtitle={`Pantau perangkat dan material yang dibawa teknisi. Custody lebih dari ${CUSTODY_OVERDUE_DAYS} hari ditandai terlambat.`}
      />

      {overdueCount > 0 && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {overdueCount} perangkat overdue — wajib dikembalikan atau dipasang.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="border-b border-slate-100 px-5 py-4 font-medium">
            Perangkat Serialized ({devices.length})
          </div>
          {devices.length === 0 ? (
            <EmptyState message="Tidak ada perangkat dalam custody." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th">SN</th>
                  <th className="th">Item</th>
                  <th className="th">Teknisi</th>
                  <th className="th">Sejak</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {devices.map((d) => {
                  const overdue = now - d.updatedAt.getTime() > overdueMs;
                  return (
                    <tr key={d.id} className={overdue ? "bg-red-50/50" : "hover:bg-slate-50"}>
                      <td className="td font-mono text-xs">
                        <Link href={`/inventory/devices/${d.id}`} className="text-brand-600 hover:underline">
                          {d.serialNumber}
                        </Link>
                      </td>
                      <td className="td text-xs">{d.item.name}</td>
                      <td className="td text-xs">{d.custodian?.name ?? "-"}</td>
                      <td className="td whitespace-nowrap text-xs">
                        {formatDateTime(d.updatedAt)}
                        {overdue && (
                          <span className="ml-1">
                            <Badge value="REJECTED" label="Overdue" />
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="border-b border-slate-100 px-5 py-4 font-medium">
            Material Bulk ({bulkLevels.length})
          </div>
          {bulkLevels.length === 0 ? (
            <EmptyState message="Tidak ada material bulk dalam custody." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th">Teknisi</th>
                  <th className="th">Item</th>
                  <th className="th text-right">Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bulkLevels.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="td text-xs">{l.custodian.name}</td>
                    <td className="td text-xs">{l.item.name}</td>
                    <td className="td text-right">
                      {l.qty} {l.item.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-400">
        Status: {statusLabel("IN_CUSTODY")} — pengembalian lewat transaksi Pengembalian Barang;
        pemasangan lewat Work Order.
      </p>
    </div>
  );
}
