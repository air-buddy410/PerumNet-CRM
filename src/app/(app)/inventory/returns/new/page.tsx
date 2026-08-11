import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { PageHeader, BackLink, EmptyState, Flash } from "@/components/ui";
import { RETURN_CONDITIONS } from "@/lib/warehouse-docs";
import { createReturnAction } from "../actions";

export const metadata = { title: "Ajukan Pengembalian" };

const CONDITION_LABELS: Record<string, string> = {
  GOOD: "Baik — siap dipakai lagi",
  USED: "Terpakai — masih layak",
  DAMAGED: "Rusak",
  RMA: "RMA — dikirim ke vendor",
};

export default async function NewReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const sp = await searchParams;

  // Hanya barang yang benar-benar dipegang user ini yang bisa dikembalikan.
  const [devices, bulk, warehouses] = await Promise.all([
    db.serializedDevice.findMany({
      where: { custodianId: user.id, status: "IN_CUSTODY" },
      include: { item: true },
      orderBy: { updatedAt: "asc" },
    }),
    db.custodyLevel.findMany({
      where: { custodianId: user.id, qty: { gt: 0 } },
      include: { item: true },
    }),
    db.warehouse.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
  ]);

  const rows = [
    ...devices.map((d) => ({
      key: d.id,
      itemId: d.itemId,
      deviceId: d.id,
      label: `${d.item.name} · SN ${d.serialNumber}`,
      max: 1,
    })),
    ...bulk.map((b) => ({
      key: `bulk-${b.itemId}`,
      itemId: b.itemId,
      deviceId: "",
      label: `${b.item.name} (${b.item.unit})`,
      max: b.qty,
    })),
  ];

  return (
    <div className="max-w-3xl">
      <BackLink href="/inventory/returns" label="Kembali ke daftar pengembalian" />
      <PageHeader
        title="Ajukan Pengembalian"
        subtitle="Barang yang tercatat Anda pegang. Kondisi menentukan apakah barang kembali jadi stock siap pakai atau masuk catatan rusak."
      />

      <Flash error={sp.error} />

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState message="Tidak ada barang yang tercatat Anda pegang." />
        </div>
      ) : (
        <form action={createReturnAction} className="card space-y-4 p-5">
          <div>
            <label className="label" htmlFor="warehouseToId">
              Gudang tujuan
            </label>
            <select id="warehouseToId" name="warehouseToId" className="input w-full" required>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            {rows.slice(0, 10).map((row, i) => (
              <div key={row.key} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name={`itemId_${i}`} value={row.itemId} />
                <input type="hidden" name={`deviceId_${i}`} value={row.deviceId} />
                <span className="flex-1 text-xs">{row.label}</span>
                <input
                  type="number"
                  name={`qty_${i}`}
                  min={0}
                  max={row.max}
                  defaultValue={0}
                  className="input w-20 text-right"
                  aria-label={`Jumlah ${row.label}`}
                />
                <select name={`condition_${i}`} className="input w-52" aria-label={`Kondisi ${row.label}`}>
                  {RETURN_CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {CONDITION_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div>
            <label className="label" htmlFor="note">
              Catatan (opsional)
            </label>
            <input id="note" type="text" name="note" className="input w-full" />
          </div>

          <button type="submit" className="btn-primary">
            Kirim Pengajuan
          </button>
        </form>
      )}
    </div>
  );
}
