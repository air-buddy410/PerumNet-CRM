"use client";

import { useState, type FormEvent } from "react";

type ProfileUpdateAction = (formData: FormData) => Promise<void>;

type ProfileContactFormProps = {
  initialName: string;
  initialPhone: string | null;
  updateAction?: ProfileUpdateAction;
};

function validateName(value: string) {
  const name = value.trim();
  if (!name) return "Nama tampilan wajib diisi.";
  if (name.length < 2) return "Nama tampilan minimal 2 karakter.";
  return "";
}

function validatePhone(value: string) {
  const phone = value.trim();
  if (!phone) return "";
  if (!/^[+0-9()\-\s.]{7,30}$/.test(phone)) {
    return "Nomor telepon hanya boleh berisi angka dan simbol telepon yang umum.";
  }
  return "";
}

export function ProfileContactForm({
  initialName,
  initialPhone,
  updateAction,
}: ProfileContactFormProps) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [nameError, setNameError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const enabled = Boolean(updateAction);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const nextNameError = validateName(name);
    const nextPhoneError = validatePhone(phone);
    setNameError(nextNameError);
    setPhoneError(nextPhoneError);

    if (nextNameError || nextPhoneError || !enabled) {
      event.preventDefault();
    }
  }

  return (
    <form action={updateAction} onSubmit={handleSubmit} className="crm-profile-contact-form">
      <div className="crm-profile-form-grid">
        <div>
          <label className="label" htmlFor="profileName">Nama tampilan</label>
          <input
            id="profileName"
            name="name"
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => setNameError(validateName(name))}
            readOnly={!enabled}
            required
            minLength={2}
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? "profileNameError" : undefined}
          />
          {nameError && <p id="profileNameError" className="crm-profile-field-error">{nameError}</p>}
        </div>
        <div>
          <label className="label" htmlFor="profilePhone">Nomor telepon</label>
          <input
            id="profilePhone"
            name="phone"
            type="tel"
            inputMode="tel"
            className="input"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            onBlur={() => setPhoneError(validatePhone(phone))}
            readOnly={!enabled}
            maxLength={30}
            aria-invalid={Boolean(phoneError)}
            aria-describedby={phoneError ? "profilePhoneError" : undefined}
          />
          {phoneError && <p id="profilePhoneError" className="crm-profile-field-error">{phoneError}</p>}
        </div>
      </div>
      {enabled ? (
        <button type="submit" className="btn-primary">Simpan kontak</button>
      ) : (
        <div className="crm-profile-integration-note" role="status">
          <span className="crm-profile-note-dot" aria-hidden="true" />
          Perubahan nama dan telepon akan aktif setelah Opus menyediakan action profile yang ter-audit.
        </div>
      )}
    </form>
  );
}
