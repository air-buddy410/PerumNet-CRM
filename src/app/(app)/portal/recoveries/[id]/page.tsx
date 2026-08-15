import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  RECOVERY_ATTEMPT_RESULTS,
  recoveryStatusLabel,
  statusLabel,
  formatDateTime,
} from "@/lib/constants";
import { recoveryEvidence, recoverySignatures, RECOVERY_SIGNATURE_ROLES } from "@/lib/device-recovery";
import { PageHeader, BackLink, Badge, EmptyState, Flash } from "@/components/ui";
import { ClientFileUploadGuard } from "@/components/client-file-upload-guard";
import { RecoveryAttemptForm } from "@/components/recovery-attempt-form";
import { RecoveryPickupForm } from "@/components/recovery-pickup-form";
import { RecoveryEvidencePanel, type RecoveryEvidenceItem } from "@/components/recovery-evidence-panel";
import {
  recordAttemptAction,
  pickupDevicesAction,
  confirmDisconnectAction,
  attachEvidenceAction,
  signPickupAction,
} from "@/app/(app)/inventory/device-recoveries/actions";

export const metadata = { title: "Tugas Penarikan" };

export default async function TechnicianRecoveryDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.RECOVERY_PICKUP);
  const { id } = await params;
  const sp = await searchParams;
  const recovery = await db.deviceRecoveryIssue.findFirst({
    where: {
      id,
      OR: [{ assigneeId: user.id }, { workOrder: { technicianId: user.id } }],
    },
    include: {
      termination: {
        include: {
          customer: { select: { name: true, address: true, phone: true } },
          subscription: { select: { serviceNumber: true } },
        },
      },
      workOrder: { select: { woNumber: true, status: true, scheduledAt: true } },
      items: { orderBy: { snapshotSerial: "asc" } },
      attempts: { include: { byUser: { select: { name: true } } }, orderBy: { attemptAt: "desc" } },
    },
  });
  if (!recovery) notFound();

  const [attemptEvidenceRows, itemEvidenceRows, signatures] = await Promise.all([
    Promise.all(recovery.attempts.map(async (attempt) => [attempt.id, await recoveryEvidence("ATTEMPT", attempt.id)] as const)),
    Promise.all(recovery.items.map(async (item) => [item.id, await recoveryEvidence("PICKUP", item.id)] as const)),
    recoverySignatures(recovery.id),
  ]);
  const attemptEvidence = new Map(attemptEvidenceRows);
  const itemEvidence = new Map(itemEvidenceRows);
  const pending = recovery.items.filter((item) => item.status === "RECOVERY_PENDING");
  const isClosed = ["COMPLETED", "CLOSED_UNRECOVERED"].includes(recovery.status);

  return (
    <div className="crm-portal-page max-w-4xl">
      <BackLink href="/portal/recoveries" label="Kembali ke penarikan saya" />
      <PageHeader title={recovery.recoveryNumber} subtitle={`${recovery.termination.customer.name} · ${recovery.termination.subscription.serviceNumber}`} action={<Badge value={recovery.status} label={recoveryStatusLabel(recovery.status)} />} />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <section className="card p-5">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div><dt className="text-xs uppercase tracking-wide text-slate-400">Alamat</dt><dd className="mt-1 text-sm">{recovery.termination.customer.address}</dd></div>
              <div><dt className="text-xs uppercase tracking-wide text-slate-400">Telepon</dt><dd className="mt-1 text-sm">{recovery.termination.customer.phone}</dd></div>
              <div><dt className="text-xs uppercase tracking-wide text-slate-400">Jadwal</dt><dd className="mt-1 text-sm">{recovery.scheduledAt ? formatDateTime(recovery.scheduledAt) : "Belum dijadwalkan"}</dd></div>
              <div><dt className="text-xs uppercase tracking-wide text-slate-400">Batas SLA</dt><dd className="mt-1 text-sm">{recovery.slaDueAt ? formatDateTime(recovery.slaDueAt) : "—"}</dd></div>
              <div><dt className="text-xs uppercase tracking-wide text-slate-400">Work order</dt><dd className="mt-1 text-sm">{recovery.workOrder.woNumber}</dd></div>
              <div><dt className="text-xs uppercase tracking-wide text-slate-400">Pemutusan fisik</dt><dd className="mt-1 text-sm">{recovery.physicalDisconnectedAt ? formatDateTime(recovery.physicalDisconnectedAt) : "Belum dikonfirmasi"}</dd></div>
            </dl>
          </section>

          <section className="card">
            <div className="border-b border-slate-100 px-5 py-4 font-medium">Perangkat ({recovery.items.length})</div>
            {recovery.items.length === 0 ? <EmptyState message="Tidak ada perangkat pada tugas ini." /> : (
              <ul className="divide-y divide-slate-100">
                {recovery.items.map((item) => (
                  <li key={item.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2"><div><strong className="font-mono text-sm">{item.snapshotSerial}</strong><span className="ml-2 text-sm text-slate-500">{item.snapshotItemName}</span></div><Badge value={item.status} label={statusLabel(item.status)} /></div>
                    <p className="mt-2 text-xs text-slate-500">Serial aktual: {item.actualSerial ?? "belum dicatat"} · MAC: {item.actualMac ?? "belum dicatat"}</p>
                    {item.mismatchNote && <p className="mt-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-900">Mismatch: {item.mismatchNote}</p>}
                    <RecoveryEvidencePanel action={attachEvidenceAction} recoveryId={recovery.id} kind="PICKUP" entityId={item.id} title="Bukti penarikan" items={serializeEvidence(itemEvidence.get(item.id) ?? [])} origin="portal" />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="border-b border-slate-100 px-5 py-4 font-medium">Riwayat kunjungan ({recovery.attempts.length})</div>
            {recovery.attempts.length === 0 ? <EmptyState message="Belum ada kunjungan tercatat." /> : (
              <ul className="divide-y divide-slate-100">
                {recovery.attempts.map((attempt) => (
                  <li key={attempt.id} className="px-5 py-4"><div className="flex items-center justify-between gap-3"><strong className="text-sm">{statusLabel(attempt.result)}</strong><time className="text-xs text-slate-400">{formatDateTime(attempt.attemptAt)}</time></div><p className="mt-1 text-xs text-slate-500">{attempt.note || "—"} · {attempt.byUser.name}</p><RecoveryEvidencePanel action={attachEvidenceAction} recoveryId={recovery.id} kind="ATTEMPT" entityId={attempt.id} title="Bukti kunjungan" items={serializeEvidence(attemptEvidence.get(attempt.id) ?? [])} origin="portal" /></li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-5">
          {!isClosed && <section className="card p-5"><h2 className="mb-3 text-sm font-medium">Catat kunjungan</h2><RecoveryAttemptForm action={recordAttemptAction} recoveryId={recovery.id} results={RECOVERY_ATTEMPT_RESULTS} origin="portal" /></section>}
          {!isClosed && pending.length > 0 && <section className="card p-5"><h2 className="mb-3 text-sm font-medium">Tarik perangkat</h2><RecoveryPickupForm action={pickupDevicesAction} recoveryId={recovery.id} items={pending} origin="portal" /></section>}
          {!isClosed && !recovery.physicalDisconnectedAt && <section className="card p-5"><h2 className="mb-2 text-sm font-medium">Konfirmasi pemutusan fisik</h2><p className="mb-3 text-xs text-slate-500">Konfirmasi setelah kabel/perangkat benar-benar dilepas di lokasi pelanggan.</p><form action={confirmDisconnectAction}><input type="hidden" name="recoveryId" value={recovery.id} /><input type="hidden" name="origin" value="portal" /><button type="submit" className="btn-secondary w-full justify-center">Konfirmasi pemutusan</button></form></section>}
          <section className="card p-5"><h2 className="mb-3 text-sm font-medium">Tanda tangan</h2>{signatures.length > 0 && <ul className="mb-4 space-y-2">{signatures.map((signature) => <li key={signature.id} className="rounded bg-slate-50 p-2 text-xs"><strong>{signature.role}: {signature.signerName}</strong><span className="block text-slate-400">{formatDateTime(signature.signedAt)}</span>{signature.attachment && <a href={`/api/files/${signature.attachment.id}`} target="_blank" rel="noreferrer" className="mt-1 inline-block text-brand-600 hover:underline">Buka gambar tanda tangan</a>}</li>)}</ul>}<ClientFileUploadGuard action={signPickupAction} inputName="signatureFile" className="space-y-3"><input type="hidden" name="recoveryId" value={recovery.id} /><input type="hidden" name="origin" value="portal" /><select name="role" className="input" defaultValue="CUSTOMER">{RECOVERY_SIGNATURE_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select><input name="signerName" className="input" placeholder="Nama penanda tangan" required /><label className="label" htmlFor="portal-signature-file">Gambar tanda tangan (opsional)</label><input id="portal-signature-file" name="signatureFile" type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" capture="environment" /><p className="text-xs text-slate-500">Nama tetap wajib. Gambar boleh ditambahkan jika tersedia.</p><button type="submit" className="btn-secondary w-full justify-center">Simpan tanda tangan</button></ClientFileUploadGuard></section>
        </div>
      </div>
    </div>
  );
}

function serializeEvidence(items: Array<{ id: string; filename: string; mimeType: string; createdAt: Date }>): RecoveryEvidenceItem[] {
  return items.map((item) => ({ id: item.id, filename: item.filename, mimeType: item.mimeType, createdAt: item.createdAt.toISOString() }));
}
