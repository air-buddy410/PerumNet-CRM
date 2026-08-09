import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  SUBSCRIPTION_STATUSES,
  statusLabel,
  formatRupiah,
  formatDateTime,
} from "@/lib/constants";
import { PageHeader, Badge, EmptyState, Flash } from "@/components/ui";

export const metadata = { title: "Subscriptions" };

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; status?: string }>;
}) {
  await requirePermission(PERMISSIONS.SUBSCRIPTIONS_VIEW);
  const sp = await searchParams;

  const subscriptions = await db.subscription.findMany({
    where: sp.status ? { status: sp.status } : undefined,
    include: { customer: true, package: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <PageHeader
        title="Subscriptions"
        subtitle="Aktivasi layanan hanya oleh pemegang izin aktivasi — bukan Sales (business rule 17)."
      />
      <Flash ok={sp.ok} error={sp.error} />

      <form method="GET" className="mb-4 flex items-end gap-3">
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" className="input w-56" defaultValue={sp.status ?? ""}>
            <option value="">Semua status</option>
            {SUBSCRIPTION_STATUSES.map((s) => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        {subscriptions.length === 0 ? (
          <EmptyState message="Belum ada subscription." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Service ID</th>
                <th className="th">Customer</th>
                <th className="th">Paket</th>
                <th className="th">Harga/bln</th>
                <th className="th">PPPoE</th>
                <th className="th">Aktivasi</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {subscriptions.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="td">
                    <Link
                      href={`/crm/subscriptions/${s.id}`}
                      className="font-medium text-brand-600 hover:underline"
                    >
                      {s.serviceNumber}
                    </Link>
                  </td>
                  <td className="td">{s.customer.name}</td>
                  <td className="td text-xs">
                    {s.package.name} ({s.downloadMbps}/{s.uploadMbps} Mbps)
                  </td>
                  <td className="td whitespace-nowrap">{formatRupiah(s.monthlyPrice)}</td>
                  <td className="td text-xs">{s.pppoeUsername ?? "-"}</td>
                  <td className="td whitespace-nowrap text-xs">
                    {s.activatedAt ? formatDateTime(s.activatedAt) : "-"}
                  </td>
                  <td className="td">
                    <Badge value={s.status} label={statusLabel(s.status)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
