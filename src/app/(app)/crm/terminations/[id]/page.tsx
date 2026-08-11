import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, statusLabel, formatDateTime, formatRupiah } from "@/lib/constants";
import { PageHeader, Flash, BackLink, Badge, EmptyState } from "@/components/ui";
import type { TerminationSnapshot } from "@/lib/termination";
import {
  submitTerminationAction,
  syncDecisionAction,
  cancelTerminationAction,
  makeEffectiveAction,
} from "../actions";

export const metadata = { title: "Detail Terminasi" };

export default async function TerminationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.TERMINATION_VIEW);
  const { id } = await params;
  const sp = await searchParams;

  const trm = await db.customerTermination.findUnique({
    where: { id },
    include: {
      customer: true,
      subscription: { include: { package: true } },
      warehouseTo: true,
      createdBy: { select: { name: true } },
      decidedBy: { select: { name: true } },
      recovery: {
        include: {
          items: { include: { device: { include: { item: true } } } },
          workOrder: { select: { id: true, woNumber: true, status: true } },
        },
      },
    },
  });
  if (!trm) notFound();

  const approval = trm.approvalRequestId
    ? await db.approvalRequest.findUnique({
        where: { id: trm.approvalRequestId },
        select: { id: true, requestNumber: true, status: true },
      })
    : null;

  const snapshot = trm.snapshot as unknown as TerminationSnapshot | null;
  const canCreate = user.permissions.has(PERMISSIONS.TERMINATION_CREATE);
  const canCancel = user.permissions.has(PERMISSIONS.TERMINATION_CANCEL);
  const canApprove = user.permissions.has(PERMISSIONS.TERMINATION_APPROVE);

  const excluded = snapshot?.devices.filter((d) => !d.included) ?? [];

  return (
    <div className="max-w-5xl">
      <BackLink href="/crm/terminations" label="Kembali ke daftar terminasi" />
      <PageHeader
        title={trm.terminationNumber}
        subtitle={`${trm.customer.name} · ${trm.subscription.serviceNumber}`}
        action={
          <div className="flex items-center gap-2">
            <Link href={`/crm/terminations/${trm.id}/print`} className="btn-secondary">
              Berita Acara
            </Link>
            <Badge value={trm.status} label={statusLabel(trm.status)} />
          </div>
        }
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <div className="card p-6">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Alasan</dt>
                <dd className="mt-0.5 text-sm">
                  {statusLabel(trm.reasonCategory)} — {trm.reason}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Tanggal berlaku</dt>
                <dd className="mt-0.5 text-sm">{formatDateTime(trm.effectiveDate)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Gudang penerima</dt>
                <dd className="mt-0.5 text-sm">{trm.warehouseTo.name}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Diajukan oleh</dt>
                <dd className="mt-0.5 text-sm">
                  {trm.createdBy.name} · {formatDateTime(trm.createdAt)}
                </dd>
              </div>
              {(trm.decidedBy || trm.decidedAt) && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Keputusan</dt>
                  <dd className="mt-0.5 text-sm">
                    {trm.decidedBy?.name ?? "approver tidak tercatat"} ·{" "}
                    {formatDateTime(trm.decidedAt)}
                  </dd>
                  {trm.decisionNote && (
                    <dd className="mt-0.5 text-xs text-slate-500">“{trm.decisionNote}”</dd>
                  )}
                </div>
              )}
              {trm.cancelReason && (
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Alasan pembatalan</dt>
                  <dd className="mt-0.5 text-sm">{trm.cancelReason}</dd>
                </div>
              )}
            </dl>
          </div>

          {snapshot && (
            <div className="card">
              <div className="border-b border-slate-100 px-5 py-4">
                <div className="font-medium">Snapshot saat pengajuan</div>
                <p className="mt-0.5 text-xs text-slate-500">
                  Direkam {formatDateTime(new Date(snapshot.takenAt))}. Tidak ikut berubah bila
                  master data diperbarui.
                </p>
              </div>
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-400">Layanan</div>
                  <p className="mt-0.5 text-sm">
                    {snapshot.service.package} · {formatRupiah(BigInt(snapshot.service.monthlyPrice))}/bln
                  </p>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-400">Jaringan</div>
                  <p className="mt-0.5 text-sm">
                    {snapshot.network.pppoeUsername ?? "—"}
                    {snapshot.network.odp
                      ? ` · ODP ${snapshot.network.odp}/${snapshot.network.odpPort}`
                      : ""}
                  </p>
                </div>
              </div>

              {snapshot.outstandingInvoices.length > 0 && (
                <div className="border-t border-slate-100 px-5 py-4">
                  <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">
                    Tunggakan saat pengajuan ({snapshot.outstandingInvoices.length})
                  </div>
                  <ul className="space-y-1 text-sm">
                    {snapshot.outstandingInvoices.map((i) => (
                      <li key={i.number} className="flex justify-between gap-3">
                        <span className="font-mono text-xs">{i.number}</span>
                        <span>{formatRupiah(BigInt(i.outstanding))}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {excluded.length > 0 && (
                <div className="border-t border-slate-100 px-5 py-4">
                  <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">
                    Perangkat yang TIDAK ditarik ({excluded.length})
                  </div>
                  <ul className="space-y-1 text-sm">
                    {excluded.map((d) => (
                      <li key={d.serialNumber}>
                        <span className="font-mono text-xs">{d.serialNumber}</span> — {d.excludedReason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="card">
            <div className="border-b border-slate-100 px-5 py-4 font-medium">
              Perangkat yang ditarik ({trm.recovery?.items.length ?? 0})
            </div>
            {!trm.recovery ? (
              <EmptyState message="Daftar penarikan dibuat setelah terminasi disetujui." />
            ) : trm.recovery.items.length === 0 ? (
              <EmptyState message="Tidak ada perangkat milik PERUMNET pada langganan ini." />
            ) : (
              <table className="w-full">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className="th">Serial</th>
                    <th className="th">Item</th>
                    <th className="th">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {trm.recovery.items.map((it) => (
                    <tr key={it.id}>
                      <td className="td font-mono text-xs">{it.snapshotSerial}</td>
                      <td className="td text-sm">{it.snapshotItemName}</td>
                      <td className="td">
                        <Badge value={it.status} label={statusLabel(it.status)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {approval && (
            <div className="card p-5">
              <h2 className="mb-2 text-sm font-medium">Approval</h2>
              <p className="text-sm">
                <Link href={`/approvals/${approval.id}`} className="text-brand-600 hover:underline">
                  {approval.requestNumber}
                </Link>{" "}
                <Badge value={approval.status} label={statusLabel(approval.status)} />
              </p>
              {trm.status === "SUBMITTED" && approval.status !== "PENDING" && (
                <form action={syncDecisionAction} className="mt-3">
                  <input type="hidden" name="id" value={trm.id} />
                  <button type="submit" className="btn-primary w-full justify-center">
                    Terapkan Keputusan
                  </button>
                  <p className="mt-2 text-xs text-slate-500">
                    Menerbitkan surat penarikan, work order, dan mengunci status perangkat dalam
                    satu transaksi.
                  </p>
                </form>
              )}
            </div>
          )}

          {trm.recovery && (
            <div className="card p-5">
              <h2 className="mb-2 text-sm font-medium">Penarikan Perangkat</h2>
              <p className="text-sm">
                <Link
                  href={`/inventory/device-recoveries/${trm.recovery.id}`}
                  className="text-brand-600 hover:underline"
                >
                  {trm.recovery.recoveryNumber}
                </Link>{" "}
                <Badge value={trm.recovery.status} label={statusLabel(trm.recovery.status)} />
              </p>
              <p className="mt-1 text-xs text-slate-500">
                WO{" "}
                <Link
                  href={`/operations/work-orders/${trm.recovery.workOrder.id}`}
                  className="text-brand-600 hover:underline"
                >
                  {trm.recovery.workOrder.woNumber}
                </Link>
              </p>
            </div>
          )}

          {canCreate && trm.status === "DRAFT" && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Ajukan Persetujuan</h2>
              <form action={submitTerminationAction}>
                <input type="hidden" name="id" value={trm.id} />
                <button type="submit" className="btn-primary w-full justify-center">
                  Ajukan ke Management
                </button>
              </form>
            </div>
          )}

          {canApprove && trm.status === "APPROVED" && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Berlakukan Terminasi</h2>
              <p className="mb-3 text-xs text-slate-500">
                Menghentikan layanan: langganan menjadi TERMINATED. Port ODP tetap belum dilepas
                sampai teknisi mengonfirmasi pemutusan fisik.
              </p>
              <form action={makeEffectiveAction}>
                <input type="hidden" name="id" value={trm.id} />
                <button type="submit" className="btn-danger w-full justify-center">
                  Berlakukan Sekarang
                </button>
              </form>
            </div>
          )}

          {canCancel && ["DRAFT", "SUBMITTED", "APPROVED"].includes(trm.status) && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Batalkan</h2>
              <form action={cancelTerminationAction} className="space-y-3">
                <input type="hidden" name="id" value={trm.id} />
                <textarea
                  name="reason"
                  rows={2}
                  className="input"
                  placeholder="Alasan pembatalan (wajib)"
                  required
                />
                <button type="submit" className="btn-secondary w-full justify-center">
                  Batalkan Terminasi
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
