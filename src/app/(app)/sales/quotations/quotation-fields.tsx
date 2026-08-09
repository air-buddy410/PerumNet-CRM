import { formatRupiah } from "@/lib/constants";

// Field harga quotation — dipakai form create & edit draft.
export function QuotationFields({
  packages,
  defaults,
}: {
  packages: {
    id: string;
    name: string;
    monthlyPrice: bigint;
    installationFee: bigint;
  }[];
  defaults?: {
    packageId: string;
    monthlyPrice: bigint;
    installationFee: bigint;
    deviceFee: bigint;
    networkBuildFee: bigint;
    discount: bigint;
    taxPercent: number;
    contractMonths: number;
    validUntil: Date | null;
    notes: string | null;
  };
}) {
  const d = defaults;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label" htmlFor="packageId">Paket</label>
        <select id="packageId" name="packageId" className="input" defaultValue={d?.packageId ?? ""} required>
          <option value="" disabled>— pilih paket —</option>
          {packages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({formatRupiah(p.monthlyPrice)}/bln · instalasi {formatRupiah(p.installationFee)})
            </option>
          ))}
        </select>
        {!d && (
          <p className="mt-1 text-xs text-slate-500">
            Kosongkan field harga untuk memakai harga master paket.
          </p>
        )}
      </div>
      <div>
        <label className="label" htmlFor="monthlyPrice">Biaya Bulanan (Rp)</label>
        <input id="monthlyPrice" name="monthlyPrice" inputMode="numeric" className="input" defaultValue={d ? String(d.monthlyPrice) : ""} />
      </div>
      <div>
        <label className="label" htmlFor="installationFee">Biaya Instalasi (Rp)</label>
        <input id="installationFee" name="installationFee" inputMode="numeric" className="input" defaultValue={d ? String(d.installationFee) : ""} />
      </div>
      <div>
        <label className="label" htmlFor="deviceFee">Perangkat Tambahan (Rp)</label>
        <input id="deviceFee" name="deviceFee" inputMode="numeric" className="input" defaultValue={d ? String(d.deviceFee) : "0"} />
      </div>
      <div>
        <label className="label" htmlFor="networkBuildFee">Pembangunan Jaringan (Rp)</label>
        <input id="networkBuildFee" name="networkBuildFee" inputMode="numeric" className="input" defaultValue={d ? String(d.networkBuildFee) : "0"} />
      </div>
      <div>
        <label className="label" htmlFor="discount">Diskon (Rp, one-time)</label>
        <input id="discount" name="discount" inputMode="numeric" className="input" defaultValue={d ? String(d.discount) : "0"} />
        <p className="mt-1 text-xs text-amber-600">
          Diskon &gt; 0 memerlukan approval sebelum quotation dapat dikirim.
        </p>
      </div>
      <div>
        <label className="label" htmlFor="taxPercent">PPN (%)</label>
        <input id="taxPercent" name="taxPercent" type="number" step="0.1" min={0} max={100} className="input" defaultValue={d?.taxPercent ?? 11} />
      </div>
      <div>
        <label className="label" htmlFor="contractMonths">Masa Kontrak (bulan)</label>
        <input id="contractMonths" name="contractMonths" type="number" min={1} className="input" defaultValue={d?.contractMonths ?? 12} />
      </div>
      <div>
        <label className="label" htmlFor="validUntil">Berlaku Sampai</label>
        <input id="validUntil" name="validUntil" type="date" className="input" defaultValue={d?.validUntil ? d.validUntil.toISOString().slice(0, 10) : ""} />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="notes">Catatan</label>
        <textarea id="notes" name="notes" rows={2} className="input" defaultValue={d?.notes ?? ""} />
      </div>
    </div>
  );
}
