import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  MAJOR_INCIDENT_SEVERITIES,
  statusLabel,
  formatDateTime,
} from "@/lib/constants";
import { PageHeader, Flash, BackLink, Badge, EmptyState } from "@/components/ui";
import {
  ackIncidentAction,
  updateIncidentAction,
  setImpactAction,
  resolveIncidentAction,
  closeIncidentAction,
  setOutageCommAction,
} from "../actions";

export const metadata = { title: "Detail Incident" };

function durationText(start: Date, end: Date | null): string {
  const ms = (end ? end.getTime() : Date.now()) - start.getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes} menit`;
  const hours = Math.floor(minutes / 60);
  return `${hours} jam ${minutes % 60} menit`;
}

export default async function IncidentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.NOC_VIEW);
  const { id } = await params;
  const sp = await searchParams;

  const incident = await db.incident.findUnique({
    where: { id },
    include: {
      pic: true,
      device: true,
      link: true,
      site: true,
      area: true,
      createdBy: true,
      alarms: true,
      updates: { include: { byUser: true }, orderBy: { createdAt: "desc" } },
      impacted: { include: { subscription: { include: { customer: true } } } },
    },
  });
  if (!incident) notFound();

  const subscriptions = await db.subscription.findMany({
    where: { status: { in: ["ACTIVE", "ISOLATED", "SUSPENDED"] } },
    include: { customer: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const canManage = user.permissions.has(PERMISSIONS.INCIDENTS_MANAGE);
  const isMajor = MAJOR_INCIDENT_SEVERITIES.includes(incident.severity as never);
  const canCloseThis = isMajor
    ? user.permissions.has(PERMISSIONS.INCIDENTS_CLOSE)
    : canManage;
  const isActive = !["RESOLVED", "CLOSED"].includes(incident.status);
  const impactedIds = new Set(incident.impacted.map((im) => im.subscriptionId));

  return (
    <div className="max-w-5xl">
      <BackLink href="/noc/incidents" label="Kembali ke daftar incident" />
      <PageHeader
        title={`${incident.incidentNumber} — ${incident.title}`}
        subtitle={`${incident.severity} · ${incident.isOutage ? "Outage · " : ""}dibuat ${incident.createdBy.name}, ${formatDateTime(incident.detectedAt)}`}
        action={<Badge value={incident.status} label={statusLabel(incident.status)} />}
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <div className="card p-6">
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Durasi</dt>
                <dd className="mt-0.5 text-sm font-semibold">
                  {durationText(incident.detectedAt, incident.resolvedAt)}
                  {!incident.resolvedAt && " (berjalan)"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">PIC</dt>
                <dd className="mt-0.5 text-sm">{incident.pic?.name ?? "Belum ada"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Lokasi</dt>
                <dd className="mt-0.5 text-sm">
                  {[incident.site?.siteCode, incident.device?.hostname, incident.link?.linkCode, incident.area?.name]
                    .filter(Boolean)
                    .join(" · ") || "-"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Terdeteksi</dt>
                <dd className="mt-0.5 text-sm">{formatDateTime(incident.detectedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Pulih</dt>
                <dd className="mt-0.5 text-sm">
                  {incident.resolvedAt ? formatDateTime(incident.resolvedAt) : "-"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Ditutup</dt>
                <dd className="mt-0.5 text-sm">
                  {incident.closedAt ? formatDateTime(incident.closedAt) : "-"}
                </dd>
              </div>
              {incident.rootCause && (
                <div className="sm:col-span-3">
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Root Cause</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-sm">{incident.rootCause}</dd>
                </div>
              )}
              {incident.resolution && (
                <div className="sm:col-span-3">
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Resolusi</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-sm">{incident.resolution}</dd>
                </div>
              )}
              {incident.preventiveAction && (
                <div className="sm:col-span-3">
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Preventive Action</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-sm">{incident.preventiveAction}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="card">
            <div className="border-b border-slate-100 px-5 py-4 font-medium">
              Timeline ({incident.updates.length})
            </div>
            {canManage && isActive && incident.status !== "DETECTED" && (
              <form
                action={updateIncidentAction}
                className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-5 py-4"
              >
                <input type="hidden" name="incidentId" value={incident.id} />
                <div className="min-w-56 flex-1">
                  <label className="label" htmlFor="note">Update</label>
                  <input id="note" name="note" className="input" required />
                </div>
                <div>
                  <label className="label" htmlFor="newStatus">Status</label>
                  <select id="newStatus" name="newStatus" className="input w-40" defaultValue="">
                    <option value="">— tetap —</option>
                    <option value="INVESTIGATING">Investigasi</option>
                    <option value="MITIGATING">Mitigasi</option>
                  </select>
                </div>
                <button type="submit" className="btn-secondary">Tambah</button>
              </form>
            )}
            {incident.updates.length === 0 ? (
              <EmptyState message="Belum ada timeline." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {incident.updates.map((u) => (
                  <li key={u.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm">{u.note}</span>
                      {u.status && <Badge value={u.status} label={statusLabel(u.status)} />}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {u.byUser.name} · {formatDateTime(u.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <div className="border-b border-slate-100 px-5 py-4 font-medium">
              Pelanggan Terdampak ({incident.impacted.length})
            </div>
            {incident.impacted.length > 0 && (
              <ul className="divide-y divide-slate-100">
                {incident.impacted.map((im) => (
                  <li key={im.id} className="flex items-center justify-between px-5 py-2 text-sm">
                    <Link
                      href={`/crm/subscriptions/${im.subscriptionId}`}
                      className="text-brand-600 hover:underline"
                    >
                      {im.subscription.serviceNumber}
                    </Link>
                    <span className="text-xs text-slate-500">{im.subscription.customer.name}</span>
                  </li>
                ))}
              </ul>
            )}
            {canManage && incident.status !== "CLOSED" && (
              <form action={setImpactAction} className="space-y-3 border-t border-slate-100 px-5 py-4">
                <input type="hidden" name="incidentId" value={incident.id} />
                <select
                  name="subscriptionIds"
                  multiple
                  size={Math.min(6, Math.max(3, subscriptions.length))}
                  className="input text-xs"
                  defaultValue={Array.from(impactedIds)}
                >
                  {subscriptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.serviceNumber} — {s.customer.name}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn-secondary">Simpan Pelanggan Terdampak</button>
              </form>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {incident.status === "DETECTED" && canManage && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Acknowledge</h2>
              <p className="mb-3 text-xs text-slate-500">Anda akan menjadi PIC incident ini.</p>
              <form action={ackIncidentAction}>
                <input type="hidden" name="incidentId" value={incident.id} />
                <button type="submit" className="btn-primary w-full justify-center">
                  Acknowledge
                </button>
              </form>
            </div>
          )}

          {isActive && incident.status !== "DETECTED" && canManage && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Resolve (Layanan Pulih)</h2>
              <form action={resolveIncidentAction} className="space-y-3">
                <input type="hidden" name="incidentId" value={incident.id} />
                <textarea name="resolution" rows={2} className="input" placeholder="Resolusi (wajib)" required />
                <input
                  name="recoveryNote"
                  className="input"
                  placeholder="Verifikasi pemulihan (wajib)"
                  required
                />
                <button type="submit" className="btn-primary w-full justify-center">
                  Tandai Pulih
                </button>
              </form>
            </div>
          )}

          {incident.status === "RESOLVED" && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Tutup Incident</h2>
              <p className="mb-3 text-xs text-slate-500">
                {isMajor
                  ? `Incident ${incident.severity} wajib root cause review dan hanya ditutup NOC Manager.`
                  : "Root cause wajib diisi sebelum penutupan."}
              </p>
              {canCloseThis ? (
                <form action={closeIncidentAction} className="space-y-3">
                  <input type="hidden" name="incidentId" value={incident.id} />
                  <textarea name="rootCause" rows={2} className="input" placeholder="Root cause (wajib)" required />
                  <textarea
                    name="preventiveAction"
                    rows={2}
                    className="input"
                    placeholder={isMajor ? "Preventive action (wajib untuk P1/P2)" : "Preventive action (opsional)"}
                  />
                  <button type="submit" className="btn-primary w-full justify-center">
                    Tutup Incident
                  </button>
                </form>
              ) : (
                <p className="text-sm text-amber-600">
                  Menunggu verifikasi & penutupan oleh NOC Manager.
                </p>
              )}
            </div>
          )}

          {incident.isOutage && canManage && incident.status !== "CLOSED" && (
            <div className="card p-5">
              <h2 className="mb-1 text-sm font-medium">Komunikasi Publik (§33)</h2>
              <p className="mb-3 text-xs text-slate-500">
                Hanya info yang dipublikasikan yang tampil untuk CS/Sales/Management di halaman Status Gangguan.
              </p>
              <form action={setOutageCommAction} className="space-y-3">
                <input type="hidden" name="incidentId" value={incident.id} />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isPublic" className="h-4 w-4" defaultChecked={incident.isPublic} />
                  Publikasikan info gangguan
                </label>
                <textarea
                  name="publicNote"
                  rows={3}
                  className="input"
                  placeholder="Info untuk pelanggan/CS (area terdampak, status, penyebab bila diketahui)"
                  defaultValue={incident.publicNote ?? ""}
                />
                <div>
                  <label className="label" htmlFor="publicEta">Estimasi Pemulihan</label>
                  {incident.publicEta && (
                    <p className="mb-1 text-xs text-slate-500">
                      Saat ini: {formatDateTime(incident.publicEta)}
                    </p>
                  )}
                  <input id="publicEta" name="publicEta" type="datetime-local" className="input" />
                </div>
                <button type="submit" className="btn-secondary w-full justify-center">
                  Simpan Komunikasi
                </button>
              </form>
            </div>
          )}

          {incident.alarms.length > 0 && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Alarm Terkait</h2>
              <ul className="space-y-1 text-sm">
                {incident.alarms.map((a) => (
                  <li key={a.id}>
                    <span className="font-mono text-xs">{a.alarmNumber}</span> — {a.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
