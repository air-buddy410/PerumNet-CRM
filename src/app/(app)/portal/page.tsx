import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/rbac";
import { formatDateTime } from "@/lib/constants";
import { PageHeader, Badge, EmptyState, Flash } from "@/components/ui";
import { createMaterialRequestAction, cancelMaterialRequestAction } from "./actions";

export const metadata = { title: "Portal Lapangan" };

const MAX_ROWS = 6;

// Fase 19 (F7): portal ringkas untuk teknisi/vendor — mengajukan material,
// memantau permintaan sendiri, dan melihat barang yang sedang dipegang.
// Katalog sengaja TIDAK menampilkan data harga internal.
export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const sp = await searchParams;

  const [requests, warehouses, items, devices, bulk] = await Promise.all([
    db.materialRequest.findMany({
      where: { requesterId: user.id },
      include: { warehouse: true, lines: { include: { item: true } }, decidedBy: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    db.warehouse.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    db.item.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, unit: true },
      orderBy: { name: "asc" },
    }),
    db.serializedDevice.count({ where: { custodianId: user.id, status: "IN_CUSTODY" } }),
    db.custodyLevel.findMany({ where: { custodianId: user.id, qty: { gt: 0 } } }),
  ]);

  const bulkTotal = bulk.reduce((sum, b) => sum + b.qty, 0);
  const waiting = requests.filter((r) => r.status === "SUBMITTED").length;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Portal Lapangan"
        subtitle={`Halo ${user.name} — ${waiting} permintaan menunggu keputusan, ${devices} perangkat & ${bulkTotal} unit bulk sedang Anda pegang.`}
        action={
          <Link href="/inventory/returns/new" className="btn-secondary">
            Kembalikan Barang
          </Link>
        }
      />

      <Flash ok={sp.ok} error={sp.error} />

      <div className="card mb-6 p-5">
        <h2 className="mb-3 text-sm font-medium">Ajukan Material</h2>
        <form action={createMaterialRequestAction} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="warehouseId">Gudang</label>
              <select id="warehouseId" name="warehouseId" className="input w-full" required>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="purpose">Tujuan pemakaian</label>
              <input id="purpose" type="text" name="purpose" className="input w-full" required />
            </div>
          </div>

          <div className="space-y-2">
            {Array.from({ length: MAX_ROWS }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <select name={`itemId_${i}`} className="input flex-1" aria-label={`Material baris ${i + 1}`}>
                  <option value="">— pilih material —</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>{it.code} · {it.name} ({it.unit})</option>
                  ))}
                </select>
                <input
                  type="number"
                  name={`qty_${i}`}
                  min={0}
                  defaultValue={0}
                  className="input w-20 text-right"
                  aria-label={`Jumlah baris ${i + 1}`}
                />
              </div>
            ))}
          </div>

          <input type="text" name="note" placeholder="Catatan (opsional)" className="input w-full" />
          <button type="submit" className="btn-primary">Kirim Permintaan</button>
        </form>
      </div>

      <h2 className="mb-3 text-sm font-medium">Permintaan Saya</h2>
      {requests.length === 0 ? (
        <div className="card"><EmptyState message="Belum ada permintaan." /></div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <div key={req.id} className="card p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-sm">{req.requestNumber}</span>
                <Badge value={req.status} />
              </div>
              <p className="mb-2 text-xs text-slate-500">
                {req.warehouse.name} · {req.purpose} · {formatDateTime(req.createdAt)}
              </p>
              <ul className="mb-2 space-y-1 text-xs">
                {req.lines.map((l) => (
                  <li key={l.id} className="flex justify-between">
                    <span>{l.item.name}</span>
                    <span className="text-slate-500">{l.qty} {l.item.unit}</span>
                  </li>
                ))}
              </ul>
              {req.decisionNote && (
                <p className="text-xs text-slate-500">
                  {req.decidedBy?.name}: {req.decisionNote}
                </p>
              )}
              {req.status === "SUBMITTED" && (
                <form action={cancelMaterialRequestAction}>
                  <input type="hidden" name="requestId" value={req.id} />
                  <button type="submit" className="btn-danger mt-2">Batalkan</button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
