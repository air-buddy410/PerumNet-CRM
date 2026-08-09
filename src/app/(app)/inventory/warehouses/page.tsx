import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { PageHeader, Flash, ActiveBadge, EmptyState } from "@/components/ui";
import { saveWarehouseAction, toggleWarehouseAction } from "../actions";

export const metadata = { title: "Gudang" };

export default async function WarehousesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; edit?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  const sp = await searchParams;
  const canManage = user.permissions.has(PERMISSIONS.ITEMS_MANAGE);

  const warehouses = await db.warehouse.findMany({
    include: {
      stockLevels: true,
      _count: { select: { devices: { where: { status: "AVAILABLE" } } } },
    },
    orderBy: { code: "asc" },
  });
  const editRow = sp.edit ? (warehouses.find((w) => w.id === sp.edit) ?? null) : null;

  return (
    <div>
      <PageHeader title="Gudang" subtitle="Lokasi penyimpanan stock dan perangkat." />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="card overflow-x-auto">
          {warehouses.length === 0 ? (
            <EmptyState message="Belum ada gudang." />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th">Kode</th>
                  <th className="th">Nama</th>
                  <th className="th">Alamat</th>
                  <th className="th">Item Terdata</th>
                  <th className="th">Perangkat Tersedia</th>
                  <th className="th">Status</th>
                  {canManage && <th className="th"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {warehouses.map((w) => (
                  <tr key={w.id} className="hover:bg-slate-50">
                    <td className="td font-mono text-xs">{w.code}</td>
                    <td className="td font-medium">{w.name}</td>
                    <td className="td text-xs">{w.address ?? "-"}</td>
                    <td className="td">{w.stockLevels.filter((l) => l.qty > 0).length}</td>
                    <td className="td">{w._count.devices}</td>
                    <td className="td"><ActiveBadge isActive={w.isActive} /></td>
                    {canManage && (
                      <td className="td whitespace-nowrap text-right text-xs">
                        <Link href={`/inventory/warehouses?edit=${w.id}`} className="text-brand-600 hover:underline">
                          Ubah
                        </Link>
                        <form action={toggleWarehouseAction} className="ml-3 inline">
                          <input type="hidden" name="id" value={w.id} />
                          <button type="submit" className="text-slate-500 hover:underline">
                            {w.isActive ? "Nonaktifkan" : "Aktifkan"}
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {canManage && (
          <div className="card h-fit p-5">
            <h2 className="mb-4 font-medium">{editRow ? `Ubah: ${editRow.code}` : "Gudang Baru"}</h2>
            <form action={saveWarehouseAction} className="space-y-3">
              {editRow && <input type="hidden" name="id" value={editRow.id} />}
              <div>
                <label className="label" htmlFor="code">Kode</label>
                <input id="code" name="code" className="input" defaultValue={editRow?.code ?? ""} required />
              </div>
              <div>
                <label className="label" htmlFor="name">Nama</label>
                <input id="name" name="name" className="input" defaultValue={editRow?.name ?? ""} required />
              </div>
              <div>
                <label className="label" htmlFor="address">Alamat</label>
                <textarea id="address" name="address" rows={2} className="input" defaultValue={editRow?.address ?? ""} />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary">{editRow ? "Simpan" : "Tambah"}</button>
                {editRow && <Link href="/inventory/warehouses" className="btn-secondary">Batal</Link>}
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
