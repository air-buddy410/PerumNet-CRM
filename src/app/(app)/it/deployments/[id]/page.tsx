import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, DEPLOY_ENVS_NEED_APPROVAL, statusLabel, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, BackLink, Badge } from "@/components/ui";
import {
  submitDeploymentAction,
  executeDeploymentAction,
  finishDeploymentAction,
  rollbackDeploymentAction,
  cancelDeploymentAction,
} from "../actions";

export const metadata = { title: "Detail Deployment" };

export default async function DeploymentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.IT_VIEW);
  const { id } = await params;
  const sp = await searchParams;

  const dep = await db.deployment.findUnique({
    where: { id },
    include: { application: true, backup: true, createdBy: true, executedBy: true },
  });
  if (!dep) notFound();

  const approval = dep.approvalRequestId
    ? await db.approvalRequest.findUnique({ where: { id: dep.approvalRequestId } })
    : null;
  const canCreate = user.permissions.has(PERMISSIONS.DEPLOYMENTS_CREATE);
  const canExecute = user.permissions.has(PERMISSIONS.DEPLOYMENTS_EXECUTE);
  const needsApproval = DEPLOY_ENVS_NEED_APPROVAL.includes(dep.environment as never);
  const executable =
    (needsApproval && dep.status === "WAITING_APPROVAL" && approval?.status === "APPROVED") ||
    (!needsApproval && dep.status === "READY");

  return (
    <div className="max-w-4xl">
      <BackLink href="/it/deployments" label="Kembali ke daftar deployment" />
      <PageHeader
        title={`${dep.deployNumber} — ${dep.application.name} v${dep.version}`}
        subtitle={`${statusLabel(dep.environment)}${dep.environment === "PRODUCTION" ? (dep.isMajor ? " (major)" : " (minor)") : ""} · dibuat ${dep.createdBy.name}`}
        action={<Badge value={dep.status} label={statusLabel(dep.status)} />}
      />
      <Flash ok={sp.ok} error={sp.error} />

      {approval && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Approval:{" "}
          <Link href={`/approvals/${approval.id}`} className="font-semibold underline">
            {approval.requestNumber}
          </Link>{" "}
          ({statusLabel(approval.status)})
          {executable ? " — siap dieksekusi." : ""}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="card p-6">
          <dl className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Change Record</dt>
                <dd className="mt-0.5 text-sm">{dep.changeRecord ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Commit / Tag</dt>
                <dd className="mt-0.5 font-mono text-sm">{dep.commitRef ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Migration</dt>
                <dd className="mt-0.5 text-sm">{dep.hasMigration ? (dep.migrationNote ?? "Ya") : "Tidak ada"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Backup Tertaut</dt>
                <dd className="mt-0.5 text-sm">
                  {dep.backup ? (
                    <>
                      {dep.backup.backupNumber}{" "}
                      {dep.backup.verificationResult ? "(terverifikasi)" : "(belum diverifikasi)"}
                    </>
                  ) : (
                    "-"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Window</dt>
                <dd className="mt-0.5 text-sm">
                  {dep.windowStart ? formatDateTime(dep.windowStart) : "-"} —{" "}
                  {dep.windowEnd ? formatDateTime(dep.windowEnd) : "-"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Eksekusi</dt>
                <dd className="mt-0.5 text-sm">
                  {dep.executedBy
                    ? `${dep.executedBy.name} · ${dep.startedAt ? formatDateTime(dep.startedAt) : ""}${dep.finishedAt ? ` — ${formatDateTime(dep.finishedAt)}` : ""}`
                    : "-"}
                </dd>
              </div>
            </div>
            {dep.releaseNote && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Release Note</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-sm">{dep.releaseNote}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Deployment Plan</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-sm">{dep.deploymentPlan}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Hasil Testing</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-sm">{dep.testingResult ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Rollback Plan</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-sm">{dep.rollbackPlan ?? "-"}</dd>
            </div>
            {dep.result && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Hasil</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-sm">{dep.result}</dd>
              </div>
            )}
            {dep.rollbackNote && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Catatan Rollback</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-sm">{dep.rollbackNote}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="space-y-6">
          {dep.status === "DRAFT" && canCreate && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Ajukan</h2>
              <p className="mb-3 text-xs text-slate-500">
                {needsApproval
                  ? "Diajukan ke approval matrix deployment (§48)."
                  : "Development/Testing tidak perlu approval — langsung siap dieksekusi."}
              </p>
              <form action={submitDeploymentAction}>
                <input type="hidden" name="deploymentId" value={dep.id} />
                <button type="submit" className="btn-primary w-full justify-center">Ajukan</button>
              </form>
            </div>
          )}

          {executable && canExecute && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Mulai Eksekusi</h2>
              <form action={executeDeploymentAction}>
                <input type="hidden" name="deploymentId" value={dep.id} />
                <button type="submit" className="btn-primary w-full justify-center">Mulai Deployment</button>
              </form>
            </div>
          )}

          {dep.status === "IN_PROGRESS" && canExecute && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Catat Hasil</h2>
              <form action={finishDeploymentAction} className="space-y-3">
                <input type="hidden" name="deploymentId" value={dep.id} />
                <textarea name="result" rows={3} className="input" placeholder="Hasil deployment & verifikasi (wajib)" required />
                <select name="outcome" className="input" defaultValue="success">
                  <option value="success">Berhasil</option>
                  <option value="failed">Gagal</option>
                </select>
                <button type="submit" className="btn-primary w-full justify-center">Simpan Hasil</button>
              </form>
            </div>
          )}

          {["IN_PROGRESS", "COMPLETED", "FAILED"].includes(dep.status) && canExecute && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Rollback</h2>
              <form action={rollbackDeploymentAction} className="space-y-3">
                <input type="hidden" name="deploymentId" value={dep.id} />
                <textarea name="note" rows={2} className="input" placeholder="Catatan rollback (wajib)" required />
                <button type="submit" className="btn-danger w-full justify-center">Catat Rollback</button>
              </form>
            </div>
          )}

          {["DRAFT", "WAITING_APPROVAL", "READY"].includes(dep.status) && canCreate && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Batalkan</h2>
              <form action={cancelDeploymentAction} className="space-y-3">
                <input type="hidden" name="deploymentId" value={dep.id} />
                <textarea name="reason" rows={2} className="input" placeholder="Alasan (wajib)" required />
                <button type="submit" className="btn-danger w-full justify-center">Batalkan</button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
