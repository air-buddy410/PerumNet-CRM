import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, statusLabel, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { runJobsAction, retryJobAction } from "./actions";

export const metadata = { title: "Antrian Router" };

export default async function AccessJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.NOC_VIEW);
  const sp = await searchParams;
  const canRun = user.permissions.has(PERMISSIONS.NET_INVENTORY_MANAGE);

  const jobs = await db.networkAccessJob.findMany({
    include: {
      subscription: { include: { customer: true } },
      router: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const queued = jobs.filter((j) => j.status === "QUEUED").length;
  const failed = jobs.filter((j) => j.status === "FAILED").length;

  return (
    <div>
      <PageHeader
        title="Antrian Router (Access Jobs)"
        subtitle={`Perintah isolir/aktivasi ke MikroTik — auditable & retryable (§4). ${queued} antri · ${failed} gagal (sync failures dilacak sebagai state, bukan log).`}
        action={
          canRun ? (
            <form action={runJobsAction}>
              <button type="submit" className="btn-primary">Jalankan Antrian</button>
            </form>
          ) : undefined
        }
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="card overflow-x-auto">
        {jobs.length === 0 ? (
          <EmptyState message="Belum ada job." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Aksi</th>
                <th className="th">Layanan</th>
                <th className="th">Router</th>
                <th className="th">Percobaan</th>
                <th className="th">Dieksekusi</th>
                <th className="th">Error Terakhir</th>
                <th className="th">Status</th>
                {canRun && <th className="th"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.map((j) => (
                <tr key={j.id} className={j.status === "FAILED" ? "bg-red-50/40" : "hover:bg-slate-50"}>
                  <td className="td whitespace-nowrap text-xs font-medium">{statusLabel(j.action)}</td>
                  <td className="td whitespace-nowrap text-xs">
                    {j.subscription
                      ? `${j.subscription.serviceNumber} · ${j.subscription.customer.name}`
                      : "-"}
                  </td>
                  <td className="td whitespace-nowrap font-mono text-xs">{j.router?.hostname ?? "-"}</td>
                  <td className="td text-xs">{j.attempts}</td>
                  <td className="td whitespace-nowrap text-xs">
                    {j.executedAt ? formatDateTime(j.executedAt) : "-"}
                  </td>
                  <td className="td max-w-64 text-xs text-red-600">
                    <span className="block truncate" title={j.lastError ?? ""}>{j.lastError ?? "-"}</span>
                  </td>
                  <td className="td"><Badge value={j.status} label={statusLabel(j.status)} /></td>
                  {canRun && (
                    <td className="td text-right text-xs">
                      {j.status === "FAILED" && (
                        <form action={retryJobAction} className="inline">
                          <input type="hidden" name="jobId" value={j.id} />
                          <button type="submit" className="text-brand-600 hover:underline">Ulangi</button>
                        </form>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Adapter MikroTik live menunggu kredensial router (§11.7) — sampai tersambung, eksekusi
        akan gagal dengan pesan jelas dan bisa diulang setelah adapter aktif.
      </p>
    </div>
  );
}
