import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatDateTime } from "@/lib/constants";
import { PageHeader, Badge, EmptyState, Flash } from "@/components/ui";
import { pppoeSummary } from "@/lib/pppoe-monitor";

export const metadata = { title: "Monitor PPPoE" };

const STATUS_TONE: Record<string, string> = {
  ONLINE: "text-emerald-600",
  OFFLINE: "text-red-600",
  DISABLED: "text-slate-500",
};

// Fase 24 (PRD-NOC-TOOLS N2) — halaman ini MURNI BACA.
// Tidak ada satu pun tombol yang menulis ke router; perintah yang mengubah
// layanan pelanggan tetap lewat NetworkAccessJob (Fase 10).
export default async function PppoeMonitorPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; ok?: string; error?: string }>;
}) {
  await requirePermission(PERMISSIONS.NOC_VIEW);
  const sp = await searchParams;

  const summary = await pppoeSummary();
  const sessions = await db.pppoeSession.findMany({
    where: {
      ...(sp.status ? { status: sp.status } : {}),
      ...(sp.q ? { username: { contains: sp.q, mode: "insensitive" as const } } : {}),
    },
    include: {
      router: { include: { networkDevice: { select: { hostname: true } } } },
      subscription: {
        select: { serviceNumber: true, customer: { select: { name: true } } },
      },
    },
    orderBy: [{ status: "asc" }, { username: "asc" }],
    take: 300,
  });

  const unmatched = sessions.filter((s) => !s.subscriptionId).length;
  const failedRuns = summary.lastRuns.filter((r) => r.status === "FAILED");

  return (
    <div>
      <PageHeader
        title="Monitor PPPoE"
        subtitle={`Keadaan terakhir yang ditarik dari router. Halaman ini hanya membaca — tidak ada aksi yang menyentuh perangkat.`}
        action={
          <a href="/api/export/pppoe" className="btn-secondary">
            Unduh CSV
          </a>
        }
      />

      <Flash ok={sp.ok} error={sp.error} />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        {[
          { label: "Total", value: summary.total, tone: "" },
          { label: "Aktif", value: summary.online, tone: STATUS_TONE.ONLINE },
          { label: "Offline", value: summary.offline, tone: STATUS_TONE.OFFLINE },
          { label: "Disable", value: summary.disabled, tone: STATUS_TONE.DISABLED },
        ].map((c) => (
          <div key={c.label} className="card p-4">
            <p className="text-xs text-slate-500">{c.label}</p>
            <p className={`text-2xl font-semibold ${c.tone}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {failedRuns.length > 0 && (
        <div className="card mb-4 border-l-4 border-red-500 p-4">
          <h2 className="mb-1 text-sm font-medium text-red-700">
            {failedRuns.length} penarikan data gagal
          </h2>
          <ul className="space-y-1 text-xs text-slate-600">
            {failedRuns.slice(0, 3).map((r) => (
              <li key={r.id}>
                {r.router.networkDevice.hostname} · {formatDateTime(r.startedAt)} — {r.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card mb-4 p-4">
        <h2 className="mb-3 text-sm font-medium">Router</h2>
        {summary.routers.length === 0 ? (
          <EmptyState message="Belum ada router terdaftar. Tambahkan lewat NOC → Perangkat, lalu lengkapi profil MikroTik-nya." />
        ) : (
          <ul className="space-y-2 text-xs">
            {summary.routers.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{r.networkDevice.hostname}</span>
                <span className="text-slate-500">
                  {r.managementUrl} · tiap {r.pollIntervalSec}s ·{" "}
                  {r.lastPolledAt ? `terakhir ${formatDateTime(r.lastPolledAt)}` : "belum pernah ditarik"}
                </span>
                <Badge value={r.isPollingEnabled ? "AKTIF" : "NONAKTIF"} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <form method="get" className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={sp.status ?? ""} className="input">
            <option value="">Semua</option>
            <option value="ONLINE">Aktif</option>
            <option value="OFFLINE">Offline</option>
            <option value="DISABLED">Disable</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="q">Cari username</label>
          <input id="q" type="search" name="q" defaultValue={sp.q ?? ""} className="input" />
        </div>
        <button type="submit" className="btn-primary">Terapkan</button>
      </form>

      <div className="card overflow-x-auto">
        {sessions.length === 0 ? (
          <EmptyState message="Belum ada data sesi. Jalankan penarikan data dari router terlebih dahulu." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Username</th>
                <th className="th">Pelanggan</th>
                <th className="th">Router</th>
                <th className="th">Status</th>
                <th className="th">IP</th>
                <th className="th">MAC</th>
                <th className="th text-right">Uptime</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessions.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="td font-mono text-xs">{s.username}</td>
                  <td className="td text-xs">
                    {s.subscription
                      ? `${s.subscription.customer.name} (${s.subscription.serviceNumber})`
                      : <span className="text-amber-600">belum tertaut</span>}
                  </td>
                  <td className="td text-xs">{s.router.networkDevice.hostname}</td>
                  <td className={`td text-xs font-medium ${STATUS_TONE[s.status] ?? ""}`}>
                    {s.status}
                  </td>
                  <td className="td font-mono text-xs">{s.address ?? "—"}</td>
                  <td className="td font-mono text-xs">{s.callerId ?? "—"}</td>
                  <td className="td text-right text-xs">
                    {s.uptimeSeconds !== null
                      ? `${Math.floor(s.uptimeSeconds / 3600)}j ${Math.floor((s.uptimeSeconds % 3600) / 60)}m`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {unmatched > 0 && (
        <p className="mt-3 text-xs text-amber-600">
          {unmatched} username tidak cocok dengan langganan manapun — periksa
          `pppoeUsername` pada langganan terkait.
        </p>
      )}
    </div>
  );
}
