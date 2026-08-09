import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, statusLabel, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { createOpnameAction } from "./actions";

export const metadata = { title: "Stock Opname" };

export default async function OpnamePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  const sp = await searchParams;
  const canManage = user.permissions.has(PERMISSIONS.OPNAME_MANAGE);

  const [sessions, warehouses] = await Promise.all([
    db.opnameSession.findMany({
      include: {
        warehouse: true,
        createdBy: true,
        lines: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    db.warehouse.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Stock Opname"
        subtitle="Hitung fisik vs sistem. Variance wajib alasan + approval Supervisor → Owner (PRD §21). Item serialized direkonsiliasi per unit lewat write-off."
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="card overflow-x-auto">
          {sessions.length === 0 ? (
            <EmptyState message="Belum ada sesi opname." />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th">Nomor</th>
                  <th className="th">Gudang</th>
                  <th className="th">Item</th>
                  <th className="th">Variance</th>
                  <th className="th">Status</th>
                  <th className="th">Dibuat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sessions.map((s) => {
                  const varianceCount = s.lines.filter(
                    (l) => l.countedQty !== null && l.countedQty !== l.systemQty
                  ).length;
                  return (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="td">
                        <Link
                          href={`/inventory/opname/${s.id}`}
                          className="font-medium text-brand-600 hover:underline"
                        >
                          {s.opnameNumber}
                        </Link>
                      </td>
                      <td className="td text-xs">{s.warehouse.name}</td>
                      <td className="td">{s.lines.length}</td>
                      <td className="td">{varianceCount > 0 ? varianceCount : "-"}</td>
                      <td className="td">
                        <Badge value={s.status} label={statusLabel(s.status)} />
                      </td>
                      <td className="td whitespace-nowrap text-xs text-slate-500">
                        {s.createdBy.name} · {formatDateTime(s.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {canManage && (
          <div className="card h-fit p-5">
            <h2 className="mb-4 font-medium">Buka Sesi Baru</h2>
            <form action={createOpnameAction} className="space-y-3">
              <div>
                <label className="label" htmlFor="warehouseId">Gudang</label>
                <select id="warehouseId" name="warehouseId" className="input" required defaultValue="">
                  <option value="" disabled>— pilih —</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="notes">Catatan</label>
                <textarea id="notes" name="notes" rows={2} className="input" />
              </div>
              <button type="submit" className="btn-primary w-full justify-center">
                Buka Sesi (Cut-off)
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
