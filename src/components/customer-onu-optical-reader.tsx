"use client";

import { Activity, Radio } from "lucide-react";
import { useActionState } from "react";
import { bacaDayaOnuAction } from "@/app/(app)/crm/customers/actions";
import { formatUiDateTime } from "@/components/ui-formatters";

type OpticalReadResult = Awaited<ReturnType<typeof bacaDayaOnuAction>>;

function readOpticalPower(_previous: OpticalReadResult | null, formData: FormData) {
  return bacaDayaOnuAction(formData);
}

function failureLabel(reason: Extract<OpticalReadResult, { ok: false }>["sebab"]) {
  switch (reason) {
    case "BELUM_DIDUKUNG":
      return "Belum didukung";
    case "TANPA_POSISI":
      return "Posisi belum tersedia";
    case "TAK_TERBACA":
      return "Belum terbaca";
    case "GALAT":
      return "Gagal membaca";
  }
}

export function CustomerOnuOpticalReader({
  subscriptionId,
  onuPosition,
}: {
  subscriptionId: string;
  onuPosition: string | null;
}) {
  const [state, formAction, pending] = useActionState(readOpticalPower, null);
  const hasPosition = Boolean(onuPosition?.trim());

  return (
    <div className="customer-onu-optical" aria-label="Pembacaan daya optik ONU">
      <div className="customer-onu-optical-heading">
        <div className="min-w-0">
          <strong><Radio aria-hidden="true" /> Daya optik ONU</strong>
          <span>Pembacaan manual dari OLT. Hasilnya adalah snapshot saat tombol ditekan.</span>
        </div>
        {hasPosition ? (
          <form action={formAction} aria-busy={pending}>
            <input type="hidden" name="subscriptionId" value={subscriptionId} />
            <button type="submit" className="btn-secondary customer-onu-optical-button" disabled={pending}>
              <Activity aria-hidden="true" />
              {pending ? "Membaca dari OLT…" : "Baca daya ONU"}
            </button>
          </form>
        ) : (
          <span className="system-status-pill is-disabled">Posisi belum tersedia</span>
        )}
      </div>

      {!hasPosition && (
        <p className="customer-onu-optical-note">Posisi ONU belum tersedia. Pembacaan daya belum dapat diminta.</p>
      )}

      {state && state.ok && (
        <div className={`customer-onu-optical-result ${state.mutu === "WASPADA" ? "is-attention" : state.mutu === "KRITIS" ? "is-critical" : "is-healthy"}`} role="status" aria-live="polite">
          <div className="customer-onu-optical-result-heading">
            <div className="min-w-0">
              <div className="customer-onu-optical-reading">
                <strong>{state.dBm.toFixed(2)} dBm</strong>
                <span className="customer-onu-optical-distance">
                  Jarak ONU: {state.jarakMeter === null ? "—" : `${state.jarakMeter} m`}
                </span>
              </div>
              <span>{state.keterangan}</span>
            </div>
            <span className={`system-status-pill ${state.mutu === "WASPADA" ? "is-attention" : state.mutu === "KRITIS" ? "is-critical" : "is-healthy"}`}>
              {state.mutu}
            </span>
          </div>
          <dl className="customer-onu-optical-meta">
            <div>
              <dt>Nama di perangkat</dt>
              <dd>{state.namaDiPerangkat ?? "Belum tersedia"}</dd>
            </div>
            <div>
              <dt>OLT</dt>
              <dd>{state.olt}</dd>
            </div>
            <div>
              <dt>Posisi ONU</dt>
              <dd>{state.posisi}</dd>
            </div>
            <div>
              <dt>Dibaca pada</dt>
              <dd>{formatUiDateTime(state.dibacaPada)}</dd>
            </div>
          </dl>
        </div>
      )}

      {state && !state.ok && (
        <div className={`customer-onu-optical-result ${state.sebab === "GALAT" ? "is-critical" : "is-disabled"}`} role={state.sebab === "GALAT" ? "alert" : "status"} aria-live="polite">
          <div className="customer-onu-optical-result-heading">
            <strong>{failureLabel(state.sebab)}</strong>
            <span className="system-status-pill is-disabled">Snapshot belum tersedia</span>
          </div>
          <p className="customer-onu-optical-message">{state.pesan}</p>
        </div>
      )}
    </div>
  );
}
