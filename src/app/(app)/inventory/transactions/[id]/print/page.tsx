import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, TX_TYPE_LABELS, formatDateTime, statusLabel } from "@/lib/constants";

export const metadata = { title: "Cetak IRF" };

const PRINT_CSS = `
  @page { size: A4; margin: 16mm 14mm; }
  @media print {
    body * { visibility: hidden !important; }
    .irf-sheet, .irf-sheet * { visibility: visible !important; }
    .irf-sheet {
      position: absolute !important;
      left: 0 !important;
      top: 0 !important;
      width: 100% !important;
      max-width: none !important;
      margin: 0 !important;
      padding: 0 !important;
    }
  }
  .irf-sheet { max-width: 182mm; margin: 0 auto; color: #111; font-size: 11px; line-height: 1.45; }
  .irf-sheet h1 { margin: 0; text-align: center; font-size: 17px; font-weight: 800; letter-spacing: .04em; }
  .irf-sheet h2 { margin: 14px 0 5px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; }
  .irf-sheet table { width: 100%; border-collapse: collapse; margin-top: 5px; }
  .irf-sheet th, .irf-sheet td { border: 1px solid #8f9997; padding: 5px 6px; text-align: left; vertical-align: top; }
  .irf-sheet th { background: #edf1f0; font-weight: 700; }
  .irf-meta td { border: 0; padding: 2px 0; }
  .irf-meta td:first-child { width: 43mm; color: #4d5755; }
  .irf-signatures { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12mm; margin-top: 18mm; }
  .irf-signature { text-align: center; }
  .irf-signature-line { margin-top: 20mm; border-top: 1px solid #222; padding-top: 4px; }
  @media print { .irf-noprint { display: none !important; } }
`;

export default async function InventoryRequestFormPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  const { id } = await params;
  const tx = await db.stockTransaction.findUnique({
    where: { id },
    include: {
      warehouseFrom: true,
      warehouseTo: true,
      custodian: true,
      workOrder: true,
      createdBy: true,
      postedBy: true,
      lines: { include: { item: true, device: true } },
      irf: true,
    },
  });
  if (!tx || !tx.irf) notFound();

  const signatures = await db.documentSignature.findMany({
    where: { docType: "IRF", docId: tx.irf.id },
    orderBy: { role: "asc" },
  });

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="irf-noprint mb-4 flex flex-wrap items-center justify-between gap-3">
        <a href={`/inventory/transactions/${tx.id}`} className="text-sm text-brand-600 hover:underline">
          ← Kembali ke detail transaksi
        </a>
        <p className="text-xs text-slate-500">Gunakan Ctrl/Cmd + P untuk mencetak dalam ukuran A4.</p>
      </div>

      <div className="irf-sheet">
        <h1>INVENTORY REQUEST FORM</h1>
        <p style={{ textAlign: "center", margin: "2px 0 10px" }}>
          Nomor dokumen: <strong>{tx.irf.irfNumber}</strong>
        </p>

        <table className="irf-meta">
          <tbody>
            <tr><td>Status IRF</td><td>: {statusLabel(tx.irf.status)}</td></tr>
            <tr><td>Nomor transaksi</td><td>: {tx.txNumber}</td></tr>
            <tr><td>Jenis transaksi</td><td>: {TX_TYPE_LABELS[tx.type] ?? tx.type}</td></tr>
            <tr><td>Dibuat</td><td>: {tx.createdBy.name} · {formatDateTime(tx.createdAt)}</td></tr>
            <tr><td>Diposting</td><td>: {tx.postedAt ? `${tx.postedBy?.name ?? "—"} · ${formatDateTime(tx.postedAt)}` : "—"}</td></tr>
            <tr><td>Gudang asal</td><td>: {tx.warehouseFrom?.name ?? "—"}</td></tr>
            <tr><td>Gudang tujuan</td><td>: {tx.warehouseTo?.name ?? "—"}</td></tr>
            <tr><td>Teknisi / custodian</td><td>: {tx.custodian?.name ?? "—"}</td></tr>
            <tr><td>Work Order</td><td>: {tx.workOrder?.woNumber ?? "—"}</td></tr>
            <tr><td>Tujuan penggunaan</td><td>: {tx.purpose}</td></tr>
            <tr><td>Referensi</td><td>: {tx.referenceNote ?? "—"}</td></tr>
          </tbody>
        </table>

        <h2>Rincian material dan perangkat</h2>
        {tx.lines.length === 0 ? (
          <p>Tidak ada rincian item pada transaksi ini.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: "9mm" }}>No</th>
                <th>Kode / Item</th>
                <th style={{ width: "20mm" }}>Qty</th>
                <th>Serial / Perangkat</th>
              </tr>
            </thead>
            <tbody>
              {tx.lines.map((line, index) => (
                <tr key={line.id}>
                  <td>{index + 1}</td>
                  <td><strong>{line.item.code}</strong><br />{line.item.name}</td>
                  <td>{line.qty} {line.item.unit}</td>
                  <td>{line.device?.serialNumber ?? line.snInput ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h2>Tanda tangan</h2>
        <table>
          <thead><tr><th>Peran</th><th>Nama penanda tangan</th><th>Waktu</th></tr></thead>
          <tbody>
            {signatures.length > 0 ? signatures.map((signature) => (
              <tr key={signature.id}>
                <td>{signature.role === "REQUESTOR" ? "Penerima barang" : "Admin gudang"}</td>
                <td>{signature.signerName}</td>
                <td>{formatDateTime(signature.signedAt)}</td>
              </tr>
            )) : (
              <tr><td colSpan={3}>Tanda tangan belum tersedia.</td></tr>
            )}
          </tbody>
        </table>

        <div className="irf-signatures">
          {signatures.slice(0, 2).map((signature) => (
            <div key={signature.id} className="irf-signature">
              {signature.role === "REQUESTOR" ? "Penerima barang" : "Admin gudang"}
              <div className="irf-signature-line">{signature.signerName}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
