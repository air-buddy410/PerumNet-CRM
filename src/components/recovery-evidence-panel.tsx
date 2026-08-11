"use client";

import { useState } from "react";

type FormAction = (formData: FormData) => Promise<void>;

export type RecoveryEvidenceItem = {
  id: string;
  filename: string;
  mimeType: string;
  createdAt: string;
};

function EvidencePreview({ item }: { item: RecoveryEvidenceItem }) {
  const [failed, setFailed] = useState(false);
  const isImage = item.mimeType.startsWith("image/");
  if (!isImage || failed) {
    return <span className="recovery-evidence-file">{failed ? "Preview tidak tersedia" : item.mimeType === "application/pdf" ? "PDF" : "Berkas"}</span>;
  }
  return <img src={`/api/files/${item.id}`} alt={item.filename} className="recovery-evidence-thumb" onError={() => setFailed(true)} />;
}

export function RecoveryEvidencePanel({
  action,
  recoveryId,
  kind,
  entityId,
  title,
  items,
  canUpload = true,
}: {
  action: FormAction;
  recoveryId: string;
  kind: "ATTEMPT" | "PICKUP" | "INSPECTION";
  entityId: string;
  title: string;
  items: RecoveryEvidenceItem[];
  canUpload?: boolean;
}) {
  return (
    <section className="recovery-evidence-panel" aria-label={title}>
      <div className="recovery-evidence-heading"><strong>{title}</strong><span>{items.length} berkas</span></div>
      {items.length > 0 && (
        <ul className="recovery-evidence-list">
          {items.map((item) => (
            <li key={item.id}>
              <a href={`/api/files/${item.id}`} target="_blank" rel="noreferrer" className="recovery-evidence-link">
                <EvidencePreview item={item} />
                <span><strong>{item.filename}</strong><small>{formatEvidenceDate(item.createdAt)}</small></span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {canUpload && (
        <form action={action} encType="multipart/form-data" className="recovery-evidence-upload">
          <input type="hidden" name="recoveryId" value={recoveryId} />
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="entityId" value={entityId} />
          <label className="label" htmlFor={`evidence-${kind}-${entityId}`}>Tambah bukti</label>
          <input id={`evidence-${kind}-${entityId}`} name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf" capture="environment" required />
          <small>JPG, PNG, WebP, atau PDF · maksimal 5 MB.</small>
          <button type="submit" className="btn-secondary">Unggah bukti</button>
        </form>
      )}
      {!canUpload && items.length === 0 && <p className="text-xs text-slate-500">Belum ada bukti pada bagian ini.</p>}
    </section>
  );
}

function formatEvidenceDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Waktu tidak tersedia";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
