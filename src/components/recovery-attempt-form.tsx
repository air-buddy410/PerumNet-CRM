"use client";

import { useRef, useState, type FormEvent } from "react";

type FormAction = (formData: FormData) => Promise<void>;

export function RecoveryAttemptForm({
  action,
  recoveryId,
  results,
  origin,
}: {
  action: FormAction;
  recoveryId: string;
  results: readonly (readonly [string, string])[];
  origin?: "portal" | "backoffice";
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const submittingRef = useRef(false);
  const [locationState, setLocationState] = useState<"idle" | "loading" | "attached" | "unavailable">("idle");

  function submitWithoutLocation() {
    if (!formRef.current) return;
    submittingRef.current = true;
    formRef.current.requestSubmit();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (submittingRef.current) {
      submittingRef.current = false;
      return;
    }
    if (!navigator.geolocation) {
      setLocationState("unavailable");
      return;
    }
    event.preventDefault();
    setLocationState("loading");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const form = formRef.current;
        if (!form) return;
        const latitude = form.elements.namedItem("latitude");
        const longitude = form.elements.namedItem("longitude");
        if (latitude instanceof HTMLInputElement) latitude.value = String(position.coords.latitude);
        if (longitude instanceof HTMLInputElement) longitude.value = String(position.coords.longitude);
        setLocationState("attached");
        submitWithoutLocation();
      },
      () => {
        setLocationState("unavailable");
        submitWithoutLocation();
      },
      { enableHighAccuracy: false, timeout: 7000, maximumAge: 120000 },
    );
  }

  return (
    <form ref={formRef} action={action} onSubmit={handleSubmit} className="space-y-3">
      <input type="hidden" name="recoveryId" value={recoveryId} />
      {origin && <input type="hidden" name="origin" value={origin} />}
      <input type="hidden" name="latitude" />
      <input type="hidden" name="longitude" />
      <select name="result" className="input" defaultValue="TIDAK_DI_TEMPAT">
        {results.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
      </select>
      <textarea name="note" rows={2} className="input" placeholder="Keterangan kunjungan" />
      <p className="text-xs text-slate-500" role="status">
        {locationState === "loading" && "Mencoba mengambil lokasi…"}
        {locationState === "attached" && "Lokasi terlampir pada kunjungan."}
        {locationState === "unavailable" && "Lokasi tidak tersedia; kunjungan tetap dapat disimpan."}
        {locationState === "idle" && "Lokasi browser bersifat opsional."}
      </p>
      <button type="submit" className="btn-secondary w-full justify-center" disabled={locationState === "loading"}>
        Simpan kunjungan
      </button>
    </form>
  );
}
