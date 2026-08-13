import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatDateTime } from "@/lib/constants";
import { PageHeader, Badge, EmptyState, Flash } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams } from "@/components/table-controls";
import { LEASE_TIMEOUT_MS } from "@/lib/scheduler";
import { toggleTaskAction, setIntervalAction } from "./actions";

export const metadata = { title: "Pekerjaan Berkala" };

export const revalidate = 15;

// Fase 27 — halaman pemantau penjadwal. Tidak menjalankan pekerjaan apa pun;
// eksekusi hanya terjadi di worker terpisah (scripts/worker.ts).
export default async function SchedulerPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  await requirePermission(PERMISSIONS.MASTER_DATA_MANAGE);
  const sp = await searchParams;
  const tableOptions = [
    { value: "code", label: "Kode" },
    { value: "name", label: "Tugas" },
    { value: "lastStatus", label: "Hasil" },
  ] as const;
  const table = parseTableQuery(sp, { defaultSort: "code", defaultDirection: "asc", sortOptions: tableOptions });
  const orderBy: Prisma.ScheduledTaskOrderByWithRelationInput[] = [
    { [table.sort]: table.direction },
    { id: "asc" },
  ];

  const [tasks, taskTotal, enabledCount, failingCount, stuckCount, recentRuns] = await Promise.all([
    db.scheduledTask.findMany({
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.scheduledTask.count(),
    db.scheduledTask.count({ where: { isEnabled: true } }),
    db.scheduledTask.count({ where: { lastStatus: "FAILED" } }),
    db.scheduledTask.count({ where: { lockedAt: { not: null } } }),
    db.scheduledTaskRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 20,
      include: { task: { select: { code: true } } },
    }),
  ]);

  const now = Date.now();
  const enabled = tasks.filter((t) => t.isEnabled);
  // Worker dianggap hidup bila ada tugas yang jalan belakangan ini.
  const lastActivity = tasks.reduce<Date | null>(
    (acc, t) => (t.lastRunAt && (!acc || t.lastRunAt > acc) ? t.lastRunAt : acc),
    null
  );
  const workerLooksDead =
    enabled.length > 0 &&
    (!lastActivity || now - lastActivity.getTime() > 15 * 60 * 1000);
  const stuck = tasks.filter(
    (t) => t.lockedAt && now - t.lockedAt.getTime() > LEASE_TIMEOUT_MS
  );
  const failing = tasks.filter((t) => t.lastStatus === "FAILED");

  return (
    <div>
      <PageHeader
        title="Pekerjaan Berkala"
        subtitle={`${enabledCount} dari ${taskTotal} tugas aktif. Eksekusi dilakukan worker terpisah — halaman ini hanya memantau.`}
      />

      <Flash ok={table.query.ok} error={table.query.error} />

      {workerLooksDead && (
        <div className="card mb-4 border-l-4 border-red-500 p-4">
          <p className="text-sm font-medium text-red-700">
            Worker tampaknya tidak berjalan
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Ada tugas aktif tetapi tidak ada yang berjalan dalam 15 menit terakhir.
            Jalankan <code>npm run worker</code> di server. Selama worker mati,
            tagihan tidak dievaluasi, probe tidak memeriksa, dan pesan menunggu
            di antrian.
          </p>
        </div>
      )}

      {stuck.length > 0 && (
        <div className="card mb-4 border-l-4 border-amber-500 p-4">
          <p className="text-sm font-medium text-amber-700">
            {stuckCount} tugas terkunci melewati batas sewa
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Worker yang memegangnya diduga mati. Kuncinya akan direbut worker
            berikutnya secara otomatis — tidak perlu tindakan manual.
          </p>
        </div>
      )}

      {failing.length > 0 && (
        <div className="card mb-4 border-l-4 border-red-400 p-4">
          <p className="mb-1 text-sm font-medium text-red-700">
            {failingCount} tugas gagal pada eksekusi terakhir
          </p>
          <ul className="space-y-0.5 text-xs text-slate-600">
            {failing.slice(0, 3).map((t) => (
              <li key={t.id}>
                <span className="font-mono">{t.code}</span> — {t.lastError}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card mb-6 overflow-x-auto">
        {tasks.length === 0 ? (
          <EmptyState message="Daftar tugas belum terisi — jalankan worker sekali untuk mendaftarkannya." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th"><SortableTableHeader basePath="/settings/scheduler" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="name" label="Tugas" /></th>
                <th className="th text-right">Interval</th>
                <th className="th">Terakhir</th>
                <th className="th"><SortableTableHeader basePath="/settings/scheduler" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="lastStatus" label="Hasil" /></th>
                <th className="th text-right">Jalan / Gagal</th>
                <th className="th">Aktif</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tasks.map((t) => (
                <tr key={t.id} className={t.lastStatus === "FAILED" ? "bg-red-50/40" : "hover:bg-slate-50"}>
                  <td className="td">
                    <span className="font-medium">{t.name}</span>
                    <br />
                    <span className="font-mono text-xs text-slate-400">{t.code}</span>
                  </td>
                  <td className="td text-right">
                    <form action={setIntervalAction} className="flex items-center justify-end gap-1">
                      <input type="hidden" name="taskId" value={t.id} />
                      <input
                        type="number"
                        name="intervalSec"
                        min={30}
                        max={86400}
                        defaultValue={t.intervalSec}
                        className="input w-24 text-right"
                        aria-label={`Interval ${t.code}`}
                      />
                      <button type="submit" className="btn-secondary text-xs">detik</button>
                    </form>
                  </td>
                  <td className="td text-xs text-slate-500">
                    {t.lastRunAt ? formatDateTime(t.lastRunAt) : "belum pernah"}
                    {t.lastDurationMs !== null ? ` · ${t.lastDurationMs}ms` : ""}
                  </td>
                  <td className="td text-xs">
                    {t.lastStatus ? (
                      <span className={t.lastStatus === "FAILED" ? "text-red-600" : "text-emerald-600"}>
                        {t.lastStatus}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="td text-right text-xs text-slate-500">
                    {t.runCount} / <span className={t.failCount > 0 ? "text-red-600" : ""}>{t.failCount}</span>
                  </td>
                  <td className="td">
                    <form action={toggleTaskAction}>
                      <input type="hidden" name="taskId" value={t.id} />
                      <button type="submit" className={t.isEnabled ? "btn-danger text-xs" : "btn-primary text-xs"}>
                        {t.isEnabled ? "Matikan" : "Aktifkan"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
          <TableControls
            basePath="/settings/scheduler"
            query={table.query}
            page={table.page}
            pageSize={table.pageSize}
            sort={table.sort}
            direction={table.direction}
            sortOptions={tableOptions}
            total={taskTotal}
          />
        </div>

      <h2 className="mb-3 text-sm font-medium">Riwayat Eksekusi</h2>
      <div className="card overflow-x-auto">
        {recentRuns.length === 0 ? (
          <EmptyState message="Belum ada eksekusi tercatat." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Waktu</th>
                <th className="th">Tugas</th>
                <th className="th">Worker</th>
                <th className="th">Status</th>
                <th className="th">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentRuns.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="td text-xs">{formatDateTime(r.startedAt)}</td>
                  <td className="td font-mono text-xs">{r.task.code}</td>
                  <td className="td font-mono text-xs text-slate-400">{r.workerId}</td>
                  <td className="td text-xs">
                    <Badge value={r.status} />
                  </td>
                  <td className="td text-xs text-slate-600">{r.error ?? r.detail ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
