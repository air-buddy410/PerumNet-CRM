import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, CHANGE_TYPES, statusLabel, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";

export const metadata = { title: "Network Changes" };

export default async function ChangesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; type?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.NOC_VIEW);
  const sp = await searchParams;

  const changes = await db.changeRequest.findMany({
    where: sp.type ? { changeType: sp.type } : undefined,
    include: { pic: true, createdBy: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <PageHeader
        title="Network Change Management"
        subtitle="Setiap perubahan memerlukan rencana rollback dan persetujuan; perubahan darurat wajib ditinjau setelah pelaksanaan."
        action={
          user.permissions.has(PERMISSIONS.CHANGES_CREATE) ? (
            <Link href="/noc/changes/new" className="btn-primary">+ Change Request</Link>
          ) : undefined
        }
      />
      <Flash ok={sp.ok} error={sp.error} />

      <form method="GET" className="mb-4 flex items-end gap-3">
        <div>
          <label className="label" htmlFor="type">Jenis</label>
          <select id="type" name="type" className="input w-44" defaultValue={sp.type ?? ""}>
            <option value="">Semua jenis</option>
            {CHANGE_TYPES.map((t) => (
              <option key={t} value={t}>{statusLabel(t)}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        {changes.length === 0 ? (
          <EmptyState message="Belum ada change request." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Nomor</th>
                <th className="th">Judul</th>
                <th className="th">Jenis</th>
                <th className="th">PIC</th>
                <th className="th">Window</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {changes.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="td whitespace-nowrap">
                    <Link href={`/noc/changes/${c.id}`} className="font-medium text-brand-600 hover:underline">
                      {c.changeNumber}
                    </Link>
                  </td>
                  <td className="td max-w-56 truncate">{c.title}</td>
                  <td className="td">
                    <Badge
                      value={c.changeType === "EMERGENCY" ? "REJECTED" : c.changeType === "MAJOR" ? "PENDING" : "APPROVED"}
                      label={statusLabel(c.changeType)}
                    />
                  </td>
                  <td className="td text-xs">{c.pic.name}</td>
                  <td className="td whitespace-nowrap text-xs">
                    {c.windowStart ? formatDateTime(c.windowStart) : "-"}
                  </td>
                  <td className="td"><Badge value={c.status} label={statusLabel(c.status)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
