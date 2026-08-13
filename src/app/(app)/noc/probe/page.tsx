import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatDateTime } from "@/lib/constants";
import { PageHeader, EmptyState, Flash } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams } from "@/components/table-controls";
import { NetworkMonitorControls } from "@/components/network-monitor-controls";

export const metadata = { title: "Network Monitor" };

// Auto-refresh 30 detik. Angka di layar adalah keadaan terakhir yang DITARIK
// worker, bukan pemeriksaan yang berjalan saat halaman dibuka — halaman ini
// tidak pernah menyentuh perangkat.
export const revalidate = 30;

const STATUS_TONE: Record<string, string> = {
  UP: "text-emerald-600",
  DOWN: "text-red-600",
};

export default async function ProbePage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  await requirePermission(PERMISSIONS.NOC_VIEW);
  const sp = await searchParams;
  const tableOptions = [
    { value: "name", label: "Target" },
    { value: "lastStatus", label: "Status" },
    { value: "lastCheckedAt", label: "Diperiksa" },
  ] as const;
  const table = parseTableQuery(sp, { defaultSort: "lastStatus", sortOptions: tableOptions });
  const targetWhere: Prisma.ProbeTargetWhereInput = {
    isActive: true,
    ...(table.query.status === "DOWN" ? { lastStatus: "DOWN" } : {}),
    ...(table.query.status === "UP" ? { lastStatus: "UP" } : {}),
    ...(table.query.status === "UNKNOWN" ? { lastStatus: null } : {}),
  };
  const orderBy: Prisma.ProbeTargetOrderByWithRelationInput[] = [
    { [table.sort]: table.direction },
    { id: "asc" },
  ];

  const [targets, totalCount] = await Promise.all([
    db.probeTarget.findMany({
      where: targetWhere,
      include: {
        networkDevice: { select: { hostname: true } },
        site: { select: { name: true } },
        results: { orderBy: { checkedAt: "desc" }, take: 1 },
      },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.probeTarget.count({ where: targetWhere }),
  ]);

  const all = await db.probeTarget.groupBy({
    by: ["lastStatus"],
    where: { isActive: true },
    _count: { _all: true },
  });
  const countOf = (s: string | null) =>
    all.find((a) => a.lastStatus === s)?._count._all ?? 0;

  const down = countOf("DOWN");
  const up = countOf("UP");
  const unknown = countOf(null);
  const refreshedAt = new Date().toISOString();

  const stale = targets.filter(
    (t) =>
      t.lastCheckedAt &&
      Date.now() - t.lastCheckedAt.getTime() > t.intervalSec * 1000 * 3
  );

  return (
    <div>
      <PageHeader
        title="Network Monitor"
        subtitle="Keterjangkauan target diukur worker lewat koneksi TCP. Halaman ini hanya menampilkan hasil — tidak ada aksi yang menyentuh perangkat."
      />

      <Flash ok={table.query.ok} error={table.query.error} />

      <div className="mb-4 flex min-w-0 justify-end">
        <NetworkMonitorControls downCount={down} updatedAt={refreshedAt} />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        {[
          { label: "Total", value: up + down + unknown, tone: "", href: "/noc/probe" },
          { label: "Online", value: up, tone: STATUS_TONE.UP, href: "/noc/probe?status=UP" },
          { label: "Down", value: down, tone: STATUS_TONE.DOWN, href: "/noc/probe?status=DOWN" },
          { label: "Belum diperiksa", value: unknown, tone: "text-slate-500", href: "/noc/probe?status=UNKNOWN" },
        ].map((c) => (
          <a key={c.label} href={c.href} className="card p-4 hover:bg-slate-50">
            <p className="text-xs text-slate-500">{c.label}</p>
            <p className={`text-2xl font-semibold ${c.tone}`}>{c.value}</p>
          </a>
        ))}
      </div>

      {down > 0 && (
        <div className="card mb-4 border-l-4 border-red-500 p-4">
          <p className="text-sm font-medium text-red-700">
            {down} target tidak terjangkau
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Alarm otomatis dinaikkan setelah gagal berturut-turut mencapai ambang
            tiap target, dan ditutup sendiri saat pulih.
          </p>
        </div>
      )}

      {stale.length > 0 && (
        <div className="card mb-4 border-l-4 border-amber-500 p-4">
          <p className="text-sm font-medium text-amber-700">
            {stale.length} target sudah lama tidak diperiksa
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Kemungkinan worker probe tidak berjalan — angka di bawah bisa jadi basi.
          </p>
        </div>
      )}

      <div className="card overflow-x-auto">
        {targets.length === 0 ? (
          <EmptyState message="Belum ada target monitoring." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th"><SortableTableHeader basePath="/noc/probe" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="name" label="Target" /></th>
                <th className="th">Alamat</th>
                <th className="th">Perangkat / Site</th>
                <th className="th"><SortableTableHeader basePath="/noc/probe" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="lastStatus" label="Status" /></th>
                <th className="th text-right">Latensi</th>
                <th className="th text-right">Gagal beruntun</th>
                <th className="th"><SortableTableHeader basePath="/noc/probe" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="lastCheckedAt" label="Diperiksa" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {targets.map((t) => (
                <tr key={t.id} className={t.lastStatus === "DOWN" ? "bg-red-50/50" : "hover:bg-slate-50"}>
                  <td className="td font-medium">{t.name}</td>
                  <td className="td font-mono text-xs">
                    {t.address}:{t.port}
                  </td>
                  <td className="td text-xs text-slate-500">
                    {t.networkDevice?.hostname ?? t.site?.name ?? "—"}
                  </td>
                  <td className={`td text-xs font-medium ${STATUS_TONE[t.lastStatus ?? ""] ?? "text-slate-400"}`}>
                    {t.lastStatus ?? "BELUM"}
                  </td>
                  <td className="td text-right text-xs">
                    {t.lastLatencyMs !== null ? `${t.lastLatencyMs} ms` : "—"}
                  </td>
                  <td className={`td text-right text-xs ${t.consecutiveFails > 0 ? "text-red-600" : "text-slate-400"}`}>
                    {t.consecutiveFails}/{t.failThreshold}
                  </td>
                  <td className="td text-xs text-slate-500">
                    {t.lastCheckedAt ? formatDateTime(t.lastCheckedAt) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
          <TableControls
            basePath="/noc/probe"
            query={table.query}
            page={table.page}
            pageSize={table.pageSize}
            sort={table.sort}
            direction={table.direction}
            sortOptions={tableOptions}
            total={totalCount}
          />
        </div>

      <p className="mt-3 text-xs text-slate-500">
        Metode TCP connect — target yang hidup tetapi portnya tertutup akan
        terbaca DOWN. Sesuaikan port per target bila perlu.
      </p>
    </div>
  );
}
