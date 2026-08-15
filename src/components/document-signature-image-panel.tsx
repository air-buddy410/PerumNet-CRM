"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle, CheckCircle2, FileImage, ImageOff, UploadCloud } from "lucide-react";
import { formatUiDateTime } from "@/components/ui-formatters";
import { clientFileSizeError } from "@/components/client-file-upload-guard";

export type DocumentSignatureView = {
  id: string;
  role: string;
  signerName: string;
  signedAt: string;
  attachmentId: string | null;
};

type SignatureImageAction = (formData: FormData) => void | Promise<void>;

const ROLE_LABELS: Record<string, string> = {
  REQUESTOR: "Penerima barang",
  WAREHOUSE_ADMIN: "Admin gudang",
  RECEIVED_BY: "Penerima",
  RELEASED_BY: "Penyerah",
};

const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg"]);

function roleLabel(role: string) {
  return ROLE_LABELS[role] ?? role;
}
function formatSignedAt(value: string) {
  return formatUiDateTime(value, "Waktu tidak tersedia");
}

function isAcceptedImage(file: File) {
  return ACCEPTED_TYPES.has(file.type) || /\.(?:png|jpe?g)$/i.test(file.name);
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary justify-center" disabled={pending}>
      <UploadCloud aria-hidden="true" />
      {pending ? "Mengunggah…" : "Unggah gambar"}
    </button>
  );
}

function SignaturePreview({ signature }: { signature: DocumentSignatureView }) {
  const [previewFailed, setPreviewFailed] = useState(false);

  if (!signature.attachmentId) {
    return (
      <div className="crm-document-signature-empty" role="status">
        <ImageOff aria-hidden="true" />
        <span>Belum ada gambar tanda tangan</span>
      </div>
    );
  }

  const fileHref = `/api/files/${encodeURIComponent(signature.attachmentId)}`;

  return (
    <div className="crm-document-signature-preview">
      {previewFailed ? (
        <div className="crm-document-signature-preview-fallback" role="status">
          <AlertTriangle aria-hidden="true" />
          <span>Preview tidak dapat dimuat.</span>
        </div>
      ) : (
        <img
          src={fileHref}
          alt={`Gambar tanda tangan ${signature.signerName}`}
          onError={() => setPreviewFailed(true)}
        />
      )}
      <a href={fileHref} className="crm-document-signature-link">
        Buka gambar privat
      </a>
    </div>
  );
}

export function DocumentSignatureImagePanel({
  txId,
  docType,
  docId,
  signatures,
  canUpload,
  action,
}: {
  txId: string;
  docType: string;
  docId: string;
  signatures: DocumentSignatureView[];
  canUpload: boolean;
  action: SignatureImageAction;
}) {
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  const handleFileChange = (signatureId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) {
      setClientErrors((current) => {
        const next = { ...current };
        delete next[signatureId];
        return next;
      });
      return;
    }
    if (!isAcceptedImage(file)) {
      setClientErrors((current) => ({
        ...current,
        [signatureId]: "Format gambar harus PNG atau JPG.",
      }));
      return;
    }
    const sizeError = clientFileSizeError(file, undefined, "Ukuran gambar tanda tangan maksimal 5 MB.");
    if (!sizeError) {
      setClientErrors((current) => {
        const next = { ...current };
        delete next[signatureId];
        return next;
      });
      return;
    }
    setClientErrors((current) => ({
      ...current,
      [signatureId]: sizeError,
    }));
  };

  const handleSubmit = (signatureId: string, event: FormEvent<HTMLFormElement>) => {
    const fileInput = event.currentTarget.elements.namedItem("file");
    const file = fileInput instanceof HTMLInputElement ? fileInput.files?.[0] : undefined;
    if (!file) {
      event.preventDefault();
      setClientErrors((current) => ({ ...current, [signatureId]: "Pilih gambar tanda tangan terlebih dahulu." }));
      if (fileInput instanceof HTMLInputElement) fileInput.focus();
      return;
    }
    if (!isAcceptedImage(file)) {
      event.preventDefault();
      setClientErrors((current) => ({ ...current, [signatureId]: "Format gambar harus PNG atau JPG." }));
      if (fileInput instanceof HTMLInputElement) fileInput.focus();
      return;
    }
    const sizeError = clientFileSizeError(file, undefined, "Ukuran gambar tanda tangan maksimal 5 MB.");
    if (sizeError) {
      event.preventDefault();
      setClientErrors((current) => ({ ...current, [signatureId]: sizeError }));
      if (fileInput instanceof HTMLInputElement) fileInput.focus();
    }
  };

  return (
    <section className="card crm-document-signature-panel" aria-labelledby="document-signatures-title">
      <div className="crm-document-signature-heading">
        <span className="crm-document-signature-icon" aria-hidden="true"><FileImage /></span>
        <div>
          <h2 id="document-signatures-title">Gambar tanda tangan</h2>
          <p>Gambar hanya dapat dilampirkan pada tanda tangan dokumen yang sudah tercatat.</p>
        </div>
      </div>

      {signatures.length === 0 ? (
        <div className="crm-document-signature-no-rows" role="status">
          Belum ada baris tanda tangan untuk dokumen ini. Tidak ada formulir gambar yang dibuat.
        </div>
      ) : (
        <div className="crm-document-signature-list">
          {signatures.map((signature) => {
            const inputId = `signature-file-${signature.id}`;
            const error = clientErrors[signature.id];
            return (
              <article key={signature.id} className="crm-document-signature-row">
                <div className="crm-document-signature-meta">
                  <span className="crm-document-signature-role">{roleLabel(signature.role)}</span>
                  <strong>{signature.signerName}</strong>
                  <span>Ditandatangani {formatSignedAt(signature.signedAt)}</span>
                  <span className={`crm-document-signature-status ${signature.attachmentId ? "is-ready" : "is-pending"}`}>
                    {signature.attachmentId ? <CheckCircle2 aria-hidden="true" /> : <ImageOff aria-hidden="true" />}
                    {signature.attachmentId ? "Gambar tersedia" : "Gambar belum tersedia"}
                  </span>
                </div>

                <div className="crm-document-signature-actions">
                  <SignaturePreview signature={signature} />
                  {canUpload ? (
                    <form
                      action={action}
                      encType="multipart/form-data"
                      className="crm-document-signature-upload"
                      onSubmit={(event) => handleSubmit(signature.id, event)}
                    >
                      <input type="hidden" name="txId" value={txId} />
                      <input type="hidden" name="docType" value={docType} />
                      <input type="hidden" name="docId" value={docId} />
                      <input type="hidden" name="role" value={signature.role} />
                      <label htmlFor={inputId}>Pilih PNG/JPG</label>
                      <input
                        id={inputId}
                        name="file"
                        type="file"
                        accept="image/png,image/jpeg"
                        capture="environment"
                        onChange={(event) => handleFileChange(signature.id, event)}
                        aria-describedby={error ? `${inputId}-error` : undefined}
                        required
                      />
                      <SubmitButton />
                      {error && <p id={`${inputId}-error`} className="crm-document-signature-error" role="alert">{error}</p>}
                    </form>
                  ) : (
                    <p className="crm-document-signature-permission">Upload mengikuti izin dokumen gudang.</p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
