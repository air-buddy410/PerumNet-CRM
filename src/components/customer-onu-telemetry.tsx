import type { PenilaianOnu } from "@/lib/onu-telemetry";
import { CustomerOnuOpticalReader } from "@/components/customer-onu-optical-reader";

export interface CustomerOnuTelemetryItem {
  subscriptionId: string;
  serviceNumber: string;
  onuPosition: string | null;
  ponStatus: string | null;
  evaluation: PenilaianOnu;
}

const stateMeta: Record<PenilaianOnu["keadaan"], { label: string; className: string }> = {
  NYALA: { label: "Nyala", className: "is-healthy" },
  PADAM_SENDIRIAN: { label: "Padam sendiri", className: "is-attention" },
  PADAM_SEPON: { label: "Padam se-PON", className: "is-critical" },
  PON_TAK_TERPANTAU: { label: "PON tak terpantau", className: "is-disabled" },
  TAK_DIKETAHUI: { label: "Belum diketahui", className: "is-disabled" },
};

function ponStatusLabel(status: string | null) {
  switch (status) {
    case "up": return "Up";
    case "down": return "Down";
    case "testing": return "Testing";
    case "unknown": return "Belum diketahui";
    default: return "Belum terpantau";
  }
}

export function CustomerOnuTelemetry({ items }: { items: CustomerOnuTelemetryItem[] }) {
  return (
    <section className="card mt-6 min-w-0" aria-labelledby="customer-onu-telemetry-title">
      <div className="crm-panel-heading">
        <div>
          <h2 id="customer-onu-telemetry-title">Keadaan ONU</h2>
          <p>Kesimpulan dari sesi PPPoE, status PON, dan keadaan pelanggan sekitar yang tersedia.</p>
        </div>
        <span className="system-status-pill is-disabled">{items.length} layanan</span>
      </div>
      {items.length === 0 ? (
        <div className="crm-empty-state">Belum ada layanan yang dapat dinilai.</div>
      ) : (
        <div className="customer-onu-list">
          {items.map((item) => {
            const meta = stateMeta[item.evaluation.keadaan];
            return (
              <article key={item.serviceNumber} className={`customer-onu-row ${meta.className}`}>
                <div className="customer-onu-heading">
                  <div className="min-w-0">
                    <strong>{item.serviceNumber}</strong>
                    <span>ONU {item.onuPosition ?? "belum dipetakan"} · PON {ponStatusLabel(item.ponStatus)}</span>
                  </div>
                  <span className={`system-status-pill ${meta.className}`}>{meta.label}</span>
                </div>
                <p>{item.evaluation.ringkas}</p>
                {item.evaluation.keadaan === "PADAM_SEPON" && (
                  <p className="customer-onu-dispatch-note">Gangguan mencakup satu PON. Jangan langsung mengirim engineer ke lokasi customer sebelum jalur PON diperiksa.</p>
                )}
                {item.evaluation.belumDiketahui.length > 0 && (
                  <ul className="customer-onu-unknown-list">
                    {item.evaluation.belumDiketahui.map((reason) => <li key={reason}>{reason}</li>)}
                  </ul>
                )}
                <CustomerOnuOpticalReader subscriptionId={item.subscriptionId} onuPosition={item.onuPosition} />
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
