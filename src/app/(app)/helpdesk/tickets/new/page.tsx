import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, CTICKET_PRIORITIES, statusLabel } from "@/lib/constants";
import { PageHeader, Flash, BackLink } from "@/components/ui";
import { createCustomerTicketAction } from "../../actions";

export const metadata = { title: "Tiket Pelanggan Baru" };

export default async function NewCustomerTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; parentId?: string; customerId?: string }>;
}) {
  await requirePermission(PERMISSIONS.CTICKETS_CREATE);
  const sp = await searchParams;

  const [customers, categories, technicians, parent] = await Promise.all([
    db.customer.findMany({
      where: { status: "ACTIVE" },
      include: { subscriptions: { where: { status: { notIn: ["TERMINATED"] } } } },
      orderBy: { name: "asc" },
    }),
    db.ticketCategory.findMany({ where: { isActive: true }, include: { workflow: true }, orderBy: { name: "asc" } }),
    db.user.findMany({
      where: { isActive: true, roles: { some: { role: { code: { in: ["technician", "operational_coordinator", "customer_service", "noc_engineer"] } } } } },
      orderBy: { name: "asc" },
    }),
    sp.parentId
      ? db.customerTicket.findUnique({ where: { id: sp.parentId }, include: { customer: true } })
      : Promise.resolve(null),
  ]);

  return (
    <div className="max-w-2xl">
      <BackLink href="/helpdesk/tickets" label="Kembali ke daftar tiket" />
      <PageHeader
        title={parent ? `Sub-Tiket dari ${parent.ticketNumber}` : "Tiket Pelanggan Baru"}
        subtitle="Kategori ber-workflow akan mewajibkan step selesai sebelum solve. SLA dihitung dari MTTR bersih pause."
      />
      <Flash error={sp.error} />

      <form action={createCustomerTicketAction} className="card space-y-4 p-6">
        {parent && <input type="hidden" name="parentId" value={parent.id} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="customerId">Pelanggan</label>
            <select id="customerId" name="customerId" className="input" required defaultValue={parent?.customerId ?? sp.customerId ?? ""}>
              <option value="" disabled>— pilih —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.customerNumber} · {c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="subscriptionId">Langganan (opsional)</label>
            <select id="subscriptionId" name="subscriptionId" className="input" defaultValue="">
              <option value="">— tidak spesifik —</option>
              {customers.flatMap((c) =>
                c.subscriptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.serviceNumber} ({c.name})</option>
                ))
              )}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="categoryId">Kategori</label>
            <select id="categoryId" name="categoryId" className="input" required defaultValue="">
              <option value="" disabled>— pilih —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.slaHours ? ` (SLA ${c.slaHours} jam)` : ""}{c.workflow ? " · workflow" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="priority">Prioritas</label>
            <select id="priority" name="priority" className="input" defaultValue="NORMAL">
              {CTICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>{statusLabel(p)}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="title">Judul</label>
          <input id="title" name="title" className="input" required />
        </div>
        <div>
          <label className="label" htmlFor="description">Deskripsi</label>
          <textarea id="description" name="description" rows={3} className="input" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="assigneeId">Petugas</label>
            <select id="assigneeId" name="assigneeId" className="input" defaultValue="">
              <option value="">— belum di-assign —</option>
              {technicians.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="scheduledAt">Jadwal Kunjungan</label>
            <input id="scheduledAt" name="scheduledAt" type="datetime-local" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="tags">Tags (pisah koma)</label>
            <input id="tags" name="tags" className="input" placeholder="Follow Up, Outage" />
          </div>
        </div>
        <button type="submit" className="btn-primary">Buat Tiket</button>
      </form>
    </div>
  );
}
