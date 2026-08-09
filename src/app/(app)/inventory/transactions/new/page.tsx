import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, TX_TYPE_LABELS } from "@/lib/constants";
import { PageHeader, Flash, BackLink } from "@/components/ui";
import { createTransactionAction } from "../actions";

export const metadata = { title: "Transaksi Baru" };

const VALID_TYPES = ["GOODS_RECEIPT", "STOCK_ISSUE", "STOCK_RETURN", "STOCK_TRANSFER"];

export default async function NewTransactionPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; error?: string; workOrderId?: string }>;
}) {
  await requirePermission(PERMISSIONS.STOCK_CREATE);
  const sp = await searchParams;
  const type = sp.type ?? "";
  if (!VALID_TYPES.includes(type)) notFound();

  const [warehouses, bulkItems, serialItems, technicians, workOrders, availableDevices, custodyDevices] =
    await Promise.all([
      db.warehouse.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
      db.item.findMany({
        where: { isActive: true, trackingType: "BULK" },
        orderBy: { name: "asc" },
      }),
      db.item.findMany({
        where: { isActive: true, trackingType: "SERIALIZED" },
        orderBy: { name: "asc" },
      }),
      db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
      db.workOrder.findMany({
        where: { status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS"] } },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      type === "STOCK_ISSUE" || type === "STOCK_TRANSFER"
        ? db.serializedDevice.findMany({
            where: { status: "AVAILABLE" },
            include: { item: true, warehouse: true },
            orderBy: { serialNumber: "asc" },
          })
        : Promise.resolve([]),
      type === "STOCK_RETURN"
        ? db.serializedDevice.findMany({
            where: { status: "IN_CUSTODY" },
            include: { item: true, custodian: true },
            orderBy: { serialNumber: "asc" },
          })
        : Promise.resolve([]),
    ]);

  const needsFrom = type === "STOCK_ISSUE" || type === "STOCK_TRANSFER";
  const needsTo = type === "GOODS_RECEIPT" || type === "STOCK_RETURN" || type === "STOCK_TRANSFER";
  const needsCustodian = type === "STOCK_ISSUE" || type === "STOCK_RETURN";
  const deviceOptions = type === "STOCK_RETURN" ? custodyDevices : availableDevices;

  return (
    <div className="max-w-3xl">
      <BackLink href="/inventory/transactions" label="Kembali ke daftar transaksi" />
      <PageHeader
        title={`${TX_TYPE_LABELS[type]} Baru`}
        subtitle="Draft belum mengubah saldo — saldo berubah saat posting (PRD §7.1)."
      />
      <Flash error={sp.error} />

      <form action={createTransactionAction} className="card space-y-5 p-6">
        <input type="hidden" name="type" value={type} />

        <div className="grid gap-4 sm:grid-cols-2">
          {needsFrom && (
            <div>
              <label className="label" htmlFor="warehouseFromId">Gudang Asal</label>
              <select id="warehouseFromId" name="warehouseFromId" className="input" required defaultValue="">
                <option value="" disabled>— pilih —</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                ))}
              </select>
            </div>
          )}
          {needsTo && (
            <div>
              <label className="label" htmlFor="warehouseToId">Gudang Tujuan</label>
              <select id="warehouseToId" name="warehouseToId" className="input" required defaultValue="">
                <option value="" disabled>— pilih —</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                ))}
              </select>
            </div>
          )}
          {needsCustodian && (
            <div>
              <label className="label" htmlFor="custodianId">
                {type === "STOCK_ISSUE" ? "Teknisi Penerima (PIC)" : "Teknisi Pengembali"}
              </label>
              <select id="custodianId" name="custodianId" className="input" required defaultValue="">
                <option value="" disabled>— pilih —</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="label" htmlFor="workOrderId">Work Order (referensi)</label>
            <select id="workOrderId" name="workOrderId" className="input" defaultValue={sp.workOrderId ?? ""}>
              <option value="">— tanpa WO —</option>
              {workOrders.map((wo) => (
                <option key={wo.id} value={wo.id}>{wo.woNumber} — {wo.address}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="purpose">Tujuan (wajib — PRD §16.2)</label>
            <input
              id="purpose"
              name="purpose"
              className="input"
              placeholder={type === "GOODS_RECEIPT" ? "mis. Pembelian PO-2026-08-01" : "mis. Instalasi pelanggan area utara"}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="referenceNote">Referensi (PO/proyek)</label>
            <input id="referenceNote" name="referenceNote" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="notes">Catatan</label>
            <input id="notes" name="notes" className="input" />
          </div>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-bold text-[#526767]">Item Bulk</h2>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="grid grid-cols-[1fr_8rem] gap-2">
                <select name={`bulkItem${i}`} className="input" defaultValue="">
                  <option value="">— item bulk —</option>
                  {bulkItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.unit})
                    </option>
                  ))}
                </select>
                <input name={`bulkQty${i}`} type="number" min={1} className="input" placeholder="Qty" />
              </div>
            ))}
          </div>
        </div>

        {type === "GOODS_RECEIPT" ? (
          <div>
            <h2 className="mb-2 text-sm font-bold text-[#526767]">
              Item Serialized — masukkan SN (satu per baris)
            </h2>
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr]">
                  <select name={`serialItem${i}`} className="input" defaultValue="">
                    <option value="">— item serialized —</option>
                    {serialItems.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                  <textarea
                    name={`serialSns${i}`}
                    rows={3}
                    className="input font-mono text-xs"
                    placeholder={"SN0001\nSN0002\n..."}
                  />
                </div>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Qty otomatis = jumlah SN. SN duplikat ditolak (PRD §16.1).
            </p>
          </div>
        ) : (
          <div>
            <h2 className="mb-2 text-sm font-bold text-[#526767]">
              Perangkat Serialized {type === "STOCK_RETURN" ? "(dalam custody)" : "(tersedia di gudang)"}
            </h2>
            {deviceOptions.length === 0 ? (
              <p className="text-sm text-slate-400">Tidak ada perangkat pada status yang sesuai.</p>
            ) : (
              <select name="deviceIds" multiple size={Math.min(8, deviceOptions.length)} className="input font-mono text-xs">
                {deviceOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.serialNumber} · {d.item.name}
                    {"warehouse" in d && d.warehouse ? ` · ${d.warehouse.code}` : ""}
                    {"custodian" in d && d.custodian ? ` · ${d.custodian.name}` : ""}
                  </option>
                ))}
              </select>
            )}
            <p className="mt-1 text-xs text-slate-500">
              Tahan Cmd/Ctrl untuk memilih lebih dari satu.
            </p>
          </div>
        )}

        <button type="submit" className="btn-primary">Simpan Draft</button>
      </form>
    </div>
  );
}
