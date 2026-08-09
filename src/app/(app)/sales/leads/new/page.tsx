import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  CUSTOMER_TYPES,
  LEAD_SOURCES,
} from "@/lib/constants";
import { PageHeader, Flash, BackLink } from "@/components/ui";
import { createLeadAction } from "../actions";

export const metadata = { title: "Lead Baru" };

export default async function NewLeadPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.LEADS_CREATE);
  const sp = await searchParams;

  const [campaigns, packages, salesUsers] = await Promise.all([
    db.campaign.findMany({
      where: { status: { in: ["ACTIVE", "DRAFT"] } },
      orderBy: { name: "asc" },
    }),
    db.package.findMany({ where: { isActive: true }, orderBy: { monthlyPrice: "asc" } }),
    db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  const canAssign = user.permissions.has(PERMISSIONS.LEADS_ASSIGN);

  return (
    <div className="max-w-2xl">
      <BackLink href="/sales/leads" label="Kembali ke daftar lead" />
      <PageHeader
        title="Lead Baru"
        subtitle="Lead tanpa Sales owner akan berstatus Baru dan disorot di daftar sampai di-assign."
      />
      <Flash error={sp.error} />

      <form action={createLeadAction} className="card space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="name">Nama</label>
            <input id="name" name="name" className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="company">Perusahaan</label>
            <input id="company" name="company" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="phone">Telepon</label>
            <input id="phone" name="phone" className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" className="input" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="address">Alamat</label>
            <textarea id="address" name="address" rows={2} className="input" />
            <p className="mt-1 text-xs text-slate-500">
              Alamat wajib terisi sebelum lead dapat dikonversi menjadi customer.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="customerType">Jenis Pelanggan</label>
            <select id="customerType" name="customerType" className="input" defaultValue="RESIDENTIAL">
              {CUSTOMER_TYPES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="source">Sumber</label>
            <select id="source" name="source" className="input" defaultValue="OTHER">
              {LEAD_SOURCES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="campaignId">Campaign</label>
            <select id="campaignId" name="campaignId" className="input" defaultValue="">
              <option value="">— tanpa campaign —</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="interestPackageId">Paket Diminati</label>
            <select id="interestPackageId" name="interestPackageId" className="input" defaultValue="">
              <option value="">— belum ditentukan —</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="estBandwidthMbps">Estimasi Bandwidth (Mbps)</label>
            <input id="estBandwidthMbps" name="estBandwidthMbps" type="number" min={1} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="salesOwnerId">Sales Owner</label>
            <select
              id="salesOwnerId"
              name="salesOwnerId"
              className="input"
              defaultValue={canAssign ? "" : user.id}
              disabled={!canAssign}
            >
              <option value="">— assign menyusul —</option>
              {salesUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            {!canAssign && (
              <p className="mt-1 text-xs text-slate-500">
                Anda tidak memiliki izin assign; lead akan dibuat tanpa owner.
              </p>
            )}
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="notes">Catatan</label>
            <textarea id="notes" name="notes" rows={2} className="input" />
          </div>
        </div>
        <button type="submit" className="btn-primary">Simpan Lead</button>
      </form>
    </div>
  );
}
