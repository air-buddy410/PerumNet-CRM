import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  CUSTOMER_TYPES,
  statusLabel,
  formatRupiah,
  formatDateTime,
} from "@/lib/constants";
import { PageHeader, Flash, BackLink, Badge, EmptyState } from "@/components/ui";
import { updateCustomerAction } from "../actions";

export const metadata = { title: "Detail Customer" };

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

  const [customer, areas, users] = await Promise.all([
    db.customer.findUnique({
      where: { id },
      include: {
        area: true,
        salesOwner: true,
        lead: true,
        subscriptions: { include: { package: true }, orderBy: { createdAt: "desc" } },
      },
    }),
    db.area.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);
  if (!customer) notFound();

  const canEdit = user.permissions.has(PERMISSIONS.CUSTOMERS_EDIT);
  const canCreateSub = user.permissions.has(PERMISSIONS.SUBSCRIPTIONS_CREATE);

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
        action={<Badge value={customer.status} label={statusLabel(customer.status)} />}
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
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Service ID</th>
                <th className="th">Paket</th>
                <th className="th">Harga/bln</th>
                <th className="th">Aktivasi</th>
                <th className="th">Status</th>
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
