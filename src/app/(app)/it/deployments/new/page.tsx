import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, DEPLOY_ENVIRONMENTS, statusLabel, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, BackLink } from "@/components/ui";
import { createDeploymentAction } from "../actions";

export const metadata = { title: "Deployment Baru" };

export default async function NewDeploymentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePermission(PERMISSIONS.DEPLOYMENTS_CREATE);
  const sp = await searchParams;
  const [apps, backups] = await Promise.all([
    db.application.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } }),
    db.backupRecord.findMany({
      where: { status: "SUCCESS" },
      include: { application: true, server: true },
      orderBy: { executedAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <div className="max-w-2xl">
      <BackLink href="/it/deployments" label="Kembali ke daftar deployment" />
      <PageHeader
        title="Deployment Baru"
        subtitle="Production: change record, rollback plan, hasil testing, backup terverifikasi, dan maintenance window wajib sebelum diajukan (§42)."
      />
      <Flash error={sp.error} />

      <form action={createDeploymentAction} className="card space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="applicationId">Aplikasi</label>
            <select id="applicationId" name="applicationId" className="input" required defaultValue="">
              <option value="" disabled>— pilih —</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="version">Versi</label>
            <input id="version" name="version" className="input" required placeholder="mis. 2.4.1" />
          </div>
          <div>
            <label className="label" htmlFor="environment">Environment</label>
            <select id="environment" name="environment" className="input" required defaultValue="">
              <option value="" disabled>— pilih —</option>
              {DEPLOY_ENVIRONMENTS.map((e) => (
                <option key={e} value={e}>{statusLabel(e)}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col justify-end gap-2 pb-1">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isMajor" className="h-4 w-4" />
              Major release (production)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="hasMigration" className="h-4 w-4" />
              Ada database migration
            </label>
          </div>
          <div>
            <label className="label" htmlFor="commitRef">Commit / Tag</label>
            <input id="commitRef" name="commitRef" className="input" placeholder="mis. v2.4.1 / abc1234" />
          </div>
          <div>
            <label className="label" htmlFor="changeRecord">Change Record (wajib untuk production — rule 24)</label>
            <input id="changeRecord" name="changeRecord" className="input" placeholder="nomor/tautan change" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="migrationNote">Detail Migration (wajib bila ada migration)</label>
          <input id="migrationNote" name="migrationNote" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="releaseNote">Release Note</label>
          <textarea id="releaseNote" name="releaseNote" rows={2} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="deploymentPlan">Deployment Plan (wajib)</label>
          <textarea id="deploymentPlan" name="deploymentPlan" rows={3} className="input" required />
        </div>
        <div>
          <label className="label" htmlFor="testingResult">Hasil Testing (wajib untuk production)</label>
          <textarea id="testingResult" name="testingResult" rows={2} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="rollbackPlan">Rollback Plan (wajib untuk production — rule 25)</label>
          <textarea id="rollbackPlan" name="rollbackPlan" rows={2} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="backupId">Backup Tertaut (wajib untuk production — SUCCESS & terverifikasi)</label>
          <select id="backupId" name="backupId" className="input" defaultValue="">
            <option value="">— pilih —</option>
            {backups.map((b) => (
              <option key={b.id} value={b.id}>
                {b.backupNumber} · {b.application?.name ?? b.server?.hostname} · {formatDateTime(b.executedAt)}
                {b.verificationResult ? " ✓" : " (belum diverifikasi)"}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="windowStart">Maintenance Window Mulai</label>
            <input id="windowStart" name="windowStart" type="datetime-local" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="windowEnd">Maintenance Window Selesai</label>
            <input id="windowEnd" name="windowEnd" type="datetime-local" className="input" />
          </div>
        </div>
        <button type="submit" className="btn-primary">Buat Draft</button>
      </form>
    </div>
  );
}
