"use client";

import {
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

export const MAX_CLIENT_UPLOAD_BYTES = 5 * 1024 * 1024;

export function clientFileSizeError(
  file: File | null | undefined,
  maxBytes = MAX_CLIENT_UPLOAD_BYTES,
  message = "Ukuran berkas maksimal 5 MB.",
) {
  return file && file.size > maxBytes ? message : "";
}

type ClientFileUploadGuardProps = {
  action: (formData: FormData) => void | Promise<void>;
  children: ReactNode;
  className?: string;
  inputName?: string;
  maxBytes?: number;
  message?: string;
};

/**
 * Browser-side size guard for operational multipart forms.
 * Server-side MIME, magic-byte, and authorization checks remain authoritative.
 */
export function ClientFileUploadGuard({
  action,
  children,
  className,
  inputName = "file",
  maxBytes = MAX_CLIENT_UPLOAD_BYTES,
  message = "Ukuran berkas maksimal 5 MB.",
}: ClientFileUploadGuardProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const instanceId = useId();
  const [error, setError] = useState("");
  const errorId = `${instanceId}-size-error`;

  function getFileInput() {
    const field = formRef.current?.elements.namedItem(inputName);
    return field instanceof HTMLInputElement && field.type === "file" ? field : null;
  }

  function getFile() {
    const input = getFileInput();
    return input?.files?.[0] ?? null;
  }

  function handleChange(event: FormEvent<HTMLFormElement>) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "file" || target.name !== inputName) return;
    setError(clientFileSizeError(target.files?.[0], maxBytes, message));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const file = getFile();
    const nextError = clientFileSizeError(file, maxBytes, message);
    if (!nextError) {
      setError("");
      return;
    }

    event.preventDefault();
    setError(nextError);
    getFileInput()?.focus();
  }

  return (
    <form
      ref={formRef}
      action={action}
      encType="multipart/form-data"
      className={className}
      onChange={handleChange}
      onSubmit={handleSubmit}
    >
      {children}
      {error && (
        <p id={errorId} className="crm-file-upload-error" role="alert" aria-live="polite">
          {error}
        </p>
      )}
    </form>
  );
}
