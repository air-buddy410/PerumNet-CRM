import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, statusLabel, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, BackLink, Badge, EmptyState } from "@/components/ui";
import { requestWriteoffAction, finalizeWriteoffAction } from "../actions";

export const metadata = { title: "Detail Perangkat" };

export default async function DeviceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  const { id } = await params;
  const sp = await searchParams;

  const device = await db.serializedDevice.findUnique({
    where: { id },
    include: {
      item: true,
      warehouse: true,
      custodian: true,
      customer: true,
      subscription: true,
      movements: {
        include: { byUser: true, workOrder: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!device) notFound();

  const writeoffApproval = await db.approvalRequest.findFirst({
    where: { entityType: "SerializedDevice", entityId: id, module: "device_writeoff" },
    orderBy: { createdAt: "desc" },
  });

  const canWriteoff = user.permissions.has(PERMISSIONS.DEVICES_WRITEOFF);
  const location =
    device.warehouse?.name ??
    (device.custodian ? `Teknisi: ${device.custodian.name}` : null) ??
    (device.customer ? `Pelanggan: ${device.customer.name}` : "—");

  return (
    <div className="max-w-4xl">
      <BackLink href="/inventory/devices" label="Kembali ke daftar perangkat" />
      <PageHeader
        title={device.serialNumber}
        subtitle={`${device.item.name}${device.macAddress ? ` · MAC ${device.macAddress}` : ""}`}
        action={<Badge value={device.status} label={statusLabel(device.status)} />}
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <div className="card p-6">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Lokasi / PIC Aktif</dt>
                <dd className="mt-0.5 text-sm font-medium">{location}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Subscription</dt>
                <dd className="mt-0.5 text-sm">
                  {device.subscription ? (
                    <Link
                      href={`/crm/subscriptions/${device.subscription.id}`}
                      className="text-brand-600 hover:underline"
                    >
                      {device.subscription.serviceNumber}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Kondisi</dt>
                <dd className="mt-0.5 text-sm">{device.condition}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Terdaftar</dt>
                <dd className="mt-0.5 text-sm">{formatDateTime(device.createdAt)}</dd>
              </div>
              {device.notes && (
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Catatan</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-sm">{device.notes}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="card">
            <div className="border-b border-slate-100 px-5 py-4 font-medium">
              Riwayat Pergerakan ({device.movements.length})
            </div>
            {device.movements.length === 0 ? (
              <EmptyState message="Belum ada pergerakan." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {device.movements.map((m) => (
                  <li key={m.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold">{m.action}</span>
                      <span className="text-xs text-slate-400">{formatDateTime(m.createdAt)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {[m.fromNote, m.toNote].filter(Boolean).join(" → ") || m.note || "-"}
                      {m.workOrder ? ` · ${m.workOrder.woNumber}` : ""} · oleh {m.byUser.name}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {canWriteoff && ["AVAILABLE", "IN_CUSTODY", "INSTALLED"].includes(device.status) && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Lapor Hilang / Rusak</h2>
              <p className="mb-3 text-xs text-slate-500">
                Wajib kronologi + approval (PRD §16.5). Perangkat masuk status Inspeksi
                sampai approval selesai.
              </p>
              <form action={requestWriteoffAction} className="space-y-3">
                <input type="hidden" name="deviceId" value={device.id} />
                <select name="target" className="input" defaultValue="DAMAGED">
                  <option value="DAMAGED">Rusak</option>
                  <option value="LOST">Hilang</option>
                </select>
                <textarea
                  name="chronology"
                  rows={3}
                  className="input"
                  placeholder="Kronologi kejadian (wajib)"
                  required
                />
                <button type="submit" className="btn-danger w-full justify-center">
                  Ajukan Write-off
                </button>
              </form>
            </div>
          )}

          {device.status === "UNDER_INSPECTION" && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Status Write-off</h2>
              {writeoffApproval ? (
                <p className="text-sm">
                  Approval{" "}
                  <Link
                    href={`/approvals/${writeoffApproval.id}`}
                    className="text-brand-600 hover:underline"
                  >
                    {writeoffApproval.requestNumber}
                  </Link>{" "}
                  <Badge
                    value={writeoffApproval.status}
                    label={statusLabel(writeoffApproval.status)}
                  />
                </p>
              ) : (
                <p className="text-sm text-slate-400">Pengajuan tidak ditemukan.</p>
              )}
              {canWriteoff && writeoffApproval?.status === "APPROVED" && (
                <form action={finalizeWriteoffAction} className="mt-3 space-y-2">
                  <input type="hidden" name="deviceId" value={device.id} />
                  <select name="target" className="input" defaultValue="DAMAGED">
                    <option value="DAMAGED">Finalisasi: Rusak</option>
                    <option value="LOST">Finalisasi: Hilang</option>
                  </select>
                  <button type="submit" className="btn-primary w-full justify-center">
                    Finalisasi Status
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
