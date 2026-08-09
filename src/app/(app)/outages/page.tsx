import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, statusLabel, formatDateTime } from "@/lib/constants";
import { listPublicOutages } from "@/lib/integrations";
import { PageHeader, Badge, EmptyState } from "@/components/ui";

export const metadata = { title: "Status Gangguan" };

function durationText(start: Date, end: Date | null): string {
  const ms = (end ? end.getTime() : Date.now()) - start.getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "< 1 menit";
  if (minutes < 60) return `${minutes} menit`;
  const hours = Math.floor(minutes / 60);
  return `${hours} jam ${minutes % 60} menit`;
}

export default async function OutagesPage() {
  await requirePermission(PERMISSIONS.OUTAGES_VIEW);
  const outages = await listPublicOutages();
  const active = outages.filter((o) => !o.resolvedAt);
  const recovered = outages.filter((o) => o.resolvedAt);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Status Gangguan"
        subtitle="Informasi outage yang telah disetujui NOC untuk komunikasi (PRD §33). Gunakan info ini saat menjawab pelanggan."
      />

      <h2 className="mb-2 text-sm font-semibold text-slate-600">Sedang Berlangsung</h2>
      <div className="mb-6 space-y-4">
        {active.length === 0 ? (
          <div className="card">
            <EmptyState message="Tidak ada gangguan aktif. 🎉" />
          </div>
        ) : (
          active.map((o) => (
            <div key={o.id} className="card border-l-4 border-l-red-500 p-5">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-slate-500">{o.incidentNumber}</span>
                <Badge value={o.severity} label={statusLabel(o.severity)} />
                <Badge value={o.status} label={statusLabel(o.status)} />
              </div>
              <h3 className="font-medium">{o.title}</h3>
              <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <div className="flex gap-2">
                  <dt className="text-slate-400">Area:</dt>
                  <dd>{o.area?.name ?? o.site?.name ?? "-"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-slate-400">Pelanggan terdampak:</dt>
                  <dd>{o._count.impacted > 0 ? o._count.impacted : "-"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-slate-400">Mulai:</dt>
                  <dd>{formatDateTime(o.detectedAt)} ({durationText(o.detectedAt, null)})</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-slate-400">Estimasi pulih:</dt>
                  <dd>{o.publicEta ? formatDateTime(o.publicEta) : "Belum ada estimasi"}</dd>
                </div>
              </dl>
              {o.publicNote && (
                <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">
                  {o.publicNote}
                </p>
              )}
              <p className="mt-2 text-xs text-slate-400">
                Pembaruan terakhir: {o.publicUpdatedAt ? formatDateTime(o.publicUpdatedAt) : "-"}
              </p>
            </div>
          ))
        )}
      </div>

      {recovered.length > 0 && (
        <>
          <h2 className="mb-2 text-sm font-semibold text-slate-600">Pulih (7 hari terakhir)</h2>
          <div className="space-y-4">
            {recovered.map((o) => (
              <div key={o.id} className="card border-l-4 border-l-emerald-500 p-5 opacity-80">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-slate-500">{o.incidentNumber}</span>
                  <Badge value="RESOLVED" label="Pulih" />
                </div>
                <h3 className="font-medium">{o.title}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {[
                    o.area?.name ?? o.site?.name,
                    `pulih ${formatDateTime(o.resolvedAt)}`,
                    `durasi ${durationText(o.detectedAt, o.resolvedAt)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {o.publicNote && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{o.publicNote}</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
