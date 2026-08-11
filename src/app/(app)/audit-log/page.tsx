import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatDateTime } from "@/lib/constants";
import { PageHeader, EmptyState } from "@/components/ui";

export const metadata = { title: "Audit Log" };

const PAGE_SIZE = 50;

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string; action?: string; page?: string }>;
}) {
  await requirePermission(PERMISSIONS.AUDIT_LOG_VIEW);
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const where = {
    ...(sp.module ? { module: sp.module } : {}),
    ...(sp.action ? { action: sp.action } : {}),
  };

  const [logs, total, modules, actions] = await Promise.all([
    db.auditLog.findMany({
      where,
      include: { user: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.auditLog.count({ where }),
    db.auditLog.findMany({ distinct: ["module"], select: { module: true } }),
    db.auditLog.findMany({ distinct: ["action"], select: { action: true } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (p: number) => {
    const q = new URLSearchParams();
    if (sp.module) q.set("module", sp.module);
    if (sp.action) q.set("action", sp.action);
    q.set("page", String(p));
    return `/audit-log?${q.toString()}`;
  };

  return (
    <div>
      <PageHeader
        title="Audit Log"
        subtitle={`${total} entri · catatan audit hanya dapat ditambah dan tidak dapat diubah atau dihapus.`}
      />

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="module">Modul</label>
          <select id="module" name="module" className="input w-44" defaultValue={sp.module ?? ""}>
            <option value="">Semua</option>
            {modules.map((m) => (
              <option key={m.module} value={m.module}>{m.module}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="action">Aksi</label>
          <select id="action" name="action" className="input w-52" defaultValue={sp.action ?? ""}>
            <option value="">Semua</option>
            {actions.map((a) => (
              <option key={a.action} value={a.action}>{a.action}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        {logs.length === 0 ? (
          <EmptyState message="Belum ada entri audit." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Waktu</th>
                <th className="th">User</th>
                <th className="th">Aksi</th>
                <th className="th">Modul</th>
                <th className="th">Deskripsi</th>
                <th className="th">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="td whitespace-nowrap text-slate-500">
                    {formatDateTime(log.createdAt)}
                  </td>
                  <td className="td whitespace-nowrap">{log.user?.name ?? "—"}</td>
                  <td className="td">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
                      {log.action}
                    </span>
                  </td>
                  <td className="td">{log.module}</td>
                  <td className="td">{log.description}</td>
                  <td className="td whitespace-nowrap text-xs text-slate-400">
                    {log.ipAddress ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-slate-500">
            Halaman {page} dari {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <a href={qs(page - 1)} className="btn-secondary">Sebelumnya</a>
            )}
            {page < totalPages && (
              <a href={qs(page + 1)} className="btn-secondary">Berikutnya</a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
