"use client";

import { useState, type FormEvent } from "react";

type PasswordAction = (formData: FormData) => Promise<void>;

export function ProfilePasswordForm({ action }: { action: PasswordAction }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const mismatch = Boolean(confirmPassword) && newPassword !== confirmPassword;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (newPassword !== confirmPassword) {
      event.preventDefault();
    }
  }

  return (
    <form action={action} onSubmit={handleSubmit} className="crm-profile-password-form">
      <div className="crm-profile-password-fields">
        <div>
          <label className="label" htmlFor="profileCurrentPassword">Password saat ini</label>
          <input id="profileCurrentPassword" name="currentPassword" type="password" className="input" autoComplete="current-password" required />
        </div>
        <div>
          <label className="label" htmlFor="profileNewPassword">Password baru</label>
          <input id="profileNewPassword" name="newPassword" type="password" className="input" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="profileConfirmPassword">Ulangi password baru</label>
          <input id="profileConfirmPassword" name="confirmPassword" type="password" className="input" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} aria-invalid={mismatch} required />
          {mismatch && <p className="crm-profile-field-error">Password belum sama.</p>}
        </div>
      </div>
      <button type="submit" className="btn-primary" disabled={mismatch}>Simpan password</button>
    </form>
  );
}
