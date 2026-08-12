import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  INCIDENT_TYPES,
  INCIDENT_SEVERITIES,
  statusLabel,
} from "@/lib/constants";
import { PageHeader, Flash, BackLink } from "@/components/ui";
import { createIncidentAction } from "../actions";

export const metadata = { title: "Incident Baru" };

export default async function NewIncidentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePermission(PERMISSIONS.INCIDENTS_CREATE);
  const sp = await searchParams;

  const [devices, links, sites, areas] = await Promise.all([
    db.networkDevice.findMany({ orderBy: { hostname: "asc" } }),
    db.networkLink.findMany({ orderBy: { linkCode: "asc" } }),
    db.networkSite.findMany({ orderBy: { siteCode: "asc" } }),
    db.area.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="max-w-2xl">
      <BackLink href="/noc/incidents" label="Kembali ke daftar incident" />
      <PageHeader
        title="Incident Baru"
        subtitle="Severity wajib diisi. PIC ditetapkan saat incident diakui."
      />
      <Flash error={sp.error} />

      <form action={createIncidentAction} className="card space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="title">Judul</label>
            <input id="title" name="title" className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="type">Jenis</label>
            <select id="type" name="type" className="input" defaultValue="DEVICE_DOWN">
              {INCIDENT_TYPES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="severity">Severity (wajib)</label>
            <select id="severity" name="severity" className="input" required defaultValue="">
              <option value="" disabled>— pilih —</option>
              {INCIDENT_SEVERITIES.map((s) => (
                <option key={s} value={s}>{statusLabel(s)}</option>
              ))}
            </select>
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
            <label className="label" htmlFor="linkId">Link</label>
            <select id="linkId" name="linkId" className="input" defaultValue="">
              <option value="">— tidak spesifik —</option>
              {links.map((l) => (
                <option key={l.id} value={l.id}>{l.linkCode}</option>
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
          <div>
            <label className="label" htmlFor="areaId">Area Terdampak</label>
            <select id="areaId" name="areaId" className="input" defaultValue="">
              <option value="">— tidak spesifik —</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="initialNote">Catatan Awal</label>
            <textarea id="initialNote" name="initialNote" rows={2} className="input" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isOutage" />
          Outage (berdampak ke layanan pelanggan)
        </label>
        <button type="submit" className="btn-primary">Buat Incident</button>
      </form>
    </div>
  );
}
