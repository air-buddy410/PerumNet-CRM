import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, statusLabel, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, BackLink, Badge, EmptyState } from "@/components/ui";
import { allocateIpAction, releaseIpAction } from "../actions";

export const metadata = { title: "Detail Subnet" };

export default async function SubnetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.NOC_VIEW);
  const { id } = await params;
  const sp = await searchParams;

  const subnet = await db.subnet.findUnique({
    where: { id },
    include: {
      site: true,
      owner: true,
      ips: {
        include: { device: true, subscription: { include: { customer: true } } },
        orderBy: { address: "asc" },
      },
    },
  });
  if (!subnet) notFound();

  const [netDevices, subscriptions] = await Promise.all([
    db.networkDevice.findMany({ orderBy: { hostname: "asc" } }),
    db.subscription.findMany({
      where: { status: { notIn: ["TERMINATED"] } },
      include: { customer: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const canManage = user.permissions.has(PERMISSIONS.IPAM_MANAGE);
  const activeIps = subnet.ips.filter((ip) => ip.status !== "RELEASED");

  return (
    <div className="max-w-4xl">
      <BackLink href="/noc/ipam" label="Kembali ke daftar subnet" />
      <PageHeader
        title={subnet.cidr}
        subtitle={`${subnet.name} · ${subnet.purpose}${subnet.vlan ? ` · VLAN ${subnet.vlan}` : ""}${subnet.site ? ` · ${subnet.site.siteCode}` : ""} · ${activeIps.length} IP aktif`}
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="card overflow-x-auto">
          {subnet.ips.length === 0 ? (
            <EmptyState message="Belum ada IP teralokasi." />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th">IP</th>
                  <th className="th">Tertaut ke</th>
                  <th className="th">Keterangan</th>
                  <th className="th">Status</th>
                  <th className="th">Sejak</th>
                  {canManage && <th className="th"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {subnet.ips.map((ip) => (
                  <tr key={ip.id} className="hover:bg-slate-50">
                    <td className="td font-mono text-xs font-semibold">{ip.address}</td>
                    <td className="td text-xs">
                      {ip.device
                        ? `Perangkat: ${ip.device.hostname}`
                        : ip.subscription
                          ? `Layanan: ${ip.subscription.serviceNumber} (${ip.subscription.customer.name})`
                          : "-"}
                    </td>
                    <td className="td text-xs">{ip.description ?? "-"}</td>
                    <td className="td">
                      <Badge
                        value={ip.status === "ALLOCATED" ? "APPROVED" : ip.status === "RESERVED" ? "PENDING" : "CANCELLED"}
                        label={statusLabel(ip.status)}
                      />
                    </td>
                    <td className="td whitespace-nowrap text-xs text-slate-500">
                      {formatDateTime(ip.assignedAt)}
                      {ip.releasedAt ? ` → dilepas ${formatDateTime(ip.releasedAt)}` : ""}
                    </td>
                    {canManage && (
                      <td className="td text-right text-xs">
                        {ip.status !== "RELEASED" && (
                          <form action={releaseIpAction} className="inline">
                            <input type="hidden" name="subnetId" value={subnet.id} />
                            <input type="hidden" name="ipId" value={ip.id} />
                            <button type="submit" className="text-red-600 hover:underline">
                              Lepas
                            </button>
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

        {canManage && (
          <div className="card h-fit p-5">
            <h2 className="mb-4 font-medium">Alokasikan IP</h2>
            <form action={allocateIpAction} className="space-y-3">
              <input type="hidden" name="subnetId" value={subnet.id} />
              <div>
                <label className="label" htmlFor="address">Alamat IP</label>
                <input id="address" name="address" className="input font-mono" placeholder="mis. 10.10.0.15" required />
              </div>
              <div>
                <label className="label" htmlFor="status">Status</label>
                <select id="status" name="status" className="input" defaultValue="ALLOCATED">
                  <option value="ALLOCATED">Teralokasi (wajib tertaut)</option>
                  <option value="RESERVED">Reserved</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="deviceId">Perangkat Jaringan</label>
                <select id="deviceId" name="deviceId" className="input" defaultValue="">
                  <option value="">— tidak —</option>
                  {netDevices.map((d) => (
                    <option key={d.id} value={d.id}>{d.hostname}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="subscriptionId">Subscription</label>
                <select id="subscriptionId" name="subscriptionId" className="input" defaultValue="">
                  <option value="">— tidak —</option>
                  {subscriptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.serviceNumber} — {s.customer.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="description">Keterangan</label>
                <input id="description" name="description" className="input" placeholder="wajib untuk Reserved" />
              </div>
              <button type="submit" className="btn-primary w-full justify-center">Alokasikan</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
