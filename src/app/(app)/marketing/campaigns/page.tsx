import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatRupiah, statusLabel } from "@/lib/constants";
import { PageHeader, Badge, EmptyState, Flash } from "@/components/ui";

export const metadata = { title: "Campaigns" };

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.CAMPAIGNS_VIEW);
  const sp = await searchParams;

  const campaigns = await db.campaign.findMany({
    include: { pic: true, area: true, _count: { select: { leads: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Marketing Campaigns"
        subtitle="Campaign → Lead → Sales Assignment → Opportunity → Customer (PRD §8)"
        action={
          user.permissions.has(PERMISSIONS.CAMPAIGNS_MANAGE) ? (
            <Link href="/marketing/campaigns/new" className="btn-primary">+ Campaign</Link>
          ) : undefined
        }
      />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="card overflow-x-auto">
        {campaigns.length === 0 ? (
          <EmptyState message="Belum ada campaign." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Nomor</th>
                <th className="th">Nama</th>
                <th className="th">Channel</th>
                <th className="th">Periode</th>
                <th className="th">Budget</th>
                <th className="th">Lead (aktual/target)</th>
                <th className="th">Cost/Lead</th>
                <th className="th">PIC</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {campaigns.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="td">
                    <Link href={`/marketing/campaigns/${c.id}`} className="font-medium text-brand-600 hover:underline">
                      {c.campaignNumber}
                    </Link>
                  </td>
                  <td className="td">{c.name}</td>
                  <td className="td">{c.channel}</td>
                  <td className="td whitespace-nowrap text-xs text-slate-500">
                    {c.startDate ? c.startDate.toLocaleDateString("id-ID") : "-"} — {c.endDate ? c.endDate.toLocaleDateString("id-ID") : "-"}
                  </td>
                  <td className="td">{formatRupiah(c.budget)}</td>
                  <td className="td">{c._count.leads} / {c.targetLeads}</td>
                  <td className="td">
                    {c._count.leads > 0 ? formatRupiah(c.budget / BigInt(c._count.leads)) : "-"}
                  </td>
                  <td className="td">{c.pic?.name ?? "-"}</td>
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
