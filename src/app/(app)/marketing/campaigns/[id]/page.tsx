import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, statusLabel, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, BackLink, Badge, EmptyState } from "@/components/ui";
import { CampaignForm } from "../campaign-form";

export const metadata = { title: "Detail Campaign" };

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.CAMPAIGNS_VIEW);
  const { id } = await params;
  const sp = await searchParams;

  const [campaign, areas, users] = await Promise.all([
    db.campaign.findUnique({
      where: { id },
      include: {
        leads: { include: { salesOwner: true }, orderBy: { createdAt: "desc" } },
      },
    }),
    db.area.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);
  if (!campaign) notFound();

  return (
    <div className="max-w-4xl">
      <BackLink href="/marketing/campaigns" label="Kembali ke daftar campaign" />
      <PageHeader
        title={`${campaign.campaignNumber} — ${campaign.name}`}
        subtitle={`${campaign.leads.length} lead terkumpul`}
        action={<Badge value={campaign.status} label={statusLabel(campaign.status)} />}
      />
      <Flash ok={sp.ok} error={sp.error} />

      {user.permissions.has(PERMISSIONS.CAMPAIGNS_MANAGE) ? (
        <CampaignForm campaign={campaign} areas={areas} users={users} />
      ) : null}

      <div className="card mt-6">
        <div className="border-b border-slate-100 px-5 py-4 font-medium">
          Lead dari Campaign Ini
        </div>
        {campaign.leads.length === 0 ? (
          <EmptyState message="Belum ada lead." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Nomor</th>
                <th className="th">Nama</th>
                <th className="th">Sales Owner</th>
                <th className="th">Status</th>
                <th className="th">Dibuat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {campaign.leads.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="td">
                    <Link href={`/sales/leads/${l.id}`} className="font-medium text-brand-600 hover:underline">
                      {l.leadNumber}
                    </Link>
                  </td>
                  <td className="td">{l.name}</td>
                  <td className="td">{l.salesOwner?.name ?? <span className="text-red-500">Belum ada</span>}</td>
                  <td className="td"><Badge value={l.status} label={statusLabel(l.status)} /></td>
                  <td className="td text-xs text-slate-500">{formatDateTime(l.createdAt)}</td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
