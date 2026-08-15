"use client";

import { useEffect, useRef, useState } from "react";

function toBirthDateFromNik(nik: string, currentYear: number) {
  const digits = nik.replace(/\D/g, "");
  if (digits.length !== 16) return null;

  let day = Number(digits.slice(6, 8));
  const month = Number(digits.slice(8, 10));
  const year = Number(digits.slice(10, 12));
  if (day > 40) day -= 40;
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;

  const century = year <= currentYear % 100 ? 2000 : 1900;
  const date = new Date(Date.UTC(century + year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;

  return date.toISOString().slice(0, 10);
}

export function CustomerPiiFields({
  initialIdentityNumber,
  initialBirthDate,
  canEdit,
}: {
  initialIdentityNumber: string | null;
  initialBirthDate: string;
  canEdit: boolean;
}) {
  const identityInputRef = useRef<HTMLInputElement>(null);
  const birthDateInputRef = useRef<HTMLInputElement>(null);
  const [identityNumber, setIdentityNumber] = useState(initialIdentityNumber ?? "");
  const [birthDate, setBirthDate] = useState(initialBirthDate);
  const [currentYear, setCurrentYear] = useState<number | null>(null);

  useEffect(() => {
    setCurrentYear(new Date().getFullYear());
  }, []);

  const digits = identityNumber.replace(/\D/g, "");
  const identityError = identityNumber.trim() && digits.length !== 16
    ? "NIK harus berisi 16 digit angka."
    : "";
  const derivedBirthDate = currentYear === null ? null : toBirthDateFromNik(identityNumber, currentYear);
  const identityDateError = currentYear !== null && digits.length === 16 && !derivedBirthDate
    ? "Tanggal lahir pada NIK tidak valid."
    : "";
  const identityFieldError = identityError || identityDateError;
  const birthDateMismatch = Boolean(derivedBirthDate && birthDate && derivedBirthDate !== birthDate);

  useEffect(() => {
    if (identityInputRef.current) {
      identityInputRef.current.setCustomValidity(identityFieldError);
    }
  }, [identityFieldError]);

  useEffect(() => {
    birthDateInputRef.current?.setCustomValidity(
      birthDateMismatch ? "Tanggal lahir tidak cocok dengan NIK." : "",
    );
  }, [birthDateMismatch]);

  function handleIdentityChange(value: string) {
    setIdentityNumber(value.replace(/\D/g, "").slice(0, 16));
  }

  return (
    <section className="crm-customer-pii-section" aria-labelledby="customer-pii-title">
      <div className="crm-customer-pii-heading">
        <div>
          <h2 id="customer-pii-title">Data identitas</h2>
          <p>NIK dan tanggal lahir digunakan untuk mencocokkan data pelanggan secara aman.</p>
        </div>
        <span className="crm-customer-pii-badge">Data terbatas</span>
      </div>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <label className="label" htmlFor="identityNumber">NIK</label>
          <input
            ref={identityInputRef}
            id="identityNumber"
            name="identityNumber"
            className="input"
            value={identityNumber}
            onChange={(event) => handleIdentityChange(event.target.value)}
            inputMode="numeric"
            autoComplete="off"
            maxLength={16}
            pattern="[0-9]{16}"
            disabled={!canEdit}
            aria-invalid={Boolean(identityFieldError)}
            aria-describedby="customer-pii-help customer-nik-error"
          />
          <p id="customer-pii-help" className="crm-customer-pii-help">
            Kosongkan bila data belum tersedia. NIK tidak wajib untuk menyimpan perubahan lain.
          </p>
          {identityFieldError && (
            <p id="customer-nik-error" className="crm-customer-pii-error" role="alert">
              {identityFieldError}
            </p>
          )}
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="birthDate">Tanggal lahir</label>
          <input
            ref={birthDateInputRef}
            id="birthDate"
            name="birthDate"
            type="date"
            className="input"
            value={birthDate}
            onChange={(event) => setBirthDate(event.target.value)}
            disabled={!canEdit}
            aria-invalid={birthDateMismatch}
            aria-describedby={birthDateMismatch ? "customer-birth-date-error" : undefined}
          />
          {derivedBirthDate && (
            <p className="crm-customer-pii-help">
              Tanggal dari NIK: <strong>{derivedBirthDate}</strong>
            </p>
          )}
          {birthDateMismatch && (
            <p id="customer-birth-date-error" className="crm-customer-pii-error" role="alert">
              Tanggal lahir tidak cocok dengan tanggal yang tersimpan dalam NIK.
            </p>
          )}
        </div>
      </div>
      {!canEdit && (
        <p className="crm-customer-pii-help">
          Data identitas hanya dapat dilihat. Anda tidak memiliki izin mengubah data customer.
        </p>
      )}
    </section>
  );
}
