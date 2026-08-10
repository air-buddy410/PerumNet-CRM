import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, statusLabel, formatDateTime } from "@/lib/constants";
import { PageHeader, Badge, EmptyState } from "@/components/ui";

export const metadata = { title: "Dispatch Board" };

const ctStatusLabel = (s: string) => (s === "OPEN" ? "Baru" : s === "PENDING" ? "Dijeda" : statusLabel(s));

// TV Wall / dispatch board (§6): view di atas CustomerTicket + WorkOrder
// terjadwal hari ini per teknisi — tanpa model baru.
export default async function DispatchPage() {
  await requirePermission(PERMISSIONS.CTICKETS_VIEW);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay.getTime() + 86400e3);

  const [tickets, workOrders] = await Promise.all([
    db.customerTicket.findMany({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS", "PENDING"] },
        OR: [
          { scheduledAt: { gte: startOfDay, lt: endOfDay } },
          { scheduledAt: null },
        ],
      },
      include: { customer: true, category: true, assignee: true },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    }),
    db.workOrder.findMany({
      where: {
        status: { in: ["ASSIGNED", "IN_PROGRESS"] },
        scheduledAt: { gte: startOfDay, lt: endOfDay },
      },
      include: { customer: true, technician: true },
      orderBy: { scheduledAt: "asc" },
    }),
  ]);

  // Kelompokkan per petugas (tiket tanpa petugas → "Belum Ditugaskan").
  const board = new Map<string, { name: string; tickets: typeof tickets; wos: typeof workOrders }>();
  const keyFor = (id: string | null, name: string | null) => id ?? "__unassigned";
  for (const t of tickets) {
    const key = keyFor(t.assigneeId, t.assignee?.name ?? null);
    const row = board.get(key) ?? { name: t.assignee?.name ?? "Belum Ditugaskan", tickets: [], wos: [] };
    row.tickets.push(t);
    board.set(key, row);
  }
  for (const wo of workOrders) {
    const key = keyFor(wo.technicianId, wo.technician?.name ?? null);
    const row = board.get(key) ?? { name: wo.technician?.name ?? "Belum Ditugaskan", tickets: [], wos: [] };
    row.wos.push(wo);
    board.set(key, row);
  }
  const columns = [...board.entries()].sort(([a], [b]) =>
    a === "__unassigned" ? -1 : b === "__unassigned" ? 1 : 0
  );

  return (
    <div>
      <PageHeader
        title="Dispatch Board"
        subtitle={`Papan kerja hari ini (${formatDateTime(startOfDay).split(",")[0]}) — tiket aktif & work order terjadwal per petugas. Refresh halaman untuk data terbaru.`}
      />

      {columns.length === 0 ? (
        <div className="card"><EmptyState message="Tidak ada pekerjaan aktif hari ini. 🎉" /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {columns.map(([key, col]) => (
            <div key={key} className="card p-4">
              <h2 className={`mb-3 border-b border-slate-100 pb-2 text-sm font-semibold ${key === "__unassigned" ? "text-red-600" : ""}`}>
                {col.name}
                <span className="ml-2 text-xs font-normal text-slate-400">
                  {col.tickets.length + col.wos.length} pekerjaan
                </span>
              </h2>
              <ul className="space-y-2">
                {col.tickets.map((t) => (
                  <li key={t.id} className="rounded-lg border border-slate-100 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/helpdesk/tickets/${t.id}`} className="font-mono text-xs text-brand-600 hover:underline">
                        {t.ticketNumber}
                      </Link>
                      <Badge value={t.status} label={ctStatusLabel(t.status)} />
                    </div>
                    <p className="mt-0.5 truncate font-medium" title={t.title}>{t.title}</p>
                    <p className="text-xs text-slate-500">
                      {t.customer.name} · {t.category.name}
                      {t.scheduledAt ? ` · ${formatDateTime(t.scheduledAt).split(", ")[1] ?? ""}` : ""}
                    </p>
                  </li>
                ))}
                {col.wos.map((wo) => (
                  <li key={wo.id} className="rounded-lg border border-teal-100 bg-teal-50/40 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/operations/work-orders/${wo.id}`} className="font-mono text-xs text-brand-600 hover:underline">
                        {wo.woNumber}
                      </Link>
                      <Badge value={wo.status} label={statusLabel(wo.status)} />
                    </div>
                    <p className="text-xs text-slate-500">
                      WO · {wo.customer?.name ?? "-"}
                      {wo.scheduledAt ? ` · ${formatDateTime(wo.scheduledAt).split(", ")[1] ?? ""}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
