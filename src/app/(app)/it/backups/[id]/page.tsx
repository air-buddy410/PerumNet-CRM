import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, BACKUP_TYPES, statusLabel, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, BackLink, Badge } from "@/components/ui";
import { verifyBackupAction, restoreTestAction } from "../actions";

export const metadata = { title: "Detail Backup" };

export default async function BackupDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.IT_VIEW);
  const { id } = await params;
  const sp = await searchParams;

  const backup = await db.backupRecord.findUnique({
    where: { id },
    include: { server: true, application: true, verifiedBy: true, createdBy: true },
  });
  if (!backup) notFound();

  const canManage = user.permissions.has(PERMISSIONS.BACKUPS_MANAGE);
  const typeLabel = BACKUP_TYPES.find(([v]) => v === backup.backupType)?.[1] ?? backup.backupType;

  return (
    <div className="max-w-4xl">
      <BackLink href="/it/backups" label="Kembali ke daftar backup" />
      <PageHeader
        title={`${backup.backupNumber} — ${backup.application?.name ?? backup.server?.hostname}`}
        subtitle={`${typeLabel} · ${formatDateTime(backup.executedAt)} · dicatat ${backup.createdBy.name}`}
        action={<Badge value={backup.status} label={statusLabel(backup.status)} />}
      />
      <Flash ok={sp.ok} error={sp.error} />

      {backup.isCritical && !backup.verificationResult && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Backup kritikal belum diverifikasi (rule 27) — tidak bisa dipakai untuk production deployment.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="card p-6">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Lokasi</dt>
              <dd className="mt-0.5 text-sm">{backup.location}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Retention</dt>
              <dd className="mt-0.5 text-sm">{backup.retention}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Jadwal</dt>
              <dd className="mt-0.5 text-sm">{backup.schedule ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Enkripsi / Kritikal</dt>
              <dd className="mt-0.5 text-sm">
                {backup.isEncrypted ? "Terenkripsi" : "Tidak terenkripsi"} · {backup.isCritical ? "Kritikal" : "Non-kritikal"}
              </dd>
            </div>
            {backup.failureNote && (
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-slate-400">Penyebab Gagal</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-sm">{backup.failureNote}</dd>
              </div>
            )}
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-slate-400">Verifikasi (rule 27)</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-sm">
                {backup.verificationResult
                  ? `${backup.verificationResult} — ${backup.verifiedBy?.name} · ${backup.verifiedAt ? formatDateTime(backup.verifiedAt) : ""}`
                  : "Belum diverifikasi"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-slate-400">Restore Test (§44)</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-sm">
                {backup.restoreTestResult
                  ? `${backup.restoreTestResult} · ${backup.restoreTestAt ? formatDateTime(backup.restoreTestAt) : ""}`
                  : "Belum pernah restore test"}
              </dd>
            </div>
          </dl>
        </div>

        {canManage && backup.status === "SUCCESS" && (
          <div className="space-y-6">
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Verifikasi Backup</h2>
              <form action={verifyBackupAction} className="space-y-3">
                <input type="hidden" name="backupId" value={backup.id} />
                <textarea name="result" rows={2} className="input" placeholder="Hasil verifikasi (wajib)" required />
                <button type="submit" className="btn-primary w-full justify-center">Verifikasi</button>
              </form>
            </div>
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Restore Test</h2>
              <form action={restoreTestAction} className="space-y-3">
                <input type="hidden" name="backupId" value={backup.id} />
                <textarea name="result" rows={2} className="input" placeholder="Hasil restore test (wajib)" required />
                <button type="submit" className="btn-secondary w-full justify-center">Catat Restore Test</button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
