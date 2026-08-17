import Link from "next/link";
import type { BarisRiwayat } from "@/lib/customer-dossier";
import type { BerkasPelanggan } from "@/lib/customer-dossier-service";
import { formatUiDateTime } from "@/components/ui-formatters";

function fileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "Ukuran tidak tersedia";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CustomerDossierPanel({ files, history, canViewPii }: { files: BerkasPelanggan[]; history: BarisRiwayat[]; canViewPii: boolean }) {
  const visibleFiles = files.filter((file) => canViewPii || file.jenis !== "CustomerIdCard");
  const hiddenPiiCount = files.filter((file) => file.jenis === "CustomerIdCard" && !canViewPii).length;

  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-2">
      <section className="card min-w-0" aria-labelledby="customer-dossier-title">
        <div className="crm-panel-heading">
          <div>
            <h2 id="customer-dossier-title">Berkas customer</h2>
            <p>Dokumen tersimpan dibuka melalui jalur privat sesuai izin Anda.</p>
          </div>
          <span className="system-status-pill is-disabled">Read-only</span>
        </div>
        {visibleFiles.length === 0 ? (
          <div className="crm-empty-state">Belum ada berkas yang dapat ditampilkan.</div>
        ) : (
          <ul className="customer-dossier-list">
            {visibleFiles.map((file) => (
              <li key={file.id} className="customer-dossier-row">
                <div className="min-w-0">
                  <strong>{file.label}</strong>
                  <span className="customer-dossier-filename">{file.filename}</span>
                  <span className="customer-dossier-meta">
                    {fileSize(file.size)} · Diunggah {formatUiDateTime(file.uploadedAt)} oleh {file.uploadedBy}
                  </span>
                </div>
                <Link href={`/api/files/${encodeURIComponent(file.id)}`} target="_blank" rel="noreferrer" className="btn-secondary whitespace-nowrap px-3 py-1.5 text-xs">
                  Buka berkas
                </Link>
              </li>
            ))}
          </ul>
        )}
        {hiddenPiiCount > 0 && (
          <p className="customer-dossier-protected">{hiddenPiiCount} berkas identitas dilindungi dan tidak ditampilkan tanpa izin PII.</p>
        )}
        <p className="customer-dossier-note">Upload berkas akan tersedia setelah action resmi dari Opus diterbitkan.</p>
      </section>

      <section className="card min-w-0" aria-labelledby="customer-history-title">
        <div className="crm-panel-heading">
          <div>
            <h2 id="customer-history-title">Riwayat aktivitas customer</h2>
            <p>Perubahan terbaru lintas customer, subscription, tiket, dan perangkat.</p>
          </div>
          <span className="system-status-pill is-disabled">{history.length} catatan</span>
        </div>
        {history.length === 0 ? (
          <div className="crm-empty-state">Belum ada riwayat aktivitas.</div>
        ) : (
          <ol className="customer-history-list">
            {history.map((entry, index) => (
              <li key={`${entry.waktu.toISOString()}-${entry.aksi}-${index}`} className="customer-history-row">
                <span className="customer-history-dot" aria-hidden="true" />
                <div className="min-w-0">
                  <div className="customer-history-heading">
                    <strong>{entry.aksi}</strong>
                    <time dateTime={entry.waktu.toISOString()}>{formatUiDateTime(entry.waktu)}</time>
                  </div>
                  <p>{entry.keterangan}</p>
                  <span>{entry.modul} · {entry.oleh ?? "Sistem"}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
