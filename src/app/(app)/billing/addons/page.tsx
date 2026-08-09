import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatRupiah, statusLabel } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { saveAddonAction } from "../actions";

export const metadata = { title: "Addon Services" };

export default async function AddonsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; edit?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.BILLING_VIEW);
  const sp = await searchParams;
  const canManage = user.permissions.has(PERMISSIONS.BILLING_MANAGE);

  const addons = await db.addonService.findMany({
    include: { _count: { select: { subscriptions: { where: { endedAt: null } } } } },
    orderBy: { code: "asc" },
  });
  const editRow = sp.edit ? (addons.find((a) => a.id === sp.edit) ?? null) : null;

  return (
    <div>
      <PageHeader
        title="Addon Services"
        subtitle="Layanan tambahan berbayar di luar paket (gap G13) — ditagih otomatis bersama tagihan bulanan."
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="card overflow-x-auto">
          {addons.length === 0 ? (
            <EmptyState message="Belum ada addon." />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th">Kode</th>
                  <th className="th">Nama</th>
                  <th className="th">Harga / Bulan</th>
                  <th className="th">Dipakai</th>
                  <th className="th">Status</th>
                  {canManage && <th className="th"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {addons.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="td font-mono text-xs">{a.code}</td>
                    <td className="td font-medium">{a.name}</td>
                    <td className="td whitespace-nowrap text-xs">{formatRupiah(a.monthlyPrice)}</td>
                    <td className="td">{a._count.subscriptions}</td>
                    <td className="td">
                      <Badge value={a.isActive ? "ACTIVE" : "INACTIVE"} label={statusLabel(a.isActive ? "ACTIVE" : "INACTIVE")} />
                    </td>
                    {canManage && (
                      <td className="td text-right text-xs">
                        <Link href={`/billing/addons?edit=${a.id}`} className="text-brand-600 hover:underline">
                          Ubah
                        </Link>
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
            <h2 className="mb-4 font-medium">{editRow ? `Ubah: ${editRow.code}` : "Addon Baru"}</h2>
            <form action={saveAddonAction} className="space-y-3">
              {editRow && <input type="hidden" name="id" value={editRow.id} />}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="code">Kode</label>
                  <input id="code" name="code" className="input" defaultValue={editRow?.code ?? ""} required placeholder="IPSTATIC" />
                </div>
                <div>
                  <label className="label" htmlFor="monthlyPrice">Harga / Bulan (Rp)</label>
                  <input id="monthlyPrice" name="monthlyPrice" inputMode="numeric" className="input" defaultValue={editRow ? String(editRow.monthlyPrice) : ""} required />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="name">Nama</label>
                <input id="name" name="name" className="input" defaultValue={editRow?.name ?? ""} required />
              </div>
              <div>
                <label className="label" htmlFor="description">Deskripsi</label>
                <textarea id="description" name="description" rows={2} className="input" defaultValue={editRow?.description ?? ""} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isActive" className="h-4 w-4" defaultChecked={editRow?.isActive ?? true} />
                Aktif (bisa ditambahkan ke langganan)
              </label>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary">{editRow ? "Simpan" : "Tambah"}</button>
                {editRow && <Link href="/billing/addons" className="btn-secondary">Batal</Link>}
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
