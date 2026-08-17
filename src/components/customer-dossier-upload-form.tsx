"use client";

import { FileUp, UploadCloud } from "lucide-react";
import { useActionState, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { unggahBerkasPelangganAction, type AksiBerkas } from "@/app/(app)/crm/customers/actions";
import { clientFileSizeError, MAX_CLIENT_UPLOAD_BYTES } from "@/components/client-file-upload-guard";
import { JENIS_BERKAS, LABEL_BERKAS } from "@/lib/customer-dossier";

const ACCEPTED_FILES = "image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf";

function actionWithState(_previous: AksiBerkas | null, formData: FormData) {
  return unggahBerkasPelangganAction(formData);
}

export function CustomerDossierUploadForm({ customerId, canViewPii }: { customerId: string; canViewPii: boolean }) {
  const [state, formAction, pending] = useActionState(actionWithState, null);
  const [clientError, setClientError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setClientError("");
    }
  }, [state]);

  function validateFile(file: File | null | undefined) {
    return clientFileSizeError(file, MAX_CLIENT_UPLOAD_BYTES, "Ukuran berkas maksimal 5 MB.");
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setClientError(validateFile(event.currentTarget.files?.[0]));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const fileInput = event.currentTarget.elements.namedItem("file");
    const file = fileInput instanceof HTMLInputElement ? fileInput.files?.[0] : null;
    const error = validateFile(file);
    if (!file) {
      event.preventDefault();
      setClientError("Pilih berkas terlebih dahulu.");
      if (fileInput instanceof HTMLInputElement) fileInput.focus();
      return;
    }
    if (error) {
      event.preventDefault();
      setClientError(error);
      if (fileInput instanceof HTMLInputElement) fileInput.focus();
      return;
    }
    setClientError("");
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      method="post"
      encType="multipart/form-data"
      className="customer-dossier-upload"
      onSubmit={handleSubmit}
    >
      <input type="hidden" name="customerId" value={customerId} />
      <div className="customer-dossier-upload-heading">
        <div>
          <strong>Tambah berkas</strong>
          <span>Format JPG, PNG, WebP, atau PDF · maksimal 5 MB.</span>
        </div>
        <FileUp aria-hidden="true" />
      </div>
      <div className="customer-dossier-upload-fields">
        <div>
          <label className="label" htmlFor={`customer-file-kind-${customerId}`}>Jenis berkas</label>
          <select id={`customer-file-kind-${customerId}`} name="jenis" className="input" defaultValue={canViewPii ? JENIS_BERKAS.KTP : JENIS_BERKAS.FORM}>
            {canViewPii && <option value={JENIS_BERKAS.KTP}>{LABEL_BERKAS[JENIS_BERKAS.KTP]}</option>}
            <option value={JENIS_BERKAS.FORM}>{LABEL_BERKAS[JENIS_BERKAS.FORM]}</option>
            <option value={JENIS_BERKAS.FOTO}>{LABEL_BERKAS[JENIS_BERKAS.FOTO]}</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`customer-file-input-${customerId}`}>Berkas</label>
          <input
            id={`customer-file-input-${customerId}`}
            name="file"
            type="file"
            accept={ACCEPTED_FILES}
            capture="environment"
            required
            onChange={handleFileChange}
            aria-describedby={clientError ? `customer-file-error-${customerId}` : undefined}
          />
        </div>
      </div>
      {(clientError || (state && !state.ok)) && (
        <p id={`customer-file-error-${customerId}`} className="crm-file-upload-error" role="alert" aria-live="polite">
          {clientError || (state && !state.ok ? state.error : "")}
        </p>
      )}
      {state?.ok && (
        <p className="customer-dossier-upload-success" role="status" aria-live="polite">
          Berkas berhasil disimpan. Daftar berkas diperbarui.
        </p>
      )}
      <button type="submit" className="btn-primary customer-dossier-upload-submit" disabled={pending}>
        <UploadCloud aria-hidden="true" />
        {pending ? "Mengunggah…" : "Unggah berkas"}
      </button>
    </form>
  );
}
