import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  LEAD_STATUSES,
  statusLabel,
  formatDateTime,
} from "@/lib/constants";
import { PageHeader, Badge, EmptyState, Flash } from "@/components/ui";

export const metadata = { title: "Leads" };

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    ok?: string;
    error?: string;
    status?: string;
    owner?: string;
  }>;
}) {
  const user = await requirePermission(PERMISSIONS.LEADS_VIEW);
  const sp = await searchParams;

  const where = {
    ...(sp.status ? { status: sp.status } : {}),
    ...(sp.owner === "mine"
      ? { salesOwnerId: user.id }
      : sp.owner === "unassigned"
        ? { salesOwnerId: null }
        : {}),
  };

  const [leads, salesOwners] = await Promise.all([
    db.lead.findMany({
      where,
      include: { salesOwner: true, campaign: true, interestPackage: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.user.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const now = new Date();
  const unassignedCount = leads.filter((l) => !l.salesOwnerId).length;
  const overdueCount = leads.filter(
    (l) => l.nextFollowUpAt && l.nextFollowUpAt < now && !["CONVERTED", "LOST", "NOT_INTERESTED"].includes(l.status)
  ).length;

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle="Setiap lead wajib memiliki Sales owner (business rule 14). Follow-up lewat tenggat ditandai merah."
        action={
          user.permissions.has(PERMISSIONS.LEADS_CREATE) ? (
            <Link href="/sales/leads/new" className="btn-primary">
              + Lead
            </Link>
          ) : undefined
        }
      />
      <Flash ok={sp.ok} error={sp.error} />

      {(unassignedCount > 0 || overdueCount > 0) && (
        <div className="mb-4 flex flex-wrap gap-3 text-sm">
          {unassignedCount > 0 && (
            <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-800">
              {unassignedCount} lead belum memiliki Sales owner
            </span>
          )}
          {overdueCount > 0 && (
            <span className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-red-700">
              {overdueCount} follow-up lewat tenggat
            </span>
          )}
        </div>
      )}

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" className="input w-52" defaultValue={sp.status ?? ""}>
            <option value="">Semua status</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="owner">Sales Owner</label>
          <select id="owner" name="owner" className="input w-52" defaultValue={sp.owner ?? ""}>
            <option value="">Semua</option>
            <option value="mine">Milik saya</option>
            <option value="unassigned">Belum ter-assign</option>
          </select>
        </div>
        <button type="submit" className="btn-secondary">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        {leads.length === 0 ? (
          <EmptyState message="Belum ada lead yang cocok dengan filter." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Nomor</th>
                <th className="th">Nama</th>
                <th className="th">Telepon</th>
                <th className="th">Sumber</th>
                <th className="th">Paket Diminati</th>
                <th className="th">Sales Owner</th>
                <th className="th">Follow-up</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leads.map((l) => {
                const overdue =
                  l.nextFollowUpAt &&
                  l.nextFollowUpAt < now &&
                  !["CONVERTED", "LOST", "NOT_INTERESTED"].includes(l.status);
                return (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="td">
                      <Link href={`/sales/leads/${l.id}`} className="font-medium text-brand-600 hover:underline">
                        {l.leadNumber}
                      </Link>
                    </td>
                    <td className="td">
                      <div className="font-medium">{l.name}</div>
                      {l.company && <div className="text-xs text-slate-500">{l.company}</div>}
                    </td>
                    <td className="td whitespace-nowrap">{l.phone}</td>
                    <td className="td text-xs">
                      {l.campaign ? l.campaign.name : statusLabel(l.source)}
                    </td>
                    <td className="td text-xs">{l.interestPackage?.name ?? "-"}</td>
                    <td className="td">
                      {l.salesOwner ? (
                        l.salesOwner.name
                      ) : (
                        <span className="font-medium text-amber-600">Belum ada</span>
                      )}
                    </td>
                    <td className={`td whitespace-nowrap text-xs ${overdue ? "font-medium text-red-600" : "text-slate-500"}`}>
                      {l.nextFollowUpAt ? formatDateTime(l.nextFollowUpAt) : "-"}
                    </td>
                    <td className="td"><Badge value={l.status} label={statusLabel(l.status)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {salesOwners.length === 0 && (
        <p className="mt-3 text-xs text-slate-400">Belum ada user aktif untuk di-assign.</p>
      )}
    </div>
  );
}
