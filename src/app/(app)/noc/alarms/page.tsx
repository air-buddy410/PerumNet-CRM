import Link from "next/link";
import { Prisma } from "@prisma/client";
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
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams, type TableSortOption } from "@/components/table-controls";
import {
  createAlarmAction,
  ackAlarmAction,
  clearAlarmAction,
  escalateAlarmAction,
} from "./actions";

export const metadata = { title: "Alarms" };
const sortOptions: readonly TableSortOption[] = [
  { value: "occurredAt", label: "Waktu" },
  { value: "alarmNumber", label: "Nomor" },
  { value: "severity", label: "Severity" },
];

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
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.NOC_VIEW);
  const sp = await searchParams;
  const table = parseTableQuery(sp, { defaultSort: "occurredAt", defaultDirection: "desc", sortOptions });
  const canManage = user.permissions.has(PERMISSIONS.ALARMS_MANAGE);
  const canEscalate = user.permissions.has(PERMISSIONS.INCIDENTS_CREATE);
  const orderBy: Prisma.NetworkAlarmOrderByWithRelationInput[] = table.sort === "alarmNumber"
    ? [{ alarmNumber: table.direction }, { id: "asc" }]
    : table.sort === "severity"
      ? [{ severity: table.direction }, { id: "asc" }]
      : [{ occurredAt: table.direction }, { id: "asc" }];

  const [alarms, total, devices, sites] = await Promise.all([
    db.networkAlarm.findMany({
      include: { device: true, site: true, acknowledgedBy: true, incident: true },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.networkAlarm.count(),
    db.networkDevice.findMany({ orderBy: { hostname: "asc" } }),
    db.networkSite.findMany({ orderBy: { siteCode: "asc" } }),
  ]);
  const openCount = alarms.filter((a) => !a.clearedAt).length;

  return (
    <div>
      <PageHeader
        title="Alarms"
        subtitle={`Alarm manual dan monitoring. ${openCount} alarm belum ditangani. Alarm dapat dieskalasikan menjadi incident.`}
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="crm-list-column">
          <div className="card overflow-x-auto">
          {alarms.length === 0 ? (
            <EmptyState message="Belum ada alarm." />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th"><SortableTableHeader basePath="/noc/alarms" currentDirection={table.direction} currentSort={table.sort} label="Nomor" query={table.query} sortKey="alarmNumber" /></th>
                  <th className="th"><SortableTableHeader basePath="/noc/alarms" currentDirection={table.direction} currentSort={table.sort} label="Severity" query={table.query} sortKey="severity" /></th>
                  <th className="th">Pesan</th>
                  <th className="th">Sumber</th>
                  <th className="th"><SortableTableHeader basePath="/noc/alarms" currentDirection={table.direction} currentSort={table.sort} label="Waktu" query={table.query} sortKey="occurredAt" /></th>
                  <th className="th">Status</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {alarms.map((a) => (
                  <tr key={a.id} className={a.clearedAt ? "hover:bg-slate-50" : "bg-red-50/30"}>
                    <td className="td whitespace-nowrap font-mono text-xs">
                      {a.alarmNumber}
                      {a.source !== "MANUAL" && (
                        <span className="block font-sans text-[10px] uppercase tracking-wide text-slate-400">
                          via {a.source}
                        </span>
                      )}
                    </td>
                    <td className="td">
                      <Badge value={SEV_BADGE[a.severity] ?? "PENDING"} label={statusLabel(a.severity)} />
                    </td>
                    <td className="td max-w-56 text-xs">
                      <span className="block truncate">{a.message}</span>
                      {a.count > 1 && (
                        <span
                          className="text-[10px] font-semibold text-red-600"
                          title={`Terjadi ${a.count}× — duplikat dikelompokkan (anti alarm-flooding)`}
                        >
                          ×{a.count} kejadian
                        </span>
                      )}
                    </td>
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
        <TableControls basePath="/noc/alarms" direction={table.direction} page={table.page} pageSize={table.pageSize} query={table.query} sort={table.sort} sortOptions={sortOptions} total={total} />
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
