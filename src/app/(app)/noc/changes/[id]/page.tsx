import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, statusLabel, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, BackLink, Badge } from "@/components/ui";
import {
  submitChangeAction,
  implementChangeAction,
  postReviewChangeAction,
  cancelChangeAction,
} from "../actions";

export const metadata = { title: "Detail Change" };

export default async function ChangeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.NOC_VIEW);
  const { id } = await params;
  const sp = await searchParams;

  const change = await db.changeRequest.findUnique({
    where: { id },
    include: { pic: true, createdBy: true, executedBy: true, postReviewedBy: true },
  });
  if (!change) notFound();

  const approval = change.approvalRequestId
    ? await db.approvalRequest.findUnique({ where: { id: change.approvalRequestId } })
    : null;
  const canCreate = user.permissions.has(PERMISSIONS.CHANGES_CREATE);
  const canImplement = user.permissions.has(PERMISSIONS.CHANGES_IMPLEMENT);
  const canReview = user.permissions.has(PERMISSIONS.CHANGES_REVIEW);

  return (
    <div className="max-w-4xl">
      <BackLink href="/noc/changes" label="Kembali ke daftar change" />
      <PageHeader
        title={`${change.changeNumber} — ${change.title}`}
        subtitle={`${statusLabel(change.changeType)} · PIC ${change.pic.name} · dibuat ${change.createdBy.name}`}
        action={<Badge value={change.status} label={statusLabel(change.status)} />}
      />
      <Flash ok={sp.ok} error={sp.error} />

      {approval && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Approval:{" "}
          <Link href={`/approvals/${approval.id}`} className="font-semibold underline">
            {approval.requestNumber}
          </Link>{" "}
          ({statusLabel(approval.status)})
          {approval.status === "APPROVED" && change.status === "WAITING_APPROVAL"
            ? " — siap dieksekusi."
            : ""}
        </div>
      )}
      {change.status === "PENDING_REVIEW" && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Emergency change telah dieksekusi — wajib post-review NOC Manager (rule 23).
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="card p-6">
          <dl className="grid gap-4">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Tujuan & Alasan</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-sm">{change.reason}</dd>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Perangkat Terdampak</dt>
                <dd className="mt-0.5 text-sm">{change.impactedDevices ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Layanan Terdampak</dt>
                <dd className="mt-0.5 text-sm">{change.impactedServices ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Window</dt>
                <dd className="mt-0.5 text-sm">
                  {change.windowStart ? formatDateTime(change.windowStart) : "-"} —{" "}
                  {change.windowEnd ? formatDateTime(change.windowEnd) : "-"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Dieksekusi</dt>
                <dd className="mt-0.5 text-sm">
                  {change.implementedAt
                    ? `${change.executedBy?.name} · ${formatDateTime(change.implementedAt)}`
                    : "-"}
                </dd>
              </div>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Risiko</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-sm">{change.risk}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Implementation Plan</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-sm">{change.implementationPlan}</dd>
            </div>
            {change.testPlan && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Test Plan</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-sm">{change.testPlan}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Rollback Plan</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-sm">{change.rollbackPlan ?? "— (standard change)"}</dd>
            </div>
            {change.result && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Hasil Pelaksanaan</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-sm">{change.result}</dd>
              </div>
            )}
            {change.postReviewNote && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">
                  Post-Review ({change.postReviewedBy?.name})
                </dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-sm">{change.postReviewNote}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="space-y-6">
          {change.status === "DRAFT" && canCreate && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Ajukan Approval</h2>
              <form action={submitChangeAction}>
                <input type="hidden" name="changeId" value={change.id} />
                <button type="submit" className="btn-primary w-full justify-center">
                  Ajukan
                </button>
              </form>
            </div>
          )}

          {change.status === "WAITING_APPROVAL" && approval?.status === "APPROVED" && canImplement && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Eksekusi Change</h2>
              <form action={implementChangeAction} className="space-y-3">
                <input type="hidden" name="changeId" value={change.id} />
                <textarea name="result" rows={3} className="input" placeholder="Hasil pelaksanaan & evidence (wajib)" required />
                <select name="outcome" className="input" defaultValue="success">
                  <option value="success">Berhasil sesuai plan</option>
                  <option value="failed">Gagal — rollback dijalankan</option>
                </select>
                <button type="submit" className="btn-primary w-full justify-center">
                  Catat Eksekusi
                </button>
              </form>
            </div>
          )}

          {change.status === "PENDING_REVIEW" && canReview && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Post-Review (Emergency)</h2>
              <form action={postReviewChangeAction} className="space-y-3">
                <input type="hidden" name="changeId" value={change.id} />
                <textarea name="note" rows={3} className="input" placeholder="Catatan review (wajib)" required />
                <select name="finalOutcome" className="input" defaultValue="success">
                  <option value="success">Diterima — change berhasil</option>
                  <option value="failed">Dinyatakan gagal</option>
                </select>
                <button type="submit" className="btn-primary w-full justify-center">
                  Simpan Review
                </button>
              </form>
            </div>
          )}

          {["DRAFT", "WAITING_APPROVAL"].includes(change.status) && canCreate && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Batalkan</h2>
              <form action={cancelChangeAction} className="space-y-3">
                <input type="hidden" name="changeId" value={change.id} />
                <textarea name="reason" rows={2} className="input" placeholder="Alasan (wajib)" required />
                <button type="submit" className="btn-danger w-full justify-center">
                  Batalkan Change
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
