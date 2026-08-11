import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  MAINTENANCE_TYPES,
  statusLabel,
  formatDateTime,
} from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { createMaintenanceAction } from "./actions";

export const metadata = { title: "Network Maintenance" };

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.NOC_VIEW);
  const sp = await searchParams;
  const canManage = user.permissions.has(PERMISSIONS.MAINTENANCE_MANAGE);

  const [items, sites, devices, users] = await Promise.all([
    db.networkMaintenance.findMany({
      include: { site: true, device: true, pic: true },
      orderBy: { scheduledStart: "desc" },
      take: 100,
    }),
    db.networkSite.findMany({ orderBy: { siteCode: "asc" } }),
    db.networkDevice.findMany({ orderBy: { hostname: "asc" } }),
    db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);
  const typeLabel = (v: string) => MAINTENANCE_TYPES.find(([t]) => t === v)?.[1] ?? v;

  return (
    <div>
      <PageHeader
        title="Network Maintenance"
        subtitle="Catat tujuan, risiko, jadwal, PIC, dan persetujuan untuk setiap maintenance."
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="card overflow-x-auto">
          {items.length === 0 ? (
            <EmptyState message="Belum ada maintenance." />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th">Nomor</th>
                  <th className="th">Judul</th>
                  <th className="th">Jenis</th>
                  <th className="th">Target</th>
                  <th className="th">Jadwal</th>
                  <th className="th">PIC</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="td whitespace-nowrap">
                      <Link href={`/noc/maintenance/${m.id}`} className="font-medium text-brand-600 hover:underline">
                        {m.maintNumber}
                      </Link>
                    </td>
                    <td className="td max-w-48 truncate">{m.title}</td>
                    <td className="td text-xs">{typeLabel(m.type)}</td>
                    <td className="td text-xs">{m.site?.siteCode ?? m.device?.hostname ?? "-"}</td>
                    <td className="td whitespace-nowrap text-xs">
                      {formatDateTime(m.scheduledStart)}
                    </td>
                    <td className="td text-xs">{m.pic.name}</td>
                    <td className="td"><Badge value={m.status} label={statusLabel(m.status)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {canManage && (
          <div className="card h-fit p-5">
            <h2 className="mb-4 font-medium">Maintenance Baru</h2>
            <form action={createMaintenanceAction} className="space-y-3">
              <div>
                <label className="label" htmlFor="title">Judul</label>
                <input id="title" name="title" className="input" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="type">Jenis</label>
                  <select id="type" name="type" className="input" defaultValue="PREVENTIVE">
                    {MAINTENANCE_TYPES.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="picId">PIC</label>
                  <select id="picId" name="picId" className="input" defaultValue={user.id}>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="siteId">Site</label>
                  <select id="siteId" name="siteId" className="input" defaultValue="">
                    <option value="">— tidak —</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>{s.siteCode}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="deviceId">Perangkat</label>
                  <select id="deviceId" name="deviceId" className="input" defaultValue="">
                    <option value="">— tidak —</option>
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>{d.hostname}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="scheduledStart">Mulai</label>
                  <input id="scheduledStart" name="scheduledStart" type="datetime-local" className="input" required />
                </div>
                <div>
                  <label className="label" htmlFor="scheduledEnd">Selesai</label>
                  <input id="scheduledEnd" name="scheduledEnd" type="datetime-local" className="input" required />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="purpose">Tujuan (wajib)</label>
                <textarea id="purpose" name="purpose" rows={2} className="input" required />
              </div>
              <div>
                <label className="label" htmlFor="risk">Risiko (wajib)</label>
                <textarea id="risk" name="risk" rows={2} className="input" required />
              </div>
              <div>
                <label className="label" htmlFor="estDowntimeMin">Estimasi Downtime (menit)</label>
                <input id="estDowntimeMin" name="estDowntimeMin" type="number" min={0} className="input" />
              </div>
              <button type="submit" className="btn-primary w-full justify-center">Buat Draft</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
