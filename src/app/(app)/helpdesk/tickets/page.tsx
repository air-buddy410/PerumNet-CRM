import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, CTICKET_STATUSES, statusLabel, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";

export const metadata = { title: "Tiket Pelanggan" };

const ctStatusLabel = (s: string) => (s === "OPEN" ? "Baru" : s === "PENDING" ? "Dijeda" : statusLabel(s));

export default async function CustomerTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; status?: string; categoryId?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.CTICKETS_VIEW);
  const sp = await searchParams;
  const canCreate = user.permissions.has(PERMISSIONS.CTICKETS_CREATE);
  const seesAll = user.permissions.has(PERMISSIONS.CTICKETS_MANAGE);

  const [tickets, categories] = await Promise.all([
    db.customerTicket.findMany({
      where: {
        ...(sp.status ? { status: sp.status } : {}),
        ...(sp.categoryId ? { categoryId: sp.categoryId } : {}),
        // Teknisi hanya melihat tiket yang di-assign/di-member-kan padanya.
        ...(seesAll
          ? {}
          : { OR: [{ assigneeId: user.id }, { members: { some: { userId: user.id } } }, { createdById: user.id }] }),
      },
      include: { customer: true, category: true, assignee: true, _count: { select: { children: true } } },
      orderBy: { createdAt: "desc" },
      take: 150,
    }),
    db.ticketCategory.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Tiket Pelanggan"
        subtitle={`Helpdesk pelanggan dengan workflow per kategori & MTTR bersih dari pause (DESIGN-PHASE-8 §6).${seesAll ? "" : " Menampilkan tiket yang ditugaskan kepada Anda."}`}
        action={
          canCreate ? (
            <Link href="/helpdesk/tickets/new" className="btn-primary">
              Tiket Baru
            </Link>
          ) : undefined
        }
      />
      <Flash ok={sp.ok} error={sp.error} />

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" className="input w-44" defaultValue={sp.status ?? ""}>
            <option value="">Semua status</option>
            {CTICKET_STATUSES.map((s) => (
              <option key={s} value={s}>{ctStatusLabel(s)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="categoryId">Kategori</label>
          <select id="categoryId" name="categoryId" className="input w-52" defaultValue={sp.categoryId ?? ""}>
            <option value="">Semua kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        {tickets.length === 0 ? (
          <EmptyState message="Tidak ada tiket pada filter ini." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Nomor</th>
                <th className="th">Pelanggan</th>
                <th className="th">Kategori</th>
                <th className="th">Judul</th>
                <th className="th">Prioritas</th>
                <th className="th">Petugas</th>
                <th className="th">Jadwal</th>
                <th className="th">MTTR</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tickets.map((t) => (
                <tr key={t.id} className={t.slaBreached ? "bg-red-50/40" : "hover:bg-slate-50"}>
                  <td className="td whitespace-nowrap font-mono text-xs">
                    <Link href={`/helpdesk/tickets/${t.id}`} className="font-medium text-brand-600 hover:underline">
                      {t.ticketNumber}
                    </Link>
                    {t.parentId && <span className="ml-1 text-[10px] text-slate-400">(sub)</span>}
                    {t._count.children > 0 && (
                      <span className="ml-1 text-[10px] text-slate-400">+{t._count.children} sub</span>
                    )}
                  </td>
                  <td className="td whitespace-nowrap text-xs font-medium">{t.customer.name}</td>
                  <td className="td whitespace-nowrap text-xs">{t.category.name}</td>
                  <td className="td max-w-56 text-xs">
                    <span className="block truncate" title={t.title}>{t.title}</span>
                  </td>
                  <td className="td"><Badge value={t.priority} label={statusLabel(t.priority)} /></td>
                  <td className="td whitespace-nowrap text-xs">{t.assignee?.name ?? "-"}</td>
                  <td className="td whitespace-nowrap text-xs">{t.scheduledAt ? formatDateTime(t.scheduledAt) : "-"}</td>
                  <td className="td whitespace-nowrap text-xs">
                    {t.mttrMinutes !== null ? (
                      <span className={t.slaBreached ? "font-semibold text-red-600" : ""}>
                        {t.mttrMinutes} mnt{t.slaBreached ? " ⚠" : ""}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="td"><Badge value={t.status} label={ctStatusLabel(t.status)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
