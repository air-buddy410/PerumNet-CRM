"use client";

import Link from "next/link";
import { LogIn } from "lucide-react";
import { useActionState } from "react";
import { masukPortalAction } from "@/app/pelanggan/actions";
import { PasswordVisibilityInput } from "@/components/password-visibility-input";

export function CustomerPortalLoginForm() {
  const [state, formAction, pending] = useActionState(masukPortalAction, null);

  return (
    <form action={formAction} className="customer-portal-login-form" aria-busy={pending}>
      <div>
        <label className="label" htmlFor="portal-login-service">Nomor layanan</label>
        <input
          id="portal-login-service"
          name="nomorLayanan"
          className="input"
          autoComplete="username"
          inputMode="text"
          required
          aria-describedby="portal-login-service-help"
        />
        <p id="portal-login-service-help" className="customer-portal-field-help">
          Gunakan nomor layanan yang tercantum pada informasi berlangganan Anda.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="portal-login-password">Kata sandi</label>
        <PasswordVisibilityInput
          id="portal-login-password"
          name="sandi"
          autoComplete="current-password"
          required
        />
      </div>

      {state && !state.ok && (
        <p className="customer-portal-form-error" role="alert" aria-live="polite">
          {state.error}
        </p>
      )}

      <button type="submit" className="btn-primary customer-portal-submit" disabled={pending}>
        <LogIn aria-hidden="true" />
        {pending ? "Memeriksa…" : "Masuk ke portal"}
      </button>

      <Link href="/login" className="customer-portal-back-link">
        Kembali ke CRM staf
      </Link>
    </form>
  );
}
