"use client";

import { useState, useTransition, type FormEvent } from "react";
import { requestRecoveryAction } from "@/app/login/recovery-actions";

const GENERIC_ERROR = "Permintaan belum dapat dikirim. Silakan coba lagi.";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    const form = event.currentTarget;
    if (!form.reportValidity()) return;

    const formData = new FormData(form);
    startTransition(async () => {
      try {
        const result = await requestRecoveryAction(formData);
        setMessage(result.message);
      } catch {
        // Jangan menampilkan detail server atau SMTP ke halaman publik.
        setError(GENERIC_ERROR);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="crm-login-form" noValidate={false}>
      <div>
        <label className="label" htmlFor="recovery-email">Alamat email</label>
        <input
          id="recovery-email"
          name="email"
          type="email"
          className="input"
          autoComplete="email"
          inputMode="email"
          placeholder="nama@email.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          disabled={isPending}
        />
      </div>
      {message && (
        <div className="crm-flash is-success" role="status" aria-live="polite">
          {message}
        </div>
      )}
      {error && (
        <div className="crm-flash is-error" role="alert" aria-live="assertive">
          {error}
        </div>
      )}
      <button type="submit" className="btn-primary w-full justify-center" disabled={isPending}>
        {isPending ? "Mengirim permintaan…" : "Kirim permintaan"}
      </button>
    </form>
  );
}
