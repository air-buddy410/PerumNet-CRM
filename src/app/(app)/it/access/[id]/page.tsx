import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, ACCESS_TYPES, statusLabel, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, BackLink, Badge } from "@/components/ui";
import { submitAccessRequestAction, grantAccessAction, revokeAccessAction } from "../actions";

export const metadata = { title: "Detail Permintaan Akses" };

export default async function AccessDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.ACCESS_REQUEST);
  const { id } = await params;
  const sp = await searchParams;

  const req = await db.accessRequest.findUnique({
    where: { id },
    include: { targetUser: true, createdBy: true, grantedBy: true, revokedBy: true },
  });
  if (!req) notFound();

  const canManage = user.permissions.has(PERMISSIONS.ACCESS_MANAGE);
  const seesAll = canManage || user.permissions.has(PERMISSIONS.IT_VIEW);
  if (!seesAll && req.createdById !== user.id && req.targetUserId !== user.id) {
    notFound();
  }

  const approval = req.approvalRequestId
    ? await db.approvalRequest.findUnique({ where: { id: req.approvalRequestId } })
    : null;
  const typeLabel = ACCESS_TYPES.find(([v]) => v === req.accessType)?.[1] ?? req.accessType;

  return (
    <div className="max-w-4xl">
      <BackLink href="/it/access" label="Kembali ke access management" />
      <PageHeader
        title={`${req.requestNumber} — ${req.systemName}`}
        subtitle={`${typeLabel} · penerima ${req.targetUser.name} · diminta ${req.createdBy.name}`}
        action={<Badge value={req.status} label={statusLabel(req.status)} />}
      />
      <Flash ok={sp.ok} error={sp.error} />

      {approval && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Approval:{" "}
          <Link href={`/approvals/${approval.id}`} className="font-semibold underline">
            {approval.requestNumber}
          </Link>{" "}
          ({statusLabel(approval.status)})
          {approval.status === "APPROVED" && req.status === "WAITING_APPROVAL"
            ? " — siap diberikan oleh IT."
            : ""}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="card p-6">
          <dl className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Role / Level</dt>
                <dd className="mt-0.5 text-sm">{req.roleRequested}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Sifat</dt>
                <dd className="mt-0.5 text-sm">
                  {req.isProduction ? "Production" : "Non-production"}
                  {req.isTemporary ? " · Sementara" : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Expiry</dt>
                <dd className="mt-0.5 text-sm">{req.expiryDate ? formatDateTime(req.expiryDate) : "-"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Diberikan</dt>
                <dd className="mt-0.5 text-sm">
                  {req.grantedAt ? `${req.grantedBy?.name} · ${formatDateTime(req.grantedAt)}` : "-"}
                </dd>
              </div>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Alasan</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-sm">{req.reason}</dd>
            </div>
            {req.revokedAt && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">
                  Dicabut ({req.revokedBy?.name} · {formatDateTime(req.revokedAt)})
                </dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-sm">{req.revokeReason}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="space-y-6">
          {req.status === "DRAFT" && req.isProduction && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Ajukan Approval</h2>
              <p className="mb-3 text-xs text-slate-500">Akses production wajib disetujui IT Manager (rule 28).</p>
              <form action={submitAccessRequestAction}>
                <input type="hidden" name="requestId" value={req.id} />
                <button type="submit" className="btn-primary w-full justify-center">Ajukan</button>
              </form>
            </div>
          )}

          {canManage && ["DRAFT", "WAITING_APPROVAL"].includes(req.status) && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Berikan Akses</h2>
              {req.isProduction && approval?.status !== "APPROVED" && (
                <p className="mb-3 text-xs text-red-600">Menunggu approval production (rule 28).</p>
              )}
              <form action={grantAccessAction}>
                <input type="hidden" name="requestId" value={req.id} />
                <button type="submit" className="btn-primary w-full justify-center">Grant</button>
              </form>
            </div>
          )}

          {canManage && req.status === "GRANTED" && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Cabut Akses</h2>
              <form action={revokeAccessAction} className="space-y-3">
                <input type="hidden" name="requestId" value={req.id} />
                <textarea name="reason" rows={2} className="input" placeholder="Alasan (wajib)" required />
                <button type="submit" className="btn-danger w-full justify-center">Revoke</button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
