import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, statusLabel, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, BackLink, Badge, EmptyState } from "@/components/ui";
import { outstandingDevices } from "@/lib/workorder";
import {
  assignWorkOrderAction,
  startWorkOrderAction,
  installDeviceAction,
  uninstallDeviceAction,
  materialUsageAction,
  completeWorkOrderAction,
  closeWorkOrderAction,
  cancelWorkOrderAction,
  uploadWoPhotoAction,
} from "../actions";

export const metadata = { title: "Detail Work Order" };

export default async function WorkOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.WORK_ORDERS_VIEW);
  const { id } = await params;
  const sp = await searchParams;

  const wo = await db.workOrder.findUnique({
    where: { id },
    include: {
      customer: true,
      subscription: true,
      technician: true,
      createdBy: true,
      closedBy: true,
      transactions: { orderBy: { createdAt: "desc" } },
      materialUsages: { include: { byUser: true }, orderBy: { createdAt: "desc" } },
      movements: {
        include: { device: { include: { item: true } }, byUser: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!wo) notFound();

  const [attachments, technicians, custodyDevices, installedDevices, customerSubs, bulkItems, outstanding, usageItems] =
    await Promise.all([
      db.attachment.findMany({
        where: { entityType: "WorkOrder", entityId: id },
        include: { uploadedBy: true },
        orderBy: { createdAt: "desc" },
      }),
      db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
      wo.technicianId
        ? db.serializedDevice.findMany({
            where: { status: "IN_CUSTODY", custodianId: wo.technicianId },
            include: { item: true },
            orderBy: { serialNumber: "asc" },
          })
        : Promise.resolve([]),
      wo.customerId
        ? db.serializedDevice.findMany({
            where: { status: "INSTALLED", customerId: wo.customerId },
            include: { item: true },
            orderBy: { serialNumber: "asc" },
          })
        : Promise.resolve([]),
      wo.customerId
        ? db.subscription.findMany({ where: { customerId: wo.customerId } })
        : Promise.resolve([]),
      db.item.findMany({
        where: { isActive: true, trackingType: "BULK" },
        orderBy: { name: "asc" },
      }),
      outstandingDevices(id),
      db.item.findMany({ orderBy: { name: "asc" } }),
    ]);
  const itemName = new Map(usageItems.map((i) => [i.id, i]));

  const canAssign = user.permissions.has(PERMISSIONS.WORK_ORDERS_ASSIGN);
  const canExecute =
    user.permissions.has(PERMISSIONS.WORK_ORDERS_EXECUTE) &&
    (wo.technicianId === user.id || user.permissions.has(PERMISSIONS.WORK_ORDERS_CLOSE) || user.roles.some((r) => r.code === "super_admin"));
  const canClose = user.permissions.has(PERMISSIONS.WORK_ORDERS_CLOSE);
  const canCreate = user.permissions.has(PERMISSIONS.WORK_ORDERS_CREATE);
  const inProgress = ["ASSIGNED", "IN_PROGRESS"].includes(wo.status);
  const isFinal = ["CLOSED", "CANCELLED"].includes(wo.status);

  return (
    <div className="max-w-5xl">
      <BackLink href="/operations/work-orders" label="Kembali ke daftar WO" />
      <PageHeader
        title={`${wo.woNumber} — ${statusLabel(wo.type)}`}
        subtitle={`${wo.customer ? `${wo.customer.customerNumber} · ${wo.customer.name} · ` : ""}dibuat ${wo.createdBy.name}, ${formatDateTime(wo.createdAt)}`}
        action={<Badge value={wo.status} label={statusLabel(wo.status)} />}
      />
      <Flash ok={sp.ok} error={sp.error} />

      {wo.status === "COMPLETED" && outstanding.length > 0 && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {outstanding.length} perangkat WO ini masih di custody teknisi (
          {outstanding.map((d) => d.serialNumber).join(", ")}) — WO belum bisa ditutup.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <div className="card p-6">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-slate-400">Alamat</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-sm">{wo.address}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-slate-400">Deskripsi</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-sm">{wo.description}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Teknisi</dt>
                <dd className="mt-0.5 text-sm">{wo.technician?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Jadwal</dt>
                <dd className="mt-0.5 text-sm">
                  {wo.scheduledAt ? formatDateTime(wo.scheduledAt) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Subscription</dt>
                <dd className="mt-0.5 text-sm">
                  {wo.subscription ? (
                    <Link
                      href={`/crm/subscriptions/${wo.subscription.id}`}
                      className="text-brand-600 hover:underline"
                    >
                      {wo.subscription.serviceNumber}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              {wo.closedAt && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Ditutup</dt>
                  <dd className="mt-0.5 text-sm">
                    {wo.closedBy?.name} · {formatDateTime(wo.closedAt)}
                  </dd>
                </div>
              )}
              {wo.resultNotes && (
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Hasil Pekerjaan</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-sm">{wo.resultNotes}</dd>
                </div>
              )}
              {wo.customerConfirmation && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Konfirmasi Pelanggan</dt>
                  <dd className="mt-0.5 text-sm">{wo.customerConfirmation}</dd>
                </div>
              )}
            </dl>
          </div>

          {inProgress && canExecute && (
            <div className="card p-6">
              <h2 className="mb-4 font-medium">Pemasangan / Penarikan Perangkat</h2>
              {wo.technicianId ? (
                <div className="grid gap-6 sm:grid-cols-2">
                  <form action={installDeviceAction} className="space-y-3">
                    <input type="hidden" name="woId" value={wo.id} />
                    <h3 className="text-sm font-semibold">Pasang dari custody</h3>
                    <select name="deviceId" className="input" defaultValue="">
                      <option value="" disabled>— perangkat di custody —</option>
                      {custodyDevices.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.serialNumber} · {d.item.name}
                        </option>
                      ))}
                    </select>
                    <select name="subscriptionId" className="input" defaultValue={wo.subscriptionId ?? ""}>
                      <option value="" disabled>— subscription —</option>
                      {customerSubs.map((s) => (
                        <option key={s.id} value={s.id}>{s.serviceNumber}</option>
                      ))}
                    </select>
                    <button type="submit" className="btn-primary w-full justify-center">
                      Pasang
                    </button>
                    <p className="text-xs text-slate-500">
                      Perangkat harus dikeluarkan dulu lewat{" "}
                      <Link
                        href={`/inventory/transactions/new?type=STOCK_ISSUE&workOrderId=${wo.id}`}
                        className="text-brand-600 underline"
                      >
                        Stock Issue
                      </Link>{" "}
                      ke teknisi WO ini.
                    </p>
                  </form>
                  <form action={uninstallDeviceAction} className="space-y-3">
                    <input type="hidden" name="woId" value={wo.id} />
                    <h3 className="text-sm font-semibold">Tarik perangkat terpasang</h3>
                    <select name="deviceId" className="input" defaultValue="">
                      <option value="" disabled>— perangkat terpasang —</option>
                      {installedDevices.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.serialNumber} · {d.item.name}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="btn-secondary w-full justify-center">
                      Tarik ke Custody
                    </button>
                  </form>
                </div>
              ) : (
                <p className="text-sm text-slate-400">Assign teknisi terlebih dahulu.</p>
              )}
            </div>
          )}

          {inProgress && canExecute && wo.technicianId && (
            <div className="card p-6">
              <h2 className="mb-4 font-medium">Pemakaian Material (dari custody teknisi)</h2>
              <form action={materialUsageAction} className="grid gap-3 sm:grid-cols-[1fr_6rem_1fr_auto]">
                <input type="hidden" name="woId" value={wo.id} />
                <select name="itemId" className="input" required defaultValue="">
                  <option value="" disabled>— item bulk —</option>
                  {bulkItems.map((i) => (
                    <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                  ))}
                </select>
                <input name="qty" type="number" min={1} className="input" placeholder="Qty" required />
                <input name="note" className="input" placeholder="catatan" />
                <button type="submit" className="btn-secondary">Catat</button>
              </form>
              {wo.materialUsages.length > 0 && (
                <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
                  {wo.materialUsages.map((u) => (
                    <li key={u.id} className="flex items-center justify-between py-2 text-sm">
                      <span>
                        {itemName.get(u.itemId)?.name ?? u.itemId} — {u.qty}{" "}
                        {itemName.get(u.itemId)?.unit ?? ""}
                        {u.note ? ` · ${u.note}` : ""}
                      </span>
                      <span className="text-xs text-slate-400">
                        {u.byUser.name} · {formatDateTime(u.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="card">
            <div className="border-b border-slate-100 px-5 py-4 font-medium">
              Foto & Bukti ({attachments.length})
            </div>
            {!isFinal && canExecute && (
              <form
                action={uploadWoPhotoAction}
                className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4"
              >
                <input type="hidden" name="woId" value={wo.id} />
                <input
                  type="file"
                  name="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="text-sm"
                  required
                />
                <button type="submit" className="btn-secondary">Unggah</button>
              </form>
            )}
            {attachments.length === 0 ? (
              <EmptyState message="Belum ada foto — WO tidak dapat ditutup tanpa foto bukti." />
            ) : (
              <div className="grid gap-4 p-5 sm:grid-cols-3">
                {attachments.map((a) => (
                  <a key={a.id} href={`/api/files/${a.id}`} target="_blank" className="block">
                    {a.mimeType.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/files/${a.id}`}
                        alt={a.filename}
                        className="h-32 w-full rounded-lg border border-slate-200 object-cover"
                      />
                    ) : (
                      <div className="flex h-32 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-500">
                        {a.filename}
                      </div>
                    )}
                    <div className="mt-1 truncate text-xs text-slate-500">
                      {a.filename} · {a.uploadedBy.name}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="border-b border-slate-100 px-5 py-4 font-medium">
              Transaksi Stock Terkait ({wo.transactions.length})
            </div>
            {wo.transactions.length === 0 ? (
              <EmptyState message="Belum ada transaksi terkait WO ini." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {wo.transactions.map((t) => (
                  <li key={t.id} className="flex items-center justify-between px-5 py-3">
                    <Link
                      href={`/inventory/transactions/${t.id}`}
                      className="text-sm font-medium text-brand-600 hover:underline"
                    >
                      {t.txNumber}
                    </Link>
                    <Badge value={t.status} label={statusLabel(t.status)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {["OPEN", "ASSIGNED"].includes(wo.status) && canAssign && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Tugaskan Teknisi</h2>
              <form action={assignWorkOrderAction} className="space-y-3">
                <input type="hidden" name="woId" value={wo.id} />
                <select name="technicianId" className="input" required defaultValue={wo.technicianId ?? ""}>
                  <option value="" disabled>— pilih teknisi —</option>
                  {technicians.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <input name="scheduledAt" type="datetime-local" className="input" />
                <button type="submit" className="btn-primary w-full justify-center">
                  Assign
                </button>
              </form>
            </div>
          )}

          {wo.status === "ASSIGNED" && canExecute && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Mulai Pekerjaan</h2>
              <form action={startWorkOrderAction}>
                <input type="hidden" name="woId" value={wo.id} />
                <button type="submit" className="btn-primary w-full justify-center">
                  Mulai (In Progress)
                </button>
              </form>
            </div>
          )}

          {wo.status === "IN_PROGRESS" && canExecute && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Selesaikan Pekerjaan</h2>
              <form action={completeWorkOrderAction} className="space-y-3">
                <input type="hidden" name="woId" value={wo.id} />
                <textarea
                  name="resultNotes"
                  rows={3}
                  className="input"
                  placeholder="Hasil pekerjaan (wajib)"
                  required
                />
                <input
                  name="customerConfirmation"
                  className="input"
                  placeholder="Nama pelanggan yang konfirmasi (wajib)"
                  required
                />
                <button type="submit" className="btn-primary w-full justify-center">
                  Selesai Dikerjakan
                </button>
              </form>
            </div>
          )}

          {wo.status === "COMPLETED" && canClose && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Verifikasi & Tutup</h2>
              <p className="mb-3 text-xs text-slate-500">
                Syarat: foto bukti ada, konfirmasi pelanggan terisi, tidak ada perangkat WO
                di custody. Penutup bukan teknisi pelaksana.
              </p>
              <form action={closeWorkOrderAction}>
                <input type="hidden" name="woId" value={wo.id} />
                <button type="submit" className="btn-primary w-full justify-center">
                  Tutup WO
                </button>
              </form>
            </div>
          )}

          {!isFinal && canCreate && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Batalkan WO</h2>
              <form action={cancelWorkOrderAction} className="space-y-3">
                <input type="hidden" name="woId" value={wo.id} />
                <textarea name="reason" rows={2} className="input" placeholder="Alasan (wajib)" required />
                <button type="submit" className="btn-danger w-full justify-center">
                  Batalkan
                </button>
              </form>
            </div>
          )}

          <div className="card p-5">
            <h2 className="mb-3 text-sm font-medium">Riwayat Perangkat WO</h2>
            {wo.movements.length === 0 ? (
              <p className="text-sm text-slate-400">Belum ada pergerakan perangkat.</p>
            ) : (
              <ul className="space-y-2">
                {wo.movements.map((m) => (
                  <li key={m.id} className="text-xs">
                    <span className="font-semibold">{m.action}</span> —{" "}
                    <Link
                      href={`/inventory/devices/${m.deviceId}`}
                      className="font-mono text-brand-600 hover:underline"
                    >
                      {m.device.serialNumber}
                    </Link>{" "}
                    ({m.device.item.name})
                    <span className="block text-slate-400">
                      {m.byUser.name} · {formatDateTime(m.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
