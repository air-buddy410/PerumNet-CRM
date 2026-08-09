import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  MAINTENANCE_TYPES,
  statusLabel,
  formatDateTime,
} from "@/lib/constants";
import { PageHeader, Flash, BackLink, Badge } from "@/components/ui";
import {
  submitMaintenanceAction,
  startMaintenanceAction,
  completeMaintenanceAction,
  cancelMaintenanceAction,
} from "../actions";

export const metadata = { title: "Detail Maintenance" };

export default async function MaintenanceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.NOC_VIEW);
  const { id } = await params;
  const sp = await searchParams;

  const maint = await db.networkMaintenance.findUnique({
    where: { id },
    include: { site: true, device: true, pic: true, createdBy: true },
  });
  if (!maint) notFound();

  const approval = maint.approvalRequestId
    ? await db.approvalRequest.findUnique({ where: { id: maint.approvalRequestId } })
    : null;
  const canManage = user.permissions.has(PERMISSIONS.MAINTENANCE_MANAGE);
  const typeLabel = MAINTENANCE_TYPES.find(([t]) => t === maint.type)?.[1] ?? maint.type;

  return (
    <div className="max-w-3xl">
      <BackLink href="/noc/maintenance" label="Kembali ke daftar maintenance" />
      <PageHeader
        title={`${maint.maintNumber} — ${maint.title}`}
        subtitle={`${typeLabel} · PIC ${maint.pic.name}`}
        action={<Badge value={maint.status} label={statusLabel(maint.status)} />}
      />
      <Flash ok={sp.ok} error={sp.error} />

      {approval && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Approval:{" "}
          <Link href={`/approvals/${approval.id}`} className="font-semibold underline">
            {approval.requestNumber}
          </Link>{" "}
          ({statusLabel(approval.status)})
        </div>
      )}

      <div className="card p-6">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Target</dt>
            <dd className="mt-0.5 text-sm">
              {maint.site?.siteCode ?? "-"} {maint.device ? `· ${maint.device.hostname}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Jadwal</dt>
            <dd className="mt-0.5 text-sm">
              {formatDateTime(maint.scheduledStart)} — {formatDateTime(maint.scheduledEnd)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Estimasi Downtime</dt>
            <dd className="mt-0.5 text-sm">{maint.estDowntimeMin != null ? `${maint.estDowntimeMin} menit` : "-"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Dibuat</dt>
            <dd className="mt-0.5 text-sm">{maint.createdBy.name}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase tracking-wide text-slate-400">Tujuan</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-sm">{maint.purpose}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase tracking-wide text-slate-400">Risiko</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-sm">{maint.risk}</dd>
          </div>
          {maint.result && (
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-slate-400">Hasil</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-sm">{maint.result}</dd>
            </div>
          )}
        </dl>
      </div>

      {canManage && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {maint.status === "DRAFT" && (
            <form action={submitMaintenanceAction} className="card p-5">
              <input type="hidden" name="maintId" value={maint.id} />
              <button type="submit" className="btn-primary w-full justify-center">
                Ajukan Approval
              </button>
            </form>
          )}
          {maint.status === "WAITING_APPROVAL" && approval?.status === "APPROVED" && (
            <form action={startMaintenanceAction} className="card p-5">
              <input type="hidden" name="maintId" value={maint.id} />
              <button type="submit" className="btn-primary w-full justify-center">
                Mulai Maintenance
              </button>
            </form>
          )}
          {maint.status === "IN_PROGRESS" && (
            <form action={completeMaintenanceAction} className="card space-y-3 p-5">
              <input type="hidden" name="maintId" value={maint.id} />
              <textarea name="result" rows={3} className="input" placeholder="Hasil & dokumentasi (wajib)" required />
              <button type="submit" className="btn-primary w-full justify-center">
                Selesai
              </button>
            </form>
          )}
          {!["COMPLETED", "CANCELLED"].includes(maint.status) && (
            <form action={cancelMaintenanceAction} className="card space-y-3 p-5">
              <input type="hidden" name="maintId" value={maint.id} />
              <textarea name="reason" rows={2} className="input" placeholder="Alasan pembatalan (wajib)" required />
              <button type="submit" className="btn-danger w-full justify-center">
                Batalkan
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
