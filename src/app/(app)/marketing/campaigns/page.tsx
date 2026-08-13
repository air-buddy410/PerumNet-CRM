import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatRupiah, statusLabel } from "@/lib/constants";
import { PageHeader, Badge, EmptyState, Flash } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams, type TableSortOption } from "@/components/table-controls";
import { formatUiDate } from "@/components/ui-formatters";

export const metadata = { title: "Campaigns" };
const sortOptions: readonly TableSortOption[] = [
  { value: "createdAt", label: "Terbaru" },
  { value: "campaignNumber", label: "Nomor" },
  { value: "name", label: "Nama" },
  { value: "status", label: "Status" },
];

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  const user = await requirePermission(PERMISSIONS.CAMPAIGNS_VIEW);
  const sp = await searchParams;
  const table = parseTableQuery(sp, { defaultSort: "createdAt", defaultDirection: "desc", sortOptions });
  const orderBy: Prisma.CampaignOrderByWithRelationInput[] = table.sort === "campaignNumber"
    ? [{ campaignNumber: table.direction }, { id: "asc" }]
    : table.sort === "name"
      ? [{ name: table.direction }, { id: "asc" }]
      : table.sort === "status"
        ? [{ status: table.direction }, { id: "asc" }]
        : [{ createdAt: table.direction }, { id: "asc" }];

  const [campaigns, total] = await Promise.all([
    db.campaign.findMany({
      include: { pic: true, area: true, _count: { select: { leads: true } } },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.campaign.count(),
  ]);

  return (
    <div>
      <PageHeader
        title="Marketing Campaigns"
        subtitle="Pantau perjalanan campaign dari lead hingga menjadi pelanggan."
        action={
          user.permissions.has(PERMISSIONS.CAMPAIGNS_MANAGE) ? (
            <Link href="/marketing/campaigns/new" className="btn-primary">+ Campaign</Link>
          ) : undefined
        }
      />
      <Flash ok={table.query.ok} error={table.query.error} />
      <div className="card overflow-x-auto">
        {campaigns.length === 0 ? (
          <EmptyState message="Belum ada campaign." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th"><SortableTableHeader basePath="/marketing/campaigns" currentDirection={table.direction} currentSort={table.sort} label="Nomor" query={table.query} sortKey="campaignNumber" /></th>
                <th className="th"><SortableTableHeader basePath="/marketing/campaigns" currentDirection={table.direction} currentSort={table.sort} label="Nama" query={table.query} sortKey="name" /></th>
                <th className="th">Channel</th>
                <th className="th">Periode</th>
                <th className="th">Budget</th>
                <th className="th">Lead (aktual/target)</th>
                <th className="th">Cost/Lead</th>
                <th className="th">PIC</th>
                <th className="th"><SortableTableHeader basePath="/marketing/campaigns" currentDirection={table.direction} currentSort={table.sort} label="Status" query={table.query} sortKey="status" /></th>
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
                    {formatUiDate(c.startDate, "-")} — {formatUiDate(c.endDate, "-")}
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
      <TableControls basePath="/marketing/campaigns" direction={table.direction} page={table.page} pageSize={table.pageSize} query={table.query} sort={table.sort} sortOptions={sortOptions} total={total} />
    </div>
  );
}
