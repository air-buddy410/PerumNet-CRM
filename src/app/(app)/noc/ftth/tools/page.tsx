import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { calculateSubnet, calculateBurst } from "@/lib/ftth";
import { PageHeader, BackLink } from "@/components/ui";

export const metadata = { title: "Tools Teknis" };

// Tools murni utilitas (gap G21) — tanpa dampak data, dihitung server-side
// dari query string sehingga tetap Server Component.
export default async function FtthToolsPage({
  searchParams,
}: {
  searchParams: Promise<{ cidr?: string; mbps?: string; burstTime?: string }>;
}) {
  await requirePermission(PERMISSIONS.NOC_VIEW);
  const sp = await searchParams;
  const cidr = sp.cidr ?? "";
  const subnet = cidr ? calculateSubnet(cidr) : null;
  const mbps = sp.mbps ? Number(sp.mbps) : NaN;
  const burstTime = sp.burstTime ? Number(sp.burstTime) : 8;
  const burst = Number.isFinite(mbps) ? calculateBurst(mbps, burstTime) : null;

  return (
    <div className="max-w-3xl">
      <BackLink href="/noc/ftth" label="Kembali ke FTTH" />
      <PageHeader
        title="Tools Teknis"
        subtitle="IP calculator & MikroTik burst calculator (gap G21). Untuk pengelolaan alokasi IP sesungguhnya, gunakan IPAM."
      />

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="card p-6">
          <h2 className="mb-3 font-medium">IP / Subnet Calculator</h2>
          <form method="GET" className="mb-4 flex gap-2">
            <input name="cidr" className="input" placeholder="10.10.0.0/24" defaultValue={cidr} required />
            {sp.mbps && <input type="hidden" name="mbps" value={sp.mbps} />}
            <button type="submit" className="btn-secondary">Hitung</button>
          </form>
          {cidr && !subnet && (
            <p className="text-sm text-red-600">Format CIDR tidak valid (contoh: 10.10.0.0/24).</p>
          )}
          {subnet && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-slate-500">Network</dt>
              <dd className="font-mono">{subnet.network}/{subnet.prefix}</dd>
              <dt className="text-slate-500">Netmask</dt>
              <dd className="font-mono">{subnet.netmask}</dd>
              <dt className="text-slate-500">Wildcard</dt>
              <dd className="font-mono">{subnet.wildcard}</dd>
              <dt className="text-slate-500">Broadcast</dt>
              <dd className="font-mono">{subnet.broadcast}</dd>
              <dt className="text-slate-500">Host pertama</dt>
              <dd className="font-mono">{subnet.firstHost}</dd>
              <dt className="text-slate-500">Host terakhir</dt>
              <dd className="font-mono">{subnet.lastHost}</dd>
              <dt className="text-slate-500">Total alamat</dt>
              <dd>{subnet.totalHosts.toLocaleString("id-ID")}</dd>
              <dt className="text-slate-500">Host usable</dt>
              <dd className="font-semibold">{subnet.usableHosts.toLocaleString("id-ID")}</dd>
            </dl>
          )}
        </div>

        <div className="card p-6">
          <h2 className="mb-3 font-medium">MikroTik Burst Calculator</h2>
          <form method="GET" className="mb-4 flex flex-wrap gap-2">
            {sp.cidr && <input type="hidden" name="cidr" value={sp.cidr} />}
            <input name="mbps" type="number" step="0.1" min={0.1} className="input w-28" placeholder="Mbps" defaultValue={sp.mbps ?? ""} required />
            <input name="burstTime" type="number" min={1} max={60} className="input w-24" placeholder="detik" defaultValue={sp.burstTime ?? 8} />
            <button type="submit" className="btn-secondary">Hitung</button>
          </form>
          {sp.mbps && !burst && (
            <p className="text-sm text-red-600">Nilai tidak valid (limit 0,1–10000 Mbps, burst time 1–60 detik).</p>
          )}
          {burst && (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <dt className="text-slate-500">Limit-at</dt>
                <dd>{burst.limitAt} Mbps</dd>
                <dt className="text-slate-500">Burst limit (2×)</dt>
                <dd>{burst.burstLimit} Mbps</dd>
                <dt className="text-slate-500">Burst threshold (75%)</dt>
                <dd>{burst.burstThreshold} Mbps</dd>
                <dt className="text-slate-500">Burst time</dt>
                <dd>{burst.burstTime} detik</dd>
              </dl>
              <p className="mt-3 text-xs text-slate-500">Queue (max-limit / burst-limit / burst-threshold / burst-time):</p>
              <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs">{burst.queueString}</pre>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
