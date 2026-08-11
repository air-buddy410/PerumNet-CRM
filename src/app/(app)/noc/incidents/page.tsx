import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  INCIDENT_STATUSES,
  INCIDENT_SEVERITIES,
  INCIDENT_TYPES,
  statusLabel,
  formatDateTime,
} from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";

export const metadata = { title: "Incidents" };

function durationText(start: Date, end: Date | null): string {
  const ms = (end ? end.getTime() : Date.now()) - start.getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}j ${minutes % 60}m`;
}

export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; status?: string; severity?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.NOC_VIEW);
  const sp = await searchParams;

  const incidents = await db.incident.findMany({
    where: {
      ...(sp.status ? { status: sp.status } : {}),
      ...(sp.severity ? { severity: sp.severity } : {}),
    },
    include: {
      pic: true,
      site: true,
      device: true,
      _count: { select: { impacted: true } },
    },
    orderBy: { detectedAt: "desc" },
    take: 100,
  });
  const typeLabel = (v: string) => INCIDENT_TYPES.find(([t]) => t === v)?.[1] ?? v;

  return (
    <div>
      <PageHeader
        title="Incidents & Outages"
        subtitle="Durasi gangguan dihitung dari deteksi hingga pulih. Incident besar ditutup oleh NOC Manager."
        action={
          user.permissions.has(PERMISSIONS.INCIDENTS_CREATE) ? (
            <Link href="/noc/incidents/new" className="btn-primary">+ Incident</Link>
          ) : undefined
        }
      />
      <Flash ok={sp.ok} error={sp.error} />

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="severity">Severity</label>
          <select id="severity" name="severity" className="input w-44" defaultValue={sp.severity ?? ""}>
            <option value="">Semua</option>
            {INCIDENT_SEVERITIES.map((s) => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" className="input w-44" defaultValue={sp.status ?? ""}>
            <option value="">Semua</option>
            {INCIDENT_STATUSES.map((s) => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        {incidents.length === 0 ? (
          <EmptyState message="Tidak ada incident." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Nomor</th>
                <th className="th">Severity</th>
                <th className="th">Judul</th>
                <th className="th">Lokasi</th>
                <th className="th">PIC</th>
                <th className="th">Durasi</th>
                <th className="th">Terdampak</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {incidents.map((i) => (
                <tr key={i.id} className={["P1", "P2"].includes(i.severity) && i.status !== "CLOSED" ? "bg-red-50/40" : "hover:bg-slate-50"}>
                  <td className="td whitespace-nowrap">
                    <Link href={`/noc/incidents/${i.id}`} className="font-medium text-brand-600 hover:underline">
                      {i.incidentNumber}
                    </Link>
                    {i.isOutage && <span className="ml-1 text-xs text-red-600">(outage)</span>}
                  </td>
                  <td className="td">
                    <Badge
                      value={["P1", "P2"].includes(i.severity) ? "REJECTED" : "PENDING"}
                      label={i.severity}
                    />
                  </td>
                  <td className="td max-w-56 truncate">
                    <span className="font-medium">{i.title}</span>
                    <span className="block text-xs text-slate-500">{typeLabel(i.type)}</span>
                  </td>
                  <td className="td text-xs">{i.site?.siteCode ?? i.device?.hostname ?? "-"}</td>
                  <td className="td text-xs">{i.pic?.name ?? <span className="text-amber-600">Belum ada</span>}</td>
                  <td className="td whitespace-nowrap text-xs">
                    {durationText(i.detectedAt, i.resolvedAt)}
                  </td>
                  <td className="td">{i._count.impacted}</td>
                  <td className="td"><Badge value={i.status} label={statusLabel(i.status)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Terdeteksi: {incidents.length > 0 ? formatDateTime(incidents[incidents.length - 1].detectedAt) : "-"} — sekarang
      </p>
    </div>
  );
}
