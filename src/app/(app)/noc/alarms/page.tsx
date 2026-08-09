import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  ALARM_SEVERITIES,
  INCIDENT_SEVERITIES,
  statusLabel,
  formatDateTime,
} from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import {
  createAlarmAction,
  ackAlarmAction,
  clearAlarmAction,
  escalateAlarmAction,
} from "./actions";

export const metadata = { title: "Alarms" };

const SEV_BADGE: Record<string, string> = {
  INFORMATIONAL: "CANCELLED",
  WARNING: "PENDING",
  MINOR: "PENDING",
  MAJOR: "REJECTED",
  CRITICAL: "REJECTED",
};

export default async function AlarmsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.NOC_VIEW);
  const sp = await searchParams;
  const canManage = user.permissions.has(PERMISSIONS.ALARMS_MANAGE);
  const canEscalate = user.permissions.has(PERMISSIONS.INCIDENTS_CREATE);

  const [alarms, devices, sites] = await Promise.all([
    db.networkAlarm.findMany({
      include: { device: true, site: true, acknowledgedBy: true, incident: true },
      orderBy: { occurredAt: "desc" },
      take: 100,
    }),
    db.networkDevice.findMany({ orderBy: { hostname: "asc" } }),
    db.networkSite.findMany({ orderBy: { siteCode: "asc" } }),
  ]);
  const openCount = alarms.filter((a) => !a.clearedAt).length;

  return (
    <div>
      <PageHeader
        title="Alarms"
        subtitle={`Alarm manual/monitoring (PRD §31). ${openCount} alarm belum clear. Alarm dapat dieskalasi menjadi incident.`}
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="card overflow-x-auto">
          {alarms.length === 0 ? (
            <EmptyState message="Belum ada alarm." />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th">Nomor</th>
                  <th className="th">Severity</th>
                  <th className="th">Pesan</th>
                  <th className="th">Sumber</th>
                  <th className="th">Waktu</th>
                  <th className="th">Status</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {alarms.map((a) => (
                  <tr key={a.id} className={a.clearedAt ? "hover:bg-slate-50" : "bg-red-50/30"}>
                    <td className="td font-mono text-xs">{a.alarmNumber}</td>
                    <td className="td">
                      <Badge value={SEV_BADGE[a.severity] ?? "PENDING"} label={statusLabel(a.severity)} />
                    </td>
                    <td className="td max-w-56 truncate text-xs">{a.message}</td>
                    <td className="td text-xs">
                      {a.device?.hostname ?? a.site?.siteCode ?? "-"}
                    </td>
                    <td className="td whitespace-nowrap text-xs">{formatDateTime(a.occurredAt)}</td>
                    <td className="td text-xs">
                      {a.clearedAt
                        ? "Clear"
                        : a.acknowledgedAt
                          ? `Ack: ${a.acknowledgedBy?.name}`
                          : "Baru"}
                      {a.incident && (
                        <Link
                          href={`/noc/incidents/${a.incident.id}`}
                          className="block text-brand-600 hover:underline"
                        >
                          {a.incident.incidentNumber}
                        </Link>
                      )}
                    </td>
                    <td className="td whitespace-nowrap text-right text-xs">
                      {canManage && !a.acknowledgedAt && (
                        <form action={ackAlarmAction} className="inline">
                          <input type="hidden" name="alarmId" value={a.id} />
                          <button type="submit" className="text-brand-600 hover:underline">Ack</button>
                        </form>
                      )}
                      {canManage && !a.clearedAt && (
                        <form action={clearAlarmAction} className="ml-2 inline">
                          <input type="hidden" name="alarmId" value={a.id} />
                          <button type="submit" className="text-slate-500 hover:underline">Clear</button>
                        </form>
                      )}
                      {canEscalate && !a.incidentId && !a.clearedAt && (
                        <form action={escalateAlarmAction} className="ml-2 inline-flex items-center gap-1">
                          <input type="hidden" name="alarmId" value={a.id} />
                          <select name="severity" className="input px-1 py-0.5 text-xs" defaultValue="P3">
                            {INCIDENT_SEVERITIES.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                          <button type="submit" className="text-red-600 hover:underline">→ Incident</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {canManage && (
          <div className="card h-fit p-5">
            <h2 className="mb-4 font-medium">Catat Alarm</h2>
            <form action={createAlarmAction} className="space-y-3">
              <div>
                <label className="label" htmlFor="severity">Severity</label>
                <select id="severity" name="severity" className="input" defaultValue="WARNING">
                  {ALARM_SEVERITIES.map((s) => (
                    <option key={s} value={s}>{statusLabel(s)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="message">Pesan</label>
                <textarea id="message" name="message" rows={2} className="input" required />
              </div>
              <div>
                <label className="label" htmlFor="deviceId">Perangkat</label>
                <select id="deviceId" name="deviceId" className="input" defaultValue="">
                  <option value="">— tidak spesifik —</option>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>{d.hostname}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="siteId">Site</label>
                <select id="siteId" name="siteId" className="input" defaultValue="">
                  <option value="">— tidak spesifik —</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>{s.siteCode}</option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn-primary w-full justify-center">Catat Alarm</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
