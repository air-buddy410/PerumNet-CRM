import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, statusLabel, formatDateTime } from "@/lib/constants";
import type { TerminationSnapshot } from "@/lib/termination";

export const metadata = { title: "Berita Acara Terminasi" };

// Berita acara cetak A4 (PRD §17, FR-UI-004: "tanpa sidebar").
//
// Halaman ini berada di dalam layout aplikasi, jadi sidebar dan header ikut
// terbawa. Alih-alih menyebut nama kelas milik app-shell — yang bukan milik
// alur kerja ini dan bisa berubah sewaktu-waktu — seluruh isi halaman
// disembunyikan saat mencetak, lalu HANYA lembar berita acara dimunculkan
// kembali. Cara ini tetap benar berapa pun kali app-shell diubah.
//
// Gaya cetak ditulis lokal di halaman ini, bukan di globals.css: berkas gaya
// global dipegang alur kerja frontend tersendiri.
const PRINT_CSS = `
  @page { size: A4; margin: 18mm 16mm; }
  @media print {
    body * { visibility: hidden !important; }
    .ba-sheet, .ba-sheet * { visibility: visible !important; }
    .ba-sheet {
      position: absolute !important;
      left: 0 !important;
      top: 0 !important;
      width: 100% !important;
      max-width: none !important;
      margin: 0 !important;
      padding: 0 !important;
    }
  }
  .ba-sheet { max-width: 180mm; margin: 0 auto; color: #111; font-size: 12px; line-height: 1.5; }
  .ba-sheet h1 { font-size: 16px; font-weight: 700; text-align: center; margin-bottom: 2px; }
  .ba-sheet h2 { font-size: 12px; font-weight: 700; margin: 14px 0 4px; text-transform: uppercase; letter-spacing: .04em; }
  .ba-sheet table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  .ba-sheet th, .ba-sheet td { border: 1px solid #999; padding: 4px 6px; text-align: left; vertical-align: top; }
  .ba-sheet th { background: #f1f1f1; font-weight: 600; }
  .ba-meta td { border: none; padding: 1px 0; }
  .ba-meta td:first-child { width: 42mm; color: #444; }
  .ba-sign { display: flex; gap: 12mm; margin-top: 16mm; }
  .ba-sign div { flex: 1; text-align: center; }
  .ba-sign .line { margin-top: 22mm; border-top: 1px solid #333; padding-top: 3px; }
  @media print { .ba-noprint { display: none !important; } }
`;

export default async function TerminationPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission(PERMISSIONS.TERMINATION_VIEW);
  const { id } = await params;

  const trm = await db.customerTermination.findUnique({
    where: { id },
    include: {
      customer: true,
      subscription: { include: { package: true } },
      warehouseTo: true,
      createdBy: { select: { name: true } },
      decidedBy: { select: { name: true } },
      recovery: {
        include: {
          assignee: { select: { name: true } },
          items: { include: { inspection: true } },
        },
      },
    },
  });
  if (!trm) notFound();

  const snapshot = trm.snapshot as unknown as TerminationSnapshot | null;
  const items = trm.recovery?.items ?? [];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="ba-noprint mb-4 flex items-center justify-between gap-3">
        <a href={`/crm/terminations/${trm.id}`} className="text-sm text-brand-600 hover:underline">
          ← Kembali ke detail terminasi
        </a>
        <p className="text-xs text-slate-500">
          Gunakan Ctrl/Cmd + P untuk mencetak. Ukuran kertas sudah diatur A4.
        </p>
      </div>

      <div className="ba-sheet">
        <h1>BERITA ACARA TERMINASI LAYANAN</h1>
        <p style={{ textAlign: "center", marginBottom: 10 }}>
          Nomor: <strong>{trm.terminationNumber}</strong>
        </p>

        <table className="ba-meta">
          <tbody>
            <tr>
              <td>Nama Pelanggan</td>
              <td>: {trm.customer.name}</td>
            </tr>
            <tr>
              <td>Nomor Pelanggan</td>
              <td>: {trm.customer.customerNumber}</td>
            </tr>
            <tr>
              <td>Alamat</td>
              <td>: {trm.customer.address}</td>
            </tr>
            <tr>
              <td>Nomor Layanan</td>
              <td>
                : {trm.subscription.serviceNumber} ({trm.subscription.package.name})
              </td>
            </tr>
            <tr>
              <td>Alasan Terminasi</td>
              <td>
                : {statusLabel(trm.reasonCategory)} — {trm.reason}
              </td>
            </tr>
            <tr>
              <td>Tanggal Berlaku</td>
              <td>: {formatDateTime(trm.effectiveDate)}</td>
            </tr>
            <tr>
              <td>Status</td>
              <td>: {statusLabel(trm.status)}</td>
            </tr>
          </tbody>
        </table>

        <h2>Perangkat yang Ditarik</h2>
        {items.length === 0 ? (
          <p>Tidak ada perangkat milik PERUMNET yang perlu ditarik pada layanan ini.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: "8mm" }}>No</th>
                <th>Perangkat</th>
                <th>Serial (catatan)</th>
                <th>Serial (lapangan)</th>
                <th>Keputusan</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={it.id}>
                  <td>{i + 1}</td>
                  <td>{it.snapshotItemName}</td>
                  <td>{it.snapshotSerial}</td>
                  <td>{it.actualSerial ?? "—"}</td>
                  <td>{it.finalDecision ? statusLabel(it.finalDecision) : statusLabel(it.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {snapshot && snapshot.devices.some((d) => !d.included) && (
          <>
            <h2>Perangkat yang Tidak Ditarik</h2>
            <table>
              <thead>
                <tr>
                  <th>Serial</th>
                  <th>Perangkat</th>
                  <th>Alasan</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.devices
                  .filter((d) => !d.included)
                  .map((d) => (
                    <tr key={d.serialNumber}>
                      <td>{d.serialNumber}</td>
                      <td>{d.itemName}</td>
                      <td>{d.excludedReason}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </>
        )}

        {snapshot && snapshot.outstandingInvoices.length > 0 && (
          <>
            <h2>Tunggakan pada Saat Pengajuan</h2>
            <table>
              <thead>
                <tr>
                  <th>Nomor Invoice</th>
                  <th>Jatuh Tempo</th>
                  <th>Sisa Tagihan (Rp)</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.outstandingInvoices.map((i) => (
                  <tr key={i.number}>
                    <td>{i.number}</td>
                    <td>{new Date(i.dueAt).toLocaleDateString("id-ID")}</td>
                    <td>{Number(i.outstanding).toLocaleString("id-ID")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <div className="ba-sign">
          <div>
            Pelanggan
            <div className="line">{trm.customer.name}</div>
          </div>
          <div>
            Teknisi Penarikan
            <div className="line">{trm.recovery?.assignee?.name ?? "……………………"}</div>
          </div>
          <div>
            Mengetahui
            <div className="line">{trm.decidedBy?.name ?? "……………………"}</div>
          </div>
        </div>
      </div>
    </>
  );
}
