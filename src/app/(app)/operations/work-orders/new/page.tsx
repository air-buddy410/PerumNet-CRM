import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, WO_TYPES } from "@/lib/constants";
import { PageHeader, Flash, BackLink } from "@/components/ui";
import { createWorkOrderAction } from "../actions";

export const metadata = { title: "Work Order Baru" };

export default async function NewWorkOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; customerId?: string; subscriptionId?: string }>;
}) {
  await requirePermission(PERMISSIONS.WORK_ORDERS_CREATE);
  const sp = await searchParams;

  const [customers, subscriptions, technicians] = await Promise.all([
    db.customer.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } }),
    db.subscription.findMany({
      include: { customer: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);
  const preselectCustomer = sp.customerId
    ? customers.find((c) => c.id === sp.customerId)
    : undefined;

  return (
    <div className="max-w-2xl">
      <BackLink href="/operations/work-orders" label="Kembali ke daftar WO" />
      <PageHeader title="Work Order Baru" />
      <Flash error={sp.error} />

      <form action={createWorkOrderAction} className="card space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="type">Jenis</label>
            <select id="type" name="type" className="input" required defaultValue="">
              <option value="" disabled>— pilih jenis —</option>
              {WO_TYPES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="scheduledAt">Jadwal</label>
            <input id="scheduledAt" name="scheduledAt" type="datetime-local" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="customerId">Customer</label>
            <select id="customerId" name="customerId" className="input" defaultValue={preselectCustomer?.id ?? ""}>
              <option value="">— tanpa customer (internal) —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.customerNumber} — {c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="subscriptionId">Subscription</label>
            <select id="subscriptionId" name="subscriptionId" className="input" defaultValue={sp.subscriptionId ?? ""}>
              <option value="">— tidak terkait —</option>
              {subscriptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.serviceNumber} — {s.customer.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="address">Alamat Pekerjaan</label>
            <textarea
              id="address"
              name="address"
              rows={2}
              className="input"
              defaultValue={preselectCustomer?.address ?? ""}
              required
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="description">Deskripsi Pekerjaan</label>
            <textarea id="description" name="description" rows={3} className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="technicianId">Teknisi</label>
            <select id="technicianId" name="technicianId" className="input" defaultValue="">
              <option value="">— assign menyusul —</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>
        <button type="submit" className="btn-primary">Buat Work Order</button>
      </form>
    </div>
  );
}
