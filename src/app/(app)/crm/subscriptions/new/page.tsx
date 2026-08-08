import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatRupiah } from "@/lib/constants";
import { PageHeader, Flash, BackLink } from "@/components/ui";
import { createSubscriptionAction } from "../actions";

export const metadata = { title: "Subscription Baru" };

export default async function NewSubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; customerId?: string }>;
}) {
  await requirePermission(PERMISSIONS.SUBSCRIPTIONS_CREATE);
  const sp = await searchParams;

  const [customers, packages] = await Promise.all([
    db.customer.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } }),
    db.package.findMany({ where: { isActive: true }, orderBy: { monthlyPrice: "asc" } }),
  ]);

  return (
    <div className="max-w-2xl">
      <BackLink href="/crm/subscriptions" label="Kembali ke daftar subscription" />
      <PageHeader
        title="Subscription Baru"
        subtitle="Subscription baru berstatus Draft. Alur: Draft → Menunggu Instalasi → Aktif."
      />
      <Flash error={sp.error} />

      <form action={createSubscriptionAction} className="card space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="customerId">Customer</label>
            <select
              id="customerId"
              name="customerId"
              className="input"
              defaultValue={sp.customerId ?? ""}
              required
            >
              <option value="" disabled>— pilih customer —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.customerNumber} — {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="packageId">Paket</label>
            <select id="packageId" name="packageId" className="input" defaultValue="" required>
              <option value="" disabled>— pilih paket —</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({formatRupiah(p.monthlyPrice)}/bln)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="monthlyPrice">Harga Bulanan (Rp)</label>
            <input id="monthlyPrice" name="monthlyPrice" inputMode="numeric" className="input" placeholder="kosongkan = harga master" />
          </div>
          <div>
            <label className="label" htmlFor="contractMonths">Masa Kontrak (bulan)</label>
            <input id="contractMonths" name="contractMonths" type="number" min={1} className="input" defaultValue={12} />
          </div>
          <div>
            <label className="label" htmlFor="popNode">POP / Node</label>
            <input id="popNode" name="popNode" className="input" placeholder="mis. POP-UTARA / ODP-03" />
          </div>
          <div>
            <label className="label" htmlFor="vlan">VLAN</label>
            <input id="vlan" name="vlan" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="pppoeUsername">PPPoE Username</label>
            <input id="pppoeUsername" name="pppoeUsername" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="ipAddress">IP Address</label>
            <input id="ipAddress" name="ipAddress" className="input" placeholder="opsional — IPAM di Phase 5" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="notes">Catatan</label>
            <textarea id="notes" name="notes" rows={2} className="input" />
          </div>
        </div>
        <button type="submit" className="btn-primary">Simpan Draft</button>
      </form>
    </div>
  );
}
