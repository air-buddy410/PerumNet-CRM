import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, ENVIRONMENTS, CRITICALITY, statusLabel, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { saveServerAction } from "../actions";

export const metadata = { title: "Server Inventory" };

export default async function ServersPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; edit?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.IT_VIEW);
  const sp = await searchParams;
  const canManage = user.permissions.has(PERMISSIONS.IT_INVENTORY_MANAGE);

  const [servers, users] = await Promise.all([
    db.server.findMany({
      include: { owner: true, _count: { select: { apps: true, backups: true } } },
      orderBy: [{ environment: "asc" }, { hostname: "asc" }],
    }),
    db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);
  const editRow = sp.edit ? (servers.find((s) => s.id === sp.edit) ?? null) : null;

  return (
    <div>
      <PageHeader
        title="Server Inventory"
        subtitle="Kelola server berdasarkan environment, owner, tujuan, dan tingkat kritikalitas."
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="card overflow-x-auto">
          {servers.length === 0 ? (
            <EmptyState message="Belum ada server terdaftar." />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th">Hostname</th>
                  <th className="th">Environment</th>
                  <th className="th">Provider</th>
                  <th className="th">Owner</th>
                  <th className="th">Criticality</th>
                  <th className="th">Aplikasi</th>
                  <th className="th">Status</th>
                  {canManage && <th className="th"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {servers.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="td font-mono text-xs">{s.hostname}</td>
                    <td className="td"><Badge value={s.environment} label={statusLabel(s.environment)} /></td>
                    <td className="td text-xs">{s.provider ?? "-"}{s.region ? ` (${s.region})` : ""}</td>
                    <td className="td text-xs">{s.owner?.name ?? "-"}</td>
                    <td className="td"><Badge value={s.criticality} label={statusLabel(s.criticality)} /></td>
                    <td className="td">{s._count.apps}</td>
                    <td className="td"><Badge value={s.status} label={statusLabel(s.status)} /></td>
                    {canManage && (
                      <td className="td text-right text-xs">
                        <Link href={`/it/servers?edit=${s.id}`} className="text-brand-600 hover:underline">
                          Ubah
                        </Link>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {canManage && (
          <div className="card h-fit p-5">
            <h2 className="mb-4 font-medium">{editRow ? `Ubah: ${editRow.hostname}` : "Server Baru"}</h2>
            <form action={saveServerAction} className="space-y-3">
              {editRow && <input type="hidden" name="id" value={editRow.id} />}
              <div>
                <label className="label" htmlFor="hostname">Hostname</label>
                <input id="hostname" name="hostname" className="input" defaultValue={editRow?.hostname ?? ""} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="environment">Environment</label>
                  <select id="environment" name="environment" className="input" defaultValue={editRow?.environment ?? "PRODUCTION"}>
                    {ENVIRONMENTS.map((e) => (
                      <option key={e} value={e}>{statusLabel(e)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="criticality">Criticality</label>
                  <select id="criticality" name="criticality" className="input" defaultValue={editRow?.criticality ?? "MEDIUM"}>
                    {CRITICALITY.map((c) => (
                      <option key={c} value={c}>{statusLabel(c)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="os">OS</label>
                  <input id="os" name="os" className="input" defaultValue={editRow?.os ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="ipAddress">IP Address</label>
                  <input id="ipAddress" name="ipAddress" className="input" defaultValue={editRow?.ipAddress ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="provider">Provider</label>
                  <input id="provider" name="provider" className="input" defaultValue={editRow?.provider ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="region">Region</label>
                  <input id="region" name="region" className="input" defaultValue={editRow?.region ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="cpu">CPU</label>
                  <input id="cpu" name="cpu" className="input" defaultValue={editRow?.cpu ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="ram">RAM</label>
                  <input id="ram" name="ram" className="input" defaultValue={editRow?.ram ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="storage">Storage</label>
                  <input id="storage" name="storage" className="input" defaultValue={editRow?.storage ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="ownerId">Owner</label>
                  <select id="ownerId" name="ownerId" className="input" defaultValue={editRow?.ownerId ?? ""}>
                    <option value="">— pilih —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="purpose">Tujuan (wajib)</label>
                <input id="purpose" name="purpose" className="input" defaultValue={editRow?.purpose ?? ""} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="backupPolicy">Backup Policy</label>
                  <input id="backupPolicy" name="backupPolicy" className="input" defaultValue={editRow?.backupPolicy ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="monitoringStatus">Monitoring</label>
                  <select id="monitoringStatus" name="monitoringStatus" className="input" defaultValue={editRow?.monitoringStatus ?? ""}>
                    <option value="">— pilih —</option>
                    <option value="MONITORED">Termonitor</option>
                    <option value="UNMONITORED">Tidak Termonitor</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="expiryDate">Expiry Kontrak</label>
                  <input id="expiryDate" name="expiryDate" type="date" className="input" defaultValue={editRow?.expiryDate ? editRow.expiryDate.toISOString().slice(0, 10) : ""} />
                </div>
                <div>
                  <label className="label" htmlFor="status">Status</label>
                  <select id="status" name="status" className="input" defaultValue={editRow?.status ?? "ACTIVE"}>
                    <option value="ACTIVE">Aktif</option>
                    <option value="INACTIVE">Nonaktif</option>
                    <option value="DECOMMISSIONED">Decommissioned</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="notes">Catatan</label>
                <textarea id="notes" name="notes" rows={2} className="input" defaultValue={editRow?.notes ?? ""} />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary">{editRow ? "Simpan" : "Tambah"}</button>
                {editRow && <Link href="/it/servers" className="btn-secondary">Batal</Link>}
              </div>
            </form>
          </div>
        )}
      </div>
      {servers.some((s) => s.expiryDate && s.expiryDate < new Date()) && (
        <p className="mt-3 text-xs text-red-600">
          Ada server dengan kontrak kedaluwarsa — cek kolom expiry ({formatDateTime(new Date())}).
        </p>
      )}
    </div>
  );
}
