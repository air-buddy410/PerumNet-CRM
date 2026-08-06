import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  APPROVAL_MODULES,
  formatRupiah,
  formatDateTime,
} from "@/lib/constants";
import { PageHeader, Flash, Badge, BackLink } from "@/components/ui";
import { isEligibleApprover, stepApproverLabel } from "@/lib/approval";
import { actOnApprovalAction, cancelApprovalAction } from "../actions";

export const metadata = { title: "Detail Approval" };

export default async function ApprovalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.APPROVALS_VIEW);
  const { id } = await params;
  const sp = await searchParams;

  const request = await db.approvalRequest.findUnique({
    where: { id },
    include: {
      requestedBy: { include: { division: true } },
      rule: true,
      steps: {
        include: { role: true, division: true, actedBy: true },
        orderBy: { stepOrder: "asc" },
      },
    },
  });
  if (!request) notFound();

  const moduleName =
    APPROVAL_MODULES.find((m) => m.code === request.module)?.name ?? request.module;
  const currentStep = request.steps.find((s) => s.stepOrder === request.currentStep);
  const alreadyActed = request.steps.some((s) => s.actedById === user.id);
  const canAct =
    request.status === "PENDING" &&
    currentStep?.status === "PENDING" &&
    isEligibleApprover(user, currentStep) &&
    request.requestedById !== user.id &&
    !alreadyActed &&
    user.permissions.has(PERMISSIONS.APPROVALS_ACT);
  const canCancel =
    request.status === "PENDING" && request.requestedById === user.id;

  return (
    <div className="max-w-3xl">
      <BackLink href="/approvals" label="Kembali ke daftar" />
      <PageHeader
        title={request.title}
        subtitle={`${request.requestNumber} · ${moduleName}${request.subtype ? ` — ${request.subtype}` : ""}`}
        action={<Badge value={request.status} />}
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="card mb-6 p-6">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Pengaju</dt>
            <dd className="mt-0.5 text-sm">
              {request.requestedBy.name}
              {request.requestedBy.division
                ? ` — ${request.requestedBy.division.name}`
                : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Tanggal</dt>
            <dd className="mt-0.5 text-sm">{formatDateTime(request.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Nilai</dt>
            <dd className="mt-0.5 text-sm">{formatRupiah(request.amount)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">
              Rule yang diterapkan
            </dt>
            <dd className="mt-0.5 text-sm">{request.rule.name}</dd>
          </div>
          {request.description && (
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-slate-400">Deskripsi</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-sm">{request.description}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="card mb-6">
        <div className="border-b border-slate-100 px-5 py-4 font-medium">
          Alur Persetujuan
        </div>
        <ol className="divide-y divide-slate-100">
          {request.steps.map((step) => {
            const isCurrent =
              request.status === "PENDING" && step.stepOrder === request.currentStep;
            return (
              <li key={step.id} className="flex items-center gap-4 px-5 py-4">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    step.status === "APPROVED"
                      ? "bg-emerald-100 text-emerald-700"
                      : step.status === "REJECTED"
                        ? "bg-red-100 text-red-700"
                        : isCurrent
                          ? "bg-amber-100 text-amber-700"
                          : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {step.stepOrder}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{stepApproverLabel(step)}</div>
                  <div className="text-xs text-slate-500">
                    {step.status === "PENDING"
                      ? isCurrent
                        ? "Menunggu keputusan"
                        : "Menunggu step sebelumnya"
                      : `${step.status === "APPROVED" ? "Disetujui" : "Ditolak"} oleh ${step.actedBy?.name ?? "-"} · ${formatDateTime(step.actedAt)}`}
                    {step.note ? ` — "${step.note}"` : ""}
                  </div>
                </div>
                <Badge value={step.status} />
              </li>
            );
          })}
        </ol>
      </div>

      {canAct && (
        <form action={actOnApprovalAction} className="card space-y-4 p-6">
          <input type="hidden" name="requestId" value={request.id} />
          <div>
            <label className="label" htmlFor="note">
              Catatan (opsional)
            </label>
            <textarea id="note" name="note" rows={2} className="input" />
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              name="decision"
              value="APPROVE"
              className="btn-primary"
            >
              Setujui
            </button>
            <button type="submit" name="decision" value="REJECT" className="btn-danger">
              Tolak
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Keputusan Anda tercatat permanen di audit log.
          </p>
        </form>
      )}

      {canCancel && (
        <form action={cancelApprovalAction} className="mt-2">
          <input type="hidden" name="requestId" value={request.id} />
          <button type="submit" className="btn-secondary">
            Batalkan Pengajuan
          </button>
        </form>
      )}
    </div>
  );
}
