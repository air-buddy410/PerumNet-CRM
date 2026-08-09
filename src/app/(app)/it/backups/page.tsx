import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, BACKUP_TYPES, statusLabel, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { createBackupAction } from "./actions";

export const metadata = { title: "Backup & DR" };

export default async function BackupsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.IT_VIEW);
  const sp = await searchParams;
  const canManage = user.permissions.has(PERMISSIONS.BACKUPS_MANAGE);

  const [backups, servers, apps] = await Promise.all([
    db.backupRecord.findMany({
      include: { server: true, application: true, verifiedBy: true },
      orderBy: { executedAt: "desc" },
      take: 200,
    }),
    db.server.findMany({ where: { status: "ACTIVE" }, orderBy: { hostname: "asc" } }),
    db.application.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } }),
  ]);
  const typeLabel = (t: string) => BACKUP_TYPES.find(([v]) => v === t)?.[1] ?? t;

  return (
    <div>
      <PageHeader
        title="Backup & Disaster Recovery"
        subtitle="Backup wajib retention & lokasi; target production wajib terenkripsi; backup kritikal wajib diverifikasi (PRD §44, rule 27)."
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className={`grid gap-6 ${canManage ? "lg:grid-cols-[1fr_22rem]" : ""}`}>
        <div className="card overflow-x-auto">
          {backups.length === 0 ? (
            <EmptyState message="Belum ada catatan backup." />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th">Nomor</th>
                  <th className="th">Target</th>
                  <th className="th">Jenis</th>
                  <th className="th">Waktu</th>
                  <th className="th">Enkripsi</th>
                  <th className="th">Kritikal</th>
                  <th className="th">Verifikasi</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {backups.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="td font-mono text-xs">
                      <Link href={`/it/backups/${b.id}`} className="text-brand-600 hover:underline">
                        {b.backupNumber}
                      </Link>
                    </td>
                    <td className="td text-xs">
                      {b.application?.name ?? b.server?.hostname ?? "-"}
                    </td>
                    <td className="td text-xs">{typeLabel(b.backupType)}</td>
                    <td className="td text-xs">{formatDateTime(b.executedAt)}</td>
                    <td className="td text-xs">{b.isEncrypted ? "Ya" : "-"}</td>
                    <td className="td text-xs">
                      {b.isCritical ? (
                        <span className={b.verificationResult ? "" : "font-medium text-red-600"}>
                          Ya{b.verificationResult ? "" : " (belum diverifikasi!)"}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="td text-xs">{b.verificationResult ? `✓ ${b.verifiedBy?.name}` : "-"}</td>
                    <td className="td"><Badge value={b.status} label={statusLabel(b.status)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {canManage && (
          <div className="card h-fit p-5">
            <h2 className="mb-4 font-medium">Catat Backup</h2>
            <form action={createBackupAction} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="serverId">Server</label>
                  <select id="serverId" name="serverId" className="input" defaultValue="">
                    <option value="">— pilih —</option>
                    {servers.map((s) => (
                      <option key={s.id} value={s.id}>{s.hostname}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="applicationId">Aplikasi</label>
                  <select id="applicationId" name="applicationId" className="input" defaultValue="">
                    <option value="">— pilih —</option>
                    {apps.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="backupType">Jenis</label>
                  <select id="backupType" name="backupType" className="input" required defaultValue="">
                    <option value="" disabled>— pilih —</option>
                    {BACKUP_TYPES.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="status">Hasil</label>
                  <select id="status" name="status" className="input" defaultValue="SUCCESS">
                    <option value="SUCCESS">Sukses</option>
                    <option value="FAILED">Gagal</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="location">Lokasi (wajib)</label>
                <input id="location" name="location" className="input" required placeholder="mis. S3 sgp1/backup-db" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="retention">Retention (wajib)</label>
                  <input id="retention" name="retention" className="input" required placeholder="mis. 30 hari" />
                </div>
                <div>
                  <label className="label" htmlFor="schedule">Jadwal</label>
                  <input id="schedule" name="schedule" className="input" placeholder="mis. harian 02:00" />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="executedAt">Waktu Backup</label>
                <input id="executedAt" name="executedAt" type="datetime-local" className="input" required />
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isEncrypted" className="h-4 w-4" />
                  Terenkripsi
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isCritical" className="h-4 w-4" />
                  Kritikal
                </label>
              </div>
              <div>
                <label className="label" htmlFor="failureNote">Penyebab Gagal (wajib bila gagal)</label>
                <input id="failureNote" name="failureNote" className="input" />
              </div>
              <button type="submit" className="btn-primary">Catat</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
