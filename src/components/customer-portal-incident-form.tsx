"use client";

import { AlertCircle, Send } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { laporGangguanAction } from "@/app/pelanggan/actions";

export function CustomerPortalIncidentForm({ openTicketCount }: { openTicketCount: number }) {
  const [state, formAction, pending] = useActionState(laporGangguanAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <section className="customer-portal-card customer-portal-incident" aria-labelledby="customer-portal-incident-title">
      <div className="customer-portal-card-heading">
        <div>
          <span className="customer-portal-card-kicker">Bantuan</span>
          <h2 id="customer-portal-incident-title">Lapor gangguan</h2>
        </div>
        <span className="customer-portal-card-icon" aria-hidden="true"><AlertCircle /></span>
      </div>
      <p className="customer-portal-muted">
        Ceritakan kendala koneksi Anda. Tim kami akan memeriksa laporan melalui antrean helpdesk.
      </p>
      {openTicketCount > 0 && (
        <p className="customer-portal-honest-note">
          Anda masih memiliki laporan yang sedang ditangani. Laporan baru dengan gangguan yang sama dapat ditolak agar antrean tidak berulang.
        </p>
      )}

      <form ref={formRef} action={formAction} className="customer-portal-incident-form" aria-busy={pending}>
        <div>
          <label className="label" htmlFor="portal-incident-title">Judul gangguan</label>
          <input
            id="portal-incident-title"
            name="judul"
            className="input"
            minLength={5}
            maxLength={160}
            required
            placeholder="Contoh: Internet tidak dapat digunakan"
          />
        </div>
        <div>
          <label className="label" htmlFor="portal-incident-description">Detail gangguan</label>
          <textarea
            id="portal-incident-description"
            name="isi"
            className="input"
            rows={4}
            minLength={10}
            maxLength={4000}
            required
            placeholder="Jelaskan kapan gangguan dimulai dan lampu indikator yang terlihat."
          />
        </div>

        {state && !state.ok && (
          <p className="customer-portal-form-error" role="alert" aria-live="polite">
            {state.error}
          </p>
        )}
        {state?.ok && (
          <p className="customer-portal-form-success" role="status" aria-live="polite">
            Laporan berhasil diterima dan diteruskan ke tim kami.
          </p>
        )}

        <button type="submit" className="btn-primary customer-portal-submit" disabled={pending}>
          <Send aria-hidden="true" />
          {pending ? "Mengirim laporan…" : "Kirim laporan"}
        </button>
      </form>
    </section>
  );
}
