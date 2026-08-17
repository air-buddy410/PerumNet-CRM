"use client";

import { KeyRound, ShieldAlert, ShieldCheck, UserRoundX } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { aturSandiPortalAction, keluarkanSemuaPerangkatAction, type AksiBerkas } from "@/app/(app)/crm/customers/actions";
import { PasswordVisibilityInput } from "@/components/password-visibility-input";

function setPasswordAction(_previous: AksiBerkas | null, formData: FormData) {
  const password = String(formData.get("sandi") ?? "");
  const confirmation = String(formData.get("konfirmasiSandi") ?? "");
  if (password !== confirmation) return Promise.resolve({ ok: false as const, error: "Konfirmasi kata sandi belum sama." });
  return aturSandiPortalAction(formData);
}

function revokeSessionsAction(_previous: AksiBerkas | null, formData: FormData) {
  return keluarkanSemuaPerangkatAction(formData);
}

export function CustomerPortalAccountActions({ customerId, canEdit, hasAccount }: { customerId: string; canEdit: boolean; hasAccount: boolean }) {
  const [passwordState, passwordFormAction, passwordPending] = useActionState(setPasswordAction, null);
  const [revokeState, revokeFormAction, revokePending] = useActionState(revokeSessionsAction, null);
  const passwordFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (passwordState?.ok) passwordFormRef.current?.reset();
  }, [passwordState]);

  if (!canEdit) {
    return <p className="customer-portal-account-note">Pengelolaan akun portal hanya tersedia untuk user dengan izin edit customer.</p>;
  }

  return (
    <div className="customer-portal-account-actions">
      <div className="customer-portal-account-action-heading">
        <div>
          <strong>{hasAccount ? "Atur ulang kata sandi portal" : "Aktifkan akun portal"}</strong>
          <span>CRM tidak menampilkan kata sandi setelah disimpan. Sesi lama akan diakhiri saat kata sandi diubah.</span>
        </div>
        <KeyRound aria-hidden="true" />
      </div>
      <form ref={passwordFormRef} action={passwordFormAction} className="customer-portal-password-form">
        <input type="hidden" name="customerId" value={customerId} />
        <div>
          <label className="label" htmlFor={`portal-password-${customerId}`}>Kata sandi baru</label>
          <PasswordVisibilityInput id={`portal-password-${customerId}`} name="sandi" autoComplete="new-password" required />
        </div>
        <div>
          <label className="label" htmlFor={`portal-password-confirm-${customerId}`}>Ulangi kata sandi</label>
          <PasswordVisibilityInput id={`portal-password-confirm-${customerId}`} name="konfirmasiSandi" autoComplete="new-password" required />
        </div>
        <button type="submit" className="btn-primary" disabled={passwordPending}>
          <ShieldCheck aria-hidden="true" />
          {passwordPending ? "Menyimpan…" : hasAccount ? "Simpan kata sandi" : "Aktifkan akun"}
        </button>
      </form>
      {passwordState && !passwordState.ok && <p className="customer-portal-form-error" role="alert">{passwordState.error}</p>}
      {passwordState?.ok && <p className="customer-portal-form-success" role="status">Kata sandi portal berhasil diatur. Sesi lama telah diakhiri.</p>}

      {hasAccount && (
        <form action={revokeFormAction} className="customer-portal-revoke-form">
          <input type="hidden" name="customerId" value={customerId} />
          <div>
            <strong><ShieldAlert aria-hidden="true" /> Akhiri semua sesi</strong>
            <span>Gunakan bila perangkat pelanggan hilang atau akses portal perlu dihentikan segera.</span>
          </div>
          <button type="submit" className="btn-secondary" disabled={revokePending}>
            <UserRoundX aria-hidden="true" />
            {revokePending ? "Memproses…" : "Keluarkan semua perangkat"}
          </button>
        </form>
      )}
      {revokeState && !revokeState.ok && <p className="customer-portal-form-error" role="alert">{revokeState.error}</p>}
      {revokeState?.ok && <p className="customer-portal-form-success" role="status">Seluruh sesi portal pelanggan telah diakhiri.</p>}
    </div>
  );
}
