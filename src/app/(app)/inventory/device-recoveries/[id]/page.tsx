import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  RECOVERY_ATTEMPT_RESULTS,
  INSPECTION_DECISIONS,
  INSPECTION_CHECKLIST,
  statusLabel,
  recoveryStatusLabel,
  formatDateTime,
} from "@/lib/constants";
import { notReturnedBlocker } from "@/lib/recovery";
import { PageHeader, Flash, BackLink, Badge, EmptyState } from "@/components/ui";
import {
  assignRecoveryAction,
  recordAttemptAction,
  pickupDevicesAction,
  confirmDisconnectAction,
  receiveDevicesAction,
  inspectDeviceAction,
  markNotReturnedAction,
} from "../actions";

export const metadata = { title: "Detail Penarikan" };

export default async function RecoveryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  const { id } = await params;
  const sp = await searchParams;

  const dri = await db.deviceRecoveryIssue.findUnique({
    where: { id },
    include: {
      termination: {
        include: {
          customer: true,
          subscription: { select: { id: true, serviceNumber: true } },
        },
      },
      warehouseTo: true,
      assignee: { select: { name: true } },
      workOrder: { select: { id: true, woNumber: true, status: true } },
      items: {
        include: {
          device: { include: { item: { select: { name: true } } } },
          inspection: { include: { inspector: { select: { name: true } } } },
        },
        orderBy: { snapshotSerial: "asc" },
      },
      attempts: { include: { byUser: { select: { name: true } } }, orderBy: { attemptAt: "desc" } },
    },
  });
  if (!dri) notFound();

  const setting = await db.deviceRecoverySetting.findFirst({ where: { isActive: true } });
  const technicians = await db.user.findMany({
    where: { isActive: true, roles: { some: { role: { code: "technician" } } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const can = (p: string) => user.permissions.has(p);
  const isClosed = ["COMPLETED", "CLOSED_UNRECOVERED"].includes(dri.status);

  const pending = dri.items.filter((i) => i.status === "RECOVERY_PENDING");
  const pickedUp = dri.items.filter((i) => i.status === "PICKED_UP");
  const received = dri.items.filter((i) => i.status === "RECEIVED");

  const escalationBlocker = notReturnedBlocker({
    slaDueAt: dri.slaDueAt,
    attempts: dri.attempts.length,
    minAttempts: setting?.minAttempts ?? 3,
    now: new Date(),
  });

  return (
    <div className="max-w-5xl">
      <BackLink href="/inventory/device-recoveries" label="Kembali ke daftar penarikan" />
      <PageHeader
        title={dri.recoveryNumber}
        subtitle={`${dri.termination.customer.name} · ${dri.termination.subscription.serviceNumber}`}
        action={<Badge value={dri.status} label={recoveryStatusLabel(dri.status)} />}
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <div className="card p-6">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Alamat penarikan</dt>
                <dd className="mt-0.5 text-sm">{dri.termination.customer.address}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Teknisi</dt>
                <dd className="mt-0.5 text-sm">{dri.assignee?.name ?? "belum ditugaskan"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Gudang tujuan</dt>
                <dd className="mt-0.5 text-sm">{dri.warehouseTo.name}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Batas SLA</dt>
                <dd className="mt-0.5 text-sm">
                  {dri.slaDueAt ? formatDateTime(dri.slaDueAt) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Pemutusan fisik</dt>
                <dd className="mt-0.5 text-sm">
                  {dri.physicalDisconnectedAt
                    ? formatDateTime(dri.physicalDisconnectedAt)
                    : "belum dikonfirmasi — port ODP masih terpakai"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Dokumen</dt>
                <dd className="mt-0.5 text-sm">
                  <Link
                    href={`/crm/terminations/${dri.terminationId}`}
                    className="text-brand-600 hover:underline"
                  >
                    {dri.termination.terminationNumber}
                  </Link>
                  {" · "}
                  <Link
                    href={`/operations/work-orders/${dri.workOrder.id}`}
                    className="text-brand-600 hover:underline"
                  >
                    {dri.workOrder.woNumber}
                  </Link>
                </dd>
              </div>
            </dl>
          </div>

          <div className="card">
            <div className="border-b border-slate-100 px-5 py-4 font-medium">
              Perangkat ({dri.items.length})
            </div>
            {dri.items.length === 0 ? (
              <EmptyState message="Tidak ada perangkat pada penarikan ini." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {dri.items.map((it) => (
                  <li key={it.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-mono text-sm font-semibold">{it.snapshotSerial}</span>
                        <span className="ml-2 text-sm text-slate-500">{it.snapshotItemName}</span>
                      </div>
                      <Badge value={it.status} label={statusLabel(it.status)} />
                    </div>
                    {it.actualSerial && it.actualSerial !== it.snapshotSerial && (
                      <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">
                        Serial di lapangan <strong>{it.actualSerial}</strong> berbeda dari catatan —{" "}
                        {it.mismatchNote}
                      </p>
                    )}
                    {it.finalDecision && (
                      <p className="mt-1 text-xs text-slate-500">
                        Keputusan: {statusLabel(it.finalDecision)}
                        {it.inspection ? ` · ${it.inspection.inspector.name}` : ""}
                        {it.notReturnedNote ? ` — ${it.notReturnedNote}` : ""}
                      </p>
                    )}

                    {can(PERMISSIONS.RECOVERY_INSPECT) && it.status === "RECEIVED" && (
                      <details className="mt-3 rounded-lg border border-slate-200 p-3">
                        <summary className="cursor-pointer text-sm font-medium">
                          Inspeksi perangkat ini
                        </summary>
                        <form action={inspectDeviceAction} className="mt-3 space-y-3">
                          <input type="hidden" name="recoveryId" value={dri.id} />
                          <input type="hidden" name="itemId" value={it.id} />
                          <div className="grid gap-1 sm:grid-cols-2">
                            {INSPECTION_CHECKLIST.map(([key, label]) => (
                              <label key={key} className="flex items-center gap-2 text-sm">
                                <input type="checkbox" name={`chk_${key}`} className="rounded" />
                                {label}
                              </label>
                            ))}
                          </div>
                          <select name="decision" className="input" defaultValue="LAYAK_DIGUNAKAN">
                            {INSPECTION_DECISIONS.map((d) => (
                              <option key={d} value={d}>{statusLabel(d)}</option>
                            ))}
                          </select>
                          <textarea
                            name="note"
                            rows={2}
                            className="input"
                            placeholder="Catatan inspeksi (wajib)"
                            required
                          />
                          <p className="text-xs text-slate-500">
                            Hanya keputusan <strong>Layak Digunakan</strong> yang mengembalikan
                            barang ke stok tersedia, dan selalu sebagai barang SECOND.
                          </p>
                          <button type="submit" className="btn-primary w-full justify-center">
                            Simpan Keputusan
                          </button>
                        </form>
                      </details>
                    )}

                    {can(PERMISSIONS.RECOVERY_ESCALATE) && it.status === "RECOVERY_PENDING" && (
                      <details className="mt-3 rounded-lg border border-slate-200 p-3">
                        <summary className="cursor-pointer text-sm font-medium">
                          Nyatakan tidak kembali
                        </summary>
                        {escalationBlocker ? (
                          <p className="mt-2 text-xs text-slate-500">{escalationBlocker}</p>
                        ) : (
                          <form action={markNotReturnedAction} className="mt-3 space-y-2">
                            <input type="hidden" name="recoveryId" value={dri.id} />
                            <input type="hidden" name="itemId" value={it.id} />
                            <textarea
                              name="note"
                              rows={2}
                              className="input"
                              placeholder="Keterangan eskalasi (wajib)"
                              required
                            />
                            <button type="submit" className="btn-danger w-full justify-center">
                              Nyatakan Tidak Kembali
                            </button>
                          </form>
                        )}
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <div className="border-b border-slate-100 px-5 py-4 font-medium">
              Riwayat Kunjungan ({dri.attempts.length})
            </div>
            {dri.attempts.length === 0 ? (
              <EmptyState message="Belum ada kunjungan tercatat." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {dri.attempts.map((a) => (
                  <li key={a.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold">{statusLabel(a.result)}</span>
                      <span className="text-xs text-slate-400">{formatDateTime(a.attemptAt)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {a.note || "-"} · oleh {a.byUser.name}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {can(PERMISSIONS.RECOVERY_ASSIGN) && ["OPEN", "ASSIGNED"].includes(dri.status) && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Tugaskan Teknisi</h2>
              <form action={assignRecoveryAction} className="space-y-3">
                <input type="hidden" name="recoveryId" value={dri.id} />
                <select name="technicianId" className="input" required defaultValue={dri.assigneeId ?? ""}>
                  <option value="">— pilih teknisi —</option>
                  {technicians.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <input type="datetime-local" name="scheduledAt" className="input" />
                <button type="submit" className="btn-primary w-full justify-center">
                  Tugaskan
                </button>
              </form>
            </div>
          )}

          {can(PERMISSIONS.RECOVERY_PICKUP) && !isClosed && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Catat Kunjungan</h2>
              <form action={recordAttemptAction} className="space-y-3">
                <input type="hidden" name="recoveryId" value={dri.id} />
                <select name="result" className="input" defaultValue="TIDAK_DI_TEMPAT">
                  {RECOVERY_ATTEMPT_RESULTS.map(([code, label]) => (
                    <option key={code} value={code}>{label}</option>
                  ))}
                </select>
                <textarea name="note" rows={2} className="input" placeholder="Keterangan" />
                <button type="submit" className="btn-secondary w-full justify-center">
                  Simpan Kunjungan
                </button>
              </form>
            </div>
          )}

          {can(PERMISSIONS.RECOVERY_PICKUP) && pending.length > 0 && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Tarik Perangkat</h2>
              <form action={pickupDevicesAction} className="space-y-4">
                <input type="hidden" name="recoveryId" value={dri.id} />
                {pending.map((it) => (
                  <div key={it.id} className="rounded-lg border border-slate-200 p-3">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input type="checkbox" name="pick" value={it.id} className="rounded" />
                      {it.snapshotSerial}
                    </label>
                    <input
                      name={`serial_${it.id}`}
                      className="input mt-2 text-xs"
                      defaultValue={it.snapshotSerial}
                      placeholder="Serial yang ditemukan"
                    />
                    <input
                      name={`mac_${it.id}`}
                      className="input mt-2 text-xs"
                      defaultValue={it.snapshotMac ?? ""}
                      placeholder="MAC (opsional)"
                    />
                    <input
                      name={`note_${it.id}`}
                      className="input mt-2 text-xs"
                      placeholder="Keterangan bila serial berbeda"
                    />
                  </div>
                ))}
                <button type="submit" className="btn-primary w-full justify-center">
                  Simpan Penarikan
                </button>
              </form>
            </div>
          )}

          {can(PERMISSIONS.RECOVERY_PICKUP) && !dri.physicalDisconnectedAt && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Pemutusan Fisik</h2>
              <p className="mb-3 text-xs text-slate-500">
                Port ODP baru dilepas setelah dikonfirmasi di sini. Selama kabel masih terpasang,
                port tidak boleh dianggap kosong.
              </p>
              <form action={confirmDisconnectAction}>
                <input type="hidden" name="recoveryId" value={dri.id} />
                <button type="submit" className="btn-secondary w-full justify-center">
                  Konfirmasi & Lepas Port
                </button>
              </form>
            </div>
          )}

          {can(PERMISSIONS.RECOVERY_RECEIVE) && pickedUp.length > 0 && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Terima ke Karantina</h2>
              <p className="mb-3 text-xs text-slate-500">
                Barang masuk karantina dan <strong>belum</strong> menambah stok tersedia sampai
                lolos inspeksi.
              </p>
              <form action={receiveDevicesAction} className="space-y-2">
                <input type="hidden" name="recoveryId" value={dri.id} />
                {pickedUp.map((it) => (
                  <label key={it.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="receive" value={it.id} className="rounded" defaultChecked />
                    <span className="font-mono text-xs">{it.actualSerial ?? it.snapshotSerial}</span>
                  </label>
                ))}
                <button type="submit" className="btn-primary w-full justify-center">
                  Terima {pickedUp.length} Perangkat
                </button>
              </form>
            </div>
          )}

          {received.length > 0 && (
            <div className="card p-5">
              <h2 className="mb-1 text-sm font-medium">Menunggu Inspeksi</h2>
              <p className="text-xs text-slate-500">
                {received.length} perangkat di karantina. Buka baris perangkatnya untuk memutuskan.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
