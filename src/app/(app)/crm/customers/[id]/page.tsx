import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { redactCustomer } from "@/lib/customer-pii";
import {
  PERMISSIONS,
  CUSTOMER_TYPES,
  statusLabel,
  formatRupiah,
  formatDateTime,
} from "@/lib/constants";
import { PageHeader, Flash, BackLink, Badge, EmptyState } from "@/components/ui";
import { CustomerPiiFields } from "@/components/customer-pii-fields";
import { updateCustomerAction } from "../actions";

export const metadata = { title: "Detail Customer" };

function pppoeStatusView(status: string | null | undefined) {
  switch (status) {
    case "ONLINE":
      return { label: "Online", className: "bg-emerald-50 text-emerald-700" };
    case "OFFLINE":
      return { label: "Offline", className: "bg-red-50 text-red-700" };
    case "DISABLED":
      return { label: "Disabled", className: "bg-slate-100 text-slate-600" };
    default:
      return { label: "Belum tersedia", className: "bg-amber-50 text-amber-700" };
  }
}

function hasValidCoordinates(latitude: number | null | undefined, longitude: number | null | undefined): boolean {
  return typeof latitude === "number" && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && typeof longitude === "number" && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.CUSTOMERS_VIEW);
  const { id } = await params;
  const sp = await searchParams;

  const [rawCustomer, areas, users] = await Promise.all([
    db.customer.findUnique({
      where: { id },
      include: {
        area: true,
        salesOwner: true,
        lead: true,
        subscriptions: {
          include: {
            package: true,
            router: { select: { id: true, hostname: true, status: true, deviceType: true } },
            pppoeSessions: {
              orderBy: { updatedAt: "desc" },
              take: 1,
              select: { id: true, username: true, status: true, lastSeenAt: true, updatedAt: true, routerId: true },
            },
            odpPort: {
              include: {
                odp: {
                  include: {
                    parent: { select: { id: true, code: true } },
                    ponPort: {
                      include: {
                        olt: {
                          select: {
                            id: true,
                            name: true,
                            networkDevice: { select: { id: true, hostname: true, status: true, deviceType: true } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        terminations: {
          include: {
            subscription: { select: { id: true, serviceNumber: true } },
            recovery: { select: { id: true, recoveryNumber: true, status: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    db.area.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);
  if (!rawCustomer) notFound();

  // Penyamaran di JALUR DATA, bukan di JSX — lihat src/lib/customer-pii.ts.
  // Halaman di bawah menerima bentuk yang persis sama, jadi tidak ada
  // percabangan "kalau boleh lihat" yang harus dipelihara di tiap kolom.
  const customer = redactCustomer(rawCustomer, user.permissions.has(PERMISSIONS.CUSTOMERS_PII_VIEW));

  const canEdit = user.permissions.has(PERMISSIONS.CUSTOMERS_EDIT);
  const canViewPii = user.permissions.has(PERMISSIONS.CUSTOMERS_PII_VIEW);
  const canCreateSub = user.permissions.has(PERMISSIONS.SUBSCRIPTIONS_CREATE);
  const canCreateTermination = user.permissions.has(PERMISSIONS.TERMINATION_CREATE);
  const canCreateTicket = user.permissions.has(PERMISSIONS.CTICKETS_CREATE);
  const hasCustomerCoordinates = hasValidCoordinates(customer.latitude, customer.longitude);
  const googleMapsHref = hasCustomerCoordinates
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${customer.latitude},${customer.longitude}`)}`
    : null;
  const terminationSubscriptionIds = new Set(
    customer.terminations
      .filter((termination) => ["DRAFT", "SUBMITTED", "APPROVED", "EFFECTIVE"].includes(termination.status))
      .map((termination) => termination.subscription.id),
  );

  return (
    <div className="max-w-4xl">
      <BackLink href="/crm/customers" label="Kembali ke daftar customer" />
      <PageHeader
        title={`${customer.customerNumber} — ${customer.name}`}
        subtitle={
          customer.lead
            ? `Dikonversi dari lead ${customer.lead.leadNumber}`
            : "Dibuat manual"
        }
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge value={customer.status} label={statusLabel(customer.status)} />
            {googleMapsHref && (
              <a
                href={googleMapsHref}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary whitespace-nowrap px-3 py-1.5 text-xs"
              >
                Buka di Google Maps
              </a>
            )}
          </div>
        }
      />
      <Flash ok={sp.ok} error={sp.error} />

      <form action={updateCustomerAction} className="card space-y-4 p-6">
        <input type="hidden" name="customerId" value={customer.id} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="name">Nama</label>
            <input id="name" name="name" className="input" defaultValue={customer.name} required disabled={!canEdit} />
          </div>
          <div>
            <label className="label" htmlFor="company">Perusahaan</label>
            <input id="company" name="company" className="input" defaultValue={customer.company ?? ""} disabled={!canEdit} />
          </div>
          <div>
            <label className="label" htmlFor="phone">Telepon</label>
            <input id="phone" name="phone" className="input" defaultValue={customer.phone} required disabled={!canEdit} />
          </div>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" className="input" defaultValue={customer.email ?? ""} disabled={!canEdit} />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="address">Alamat</label>
            <textarea id="address" name="address" rows={2} className="input" defaultValue={customer.address} required disabled={!canEdit} />
          </div>
          <div>
            <label className="label" htmlFor="customerType">Jenis Pelanggan</label>
            <select id="customerType" name="customerType" className="input" defaultValue={customer.customerType} disabled={!canEdit}>
              {CUSTOMER_TYPES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="areaId">Area</label>
            <select id="areaId" name="areaId" className="input" defaultValue={customer.areaId ?? ""} disabled={!canEdit}>
              <option value="">— belum ditentukan —</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="salesOwnerId">Sales Owner</label>
            <select id="salesOwnerId" name="salesOwnerId" className="input" defaultValue={customer.salesOwnerId ?? ""} disabled={!canEdit}>
              <option value="">— tidak ada —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="status">Status</label>
            <select id="status" name="status" className="input" defaultValue={customer.status} disabled={!canEdit}>
              <option value="ACTIVE">Aktif</option>
              <option value="INACTIVE">Nonaktif</option>
            </select>
          </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="notes">Catatan</label>
          <textarea id="notes" name="notes" rows={2} className="input" defaultValue={customer.notes ?? ""} disabled={!canEdit} />
        </div>
      </div>
      {canViewPii ? (
        <CustomerPiiFields
          initialIdentityNumber={customer.identityNumber ?? null}
          initialBirthDate={customer.birthDate?.toISOString().slice(0, 10) ?? ""}
          canEdit={canEdit}
        />
      ) : (
        <section className="crm-customer-pii-section" aria-labelledby="customer-pii-protected-title">
          <div className="crm-customer-pii-heading">
            <div>
              <h2 id="customer-pii-protected-title">Data identitas</h2>
              <p>NIK dan tanggal lahir dilindungi dan tidak dikirim ke browser tanpa izin PII.</p>
            </div>
            <span className="crm-customer-pii-badge">Dilindungi</span>
          </div>
        </section>
      )}
        {canEdit && <button type="submit" className="btn-primary">Simpan</button>}
      </form>

      <div className="card mt-6">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-medium">Subscriptions ({customer.subscriptions.length})</h2>
          {canCreateSub && (
            <Link
              href={`/crm/subscriptions/new?customerId=${customer.id}`}
              className="btn-secondary px-3 py-1.5 text-xs"
            >
              + Subscription
            </Link>
          )}
        </div>
        {customer.subscriptions.length === 0 ? (
          <EmptyState message="Belum ada subscription." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Service ID</th>
                <th className="th">Paket</th>
                <th className="th">Harga/bln</th>
                <th className="th">Aktivasi</th>
                <th className="th">Status</th>
                <th className="th">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customer.subscriptions.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="td">
                    <Link
                      href={`/crm/subscriptions/${s.id}`}
                      className="font-medium text-brand-600 hover:underline"
                    >
                      {s.serviceNumber}
                    </Link>
                  </td>
                  <td className="td text-xs">
                    {s.package.name} ({s.downloadMbps}/{s.uploadMbps} Mbps)
                  </td>
                  <td className="td whitespace-nowrap">{formatRupiah(s.monthlyPrice)}</td>
                  <td className="td whitespace-nowrap text-xs">
                    {s.activatedAt ? formatDateTime(s.activatedAt) : "-"}
                  </td>
                  <td className="td">
                    <Badge value={s.status} label={statusLabel(s.status)} />
                  </td>
                  <td className="td">
                    {canCreateTermination && !["TERMINATED", "CANCELLED"].includes(s.status) && !terminationSubscriptionIds.has(s.id) ? (
                      <Link href={`/crm/terminations/new?subscriptionId=${encodeURIComponent(s.id)}`} className="btn-secondary whitespace-nowrap px-3 py-1.5 text-xs">
                        Ajukan Terminasi
                      </Link>
                    ) : <span className="text-xs text-slate-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        )}
      </div>

      <section className="card mt-6 min-w-0" aria-labelledby="customer-network-context-title">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 id="customer-network-context-title" className="font-medium">Koneksi &amp; jalur layanan</h2>
          <p className="mt-1 text-sm text-slate-500">
            Status koneksi berasal dari sesi PPPoE terbaru. Password PPPoE tidak ditampilkan.
          </p>
        </div>
        {customer.subscriptions.length === 0 ? (
          <EmptyState message="Belum ada layanan untuk ditampilkan." />
        ) : (
          <div className="space-y-4 p-5">
            {customer.subscriptions.map((subscription) => {
              const session = subscription.pppoeSessions[0] ?? null;
              const status = pppoeStatusView(session?.status);
              const odp = subscription.odpPort?.odp ?? null;
              const ponPort = odp?.ponPort ?? null;
              const olt = ponPort?.olt ?? null;
              const oltDevice = olt?.networkDevice ?? null;
              const router = subscription.router;

              return (
                <article key={subscription.id} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-medium text-slate-800">{subscription.serviceNumber}</h3>
                      <p className="mt-1 text-sm text-slate-500">{subscription.package.name}</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <span className={`inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}>
                        {status.label}
                      </span>
                      {canCreateTicket && (
                        <Link
                          href={`/helpdesk/tickets/new?customerId=${encodeURIComponent(customer.id)}&subscriptionId=${encodeURIComponent(subscription.id)}`}
                          className="btn-secondary whitespace-nowrap px-3 py-1.5 text-xs"
                        >
                          Buka tiket
                        </Link>
                      )}
                    </div>
                  </div>

                  <dl className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="min-w-0">
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Username PPPoE</dt>
                      <dd className="mt-1 break-words font-mono text-sm text-slate-800">{subscription.pppoeUsername ?? session?.username ?? "—"}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Terakhir terlihat</dt>
                      <dd className="mt-1 break-words text-sm text-slate-800">{session?.lastSeenAt ? formatDateTime(session.lastSeenAt) : "Belum tersedia"}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Posisi ONU</dt>
                      <dd className="mt-1 break-words font-mono text-sm text-slate-800">{subscription.onuPosition ?? "Belum tersedia"}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Router</dt>
                      <dd className="mt-1 break-words text-sm">
                        {router ? (
                          <Link href={`/noc/devices?device=${encodeURIComponent(router.id)}`} className="text-brand-600 hover:underline">
                            {router.hostname}
                          </Link>
                        ) : "Belum tertaut"}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4 min-w-0 rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Jalur jaringan</p>
                    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-700">
                      {router ? <Link href={`/noc/devices?device=${encodeURIComponent(router.id)}`} className="text-brand-600 hover:underline">{router.hostname}</Link> : <span>Router belum tertaut</span>}
                      <span aria-hidden="true">→</span>
                      {oltDevice ? <Link href={`/noc/devices?device=${encodeURIComponent(oltDevice.id)}`} className="text-brand-600 hover:underline">{olt?.name ?? oltDevice.hostname}</Link> : <span>OLT belum tersedia</span>}
                      <span aria-hidden="true">→</span>
                      <span>{ponPort?.label ?? "PON belum tersedia"}</span>
                      <span aria-hidden="true">→</span>
                      {odp ? <Link href={`/noc/ftth/odp/${encodeURIComponent(odp.id)}`} className="text-brand-600 hover:underline">{odp.code}</Link> : <span>ODP belum tertaut</span>}
                      {subscription.odpPort && <span className="text-slate-500">(port {subscription.odpPort.portNumber})</span>}
                      {odp?.parent && (
                        <>
                          <span aria-hidden="true">→</span>
                          <Link href={`/noc/ftth/odp/${encodeURIComponent(odp.parent.id)}`} className="text-brand-600 hover:underline">{odp.parent.code}</Link>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {customer.terminations.length > 0 && (
        <div className="card mt-6">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-medium">Riwayat Terminasi ({customer.terminations.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Nomor</th>
                <th className="th">Layanan</th>
                <th className="th">Berlaku</th>
                <th className="th">Penarikan</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customer.terminations.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="td">
                    <Link
                      href={`/crm/terminations/${t.id}`}
                      className="font-medium text-brand-600 hover:underline"
                    >
                      {t.terminationNumber}
                    </Link>
                  </td>
                  <td className="td font-mono text-xs">{t.subscription.serviceNumber}</td>
                  <td className="td whitespace-nowrap text-xs">{formatDateTime(t.effectiveDate)}</td>
                  <td className="td text-xs">
                    {t.recovery ? (
                      <Link
                        href={`/inventory/device-recoveries/${t.recovery.id}`}
                        className="text-brand-600 hover:underline"
                      >
                        {t.recovery.recoveryNumber}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="td">
                    <Badge value={t.status} label={statusLabel(t.status)} />
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
