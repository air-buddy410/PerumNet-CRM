import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  SUBSCRIPTION_TRANSITIONS,
  statusLabel,
  formatRupiah,
  formatDateTime,
} from "@/lib/constants";
import { PageHeader, Flash, BackLink, Badge } from "@/components/ui";
import { tracePath } from "@/lib/ftth";
import {
  updateSubscriptionTechAction,
  changeSubscriptionStatusAction,
} from "../actions";

export const metadata = { title: "Detail Subscription" };

export default async function SubscriptionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.SUBSCRIPTIONS_VIEW);
  const { id } = await params;
  const sp = await searchParams;

  const sub = await db.subscription.findUnique({
    where: { id },
    include: { customer: true, package: true, createdBy: true },
  });
  if (!sub) notFound();

  const routers = await db.networkDevice.findMany({
    where: { deviceType: { in: ["ROUTER", "CORE_ROUTER"] }, status: "ACTIVE" },
    orderBy: { hostname: "asc" },
  });
  // Fase 13: penelusuran jalur FTTH (port → ODP kaskade → PON → OLT).
  const ftthPath = await tracePath(id);

  const canEdit = user.permissions.has(PERMISSIONS.SUBSCRIPTIONS_EDIT);
  const canActivate = user.permissions.has(PERMISSIONS.SUBSCRIPTIONS_ACTIVATE);
  const nextStatuses = SUBSCRIPTION_TRANSITIONS[sub.status] ?? [];

  return (
    <div className="max-w-4xl">
      <BackLink href="/crm/subscriptions" label="Kembali ke daftar subscription" />
      <PageHeader
        title={sub.serviceNumber}
        subtitle={`${sub.customer.customerNumber} — ${sub.customer.name} · ${sub.package.name}`}
        action={<Badge value={sub.status} label={statusLabel(sub.status)} />}
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="mb-4 font-medium">Layanan</h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Paket</dt>
                <dd className="mt-0.5 text-sm">
                  {sub.package.name} ({sub.downloadMbps}/{sub.uploadMbps} Mbps)
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Harga / bulan</dt>
                <dd className="mt-0.5 text-sm">{formatRupiah(sub.monthlyPrice)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Masa kontrak</dt>
                <dd className="mt-0.5 text-sm">
                  {sub.contractMonths ? `${sub.contractMonths} bulan` : "-"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Aktivasi</dt>
                <dd className="mt-0.5 text-sm">
                  {sub.activatedAt ? formatDateTime(sub.activatedAt) : "Belum aktif"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Terminasi</dt>
                <dd className="mt-0.5 text-sm">
                  {sub.terminatedAt ? formatDateTime(sub.terminatedAt) : "-"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Dibuat</dt>
                <dd className="mt-0.5 text-sm">
                  {sub.createdBy.name} · {formatDateTime(sub.createdAt)}
                </dd>
              </div>
            </dl>
          </div>

          <form action={updateSubscriptionTechAction} className="card space-y-4 p-6">
            <input type="hidden" name="subscriptionId" value={sub.id} />
            <h2 className="font-medium">Data Teknis</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="popNode">POP / Node</label>
                <input id="popNode" name="popNode" className="input" defaultValue={sub.popNode ?? ""} disabled={!canEdit} />
              </div>
              <div>
                <label className="label" htmlFor="vlan">VLAN</label>
                <input id="vlan" name="vlan" className="input" defaultValue={sub.vlan ?? ""} disabled={!canEdit} />
              </div>
              <div>
                <label className="label" htmlFor="pppoeUsername">PPPoE Username</label>
                <input id="pppoeUsername" name="pppoeUsername" className="input" defaultValue={sub.pppoeUsername ?? ""} disabled={!canEdit} />
              </div>
              <div>
                <label className="label" htmlFor="ipAddress">IP Address</label>
                <input id="ipAddress" name="ipAddress" className="input" defaultValue={sub.ipAddress ?? ""} disabled={!canEdit} />
              </div>
              <div>
                <label className="label" htmlFor="routerId">Router Distribusi (jalur isolir)</label>
                <select id="routerId" name="routerId" className="input" defaultValue={sub.routerId ?? ""} disabled={!canEdit}>
                  <option value="">— belum ditautkan —</option>
                  {routers.map((r) => (
                    <option key={r.id} value={r.id}>{r.hostname}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="billingCycleDay">Tanggal Tagihan (1–28)</label>
                <input id="billingCycleDay" name="billingCycleDay" type="number" min={1} max={28} className="input" defaultValue={sub.billingCycleDay} disabled={!canEdit} />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="notes">Catatan</label>
                <textarea id="notes" name="notes" rows={2} className="input" defaultValue={sub.notes ?? ""} disabled={!canEdit} />
              </div>
            </div>
            {canEdit && <button type="submit" className="btn-primary">Simpan Data Teknis</button>}
          </form>

          {ftthPath && ftthPath.port && (
            <div className="card p-6">
              <h2 className="mb-3 font-medium">Jalur FTTH</h2>
              <p className="mb-2 text-sm">
                Port <strong>#{ftthPath.port.number}</strong>
                {ftthPath.odpChain.length > 0 && (
                  <>
                    {" "}pada{" "}
                    {ftthPath.odpChain.map((o, i) => (
                      <span key={o.code}>
                        {i > 0 && " ← "}
                        <span className="font-mono">{o.code}</span>
                        <span className="text-xs text-slate-400"> ({o.portUsed}/{o.portCapacity})</span>
                      </span>
                    ))}
                  </>
                )}
              </p>
              <p className="text-sm text-slate-500">
                {ftthPath.pon ? `PON ${ftthPath.pon}` : "PON belum tertaut"}
                {ftthPath.olt ? ` · OLT ${ftthPath.olt}` : ""}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-6">
          {canEdit && nextStatuses.length > 0 && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Ubah Status</h2>
              <div className="space-y-2">
                {nextStatuses.map((s) => {
                  const isActivate = s === "ACTIVE";
                  const blocked = isActivate && !canActivate;
                  return (
                    <form key={s} action={changeSubscriptionStatusAction}>
                      <input type="hidden" name="subscriptionId" value={sub.id} />
                      <input type="hidden" name="status" value={s} />
                      <button
                        type="submit"
                        className={`${s === "TERMINATED" ? "btn-danger" : isActivate ? "btn-primary" : "btn-secondary"} w-full justify-center`}
                        disabled={blocked}
                        title={
                          blocked
                            ? "Memerlukan izin aktivasi layanan (bukan Sales — rule 17)"
                            : undefined
                        }
                      >
                        → {statusLabel(s)}
                      </button>
                    </form>
                  );
                })}
              </div>
              {!canActivate && nextStatuses.includes("ACTIVE") && (
                <p className="mt-3 text-xs text-amber-600">
                  Aktivasi memerlukan izin khusus — Sales tidak dapat mengaktifkan layanan
                  sesuai kewenangan aktivasi layanan.
                </p>
              )}
            </div>
          )}

          <div className="card p-5">
            <h2 className="mb-3 text-sm font-medium">Terkait</h2>
            <Link
              href={`/crm/customers/${sub.customerId}`}
              className="text-sm text-brand-600 hover:underline"
            >
              Customer {sub.customer.customerNumber}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
