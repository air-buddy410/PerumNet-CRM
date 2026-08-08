import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { PageHeader, Flash, BackLink } from "@/components/ui";
import { CampaignForm } from "../campaign-form";

export const metadata = { title: "Campaign Baru" };

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePermission(PERMISSIONS.CAMPAIGNS_MANAGE);
  const sp = await searchParams;
  const [areas, users] = await Promise.all([
    db.area.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="max-w-2xl">
      <BackLink href="/marketing/campaigns" label="Kembali ke daftar campaign" />
      <PageHeader title="Campaign Baru" />
      <Flash error={sp.error} />
      <CampaignForm areas={areas} users={users} />
    </div>
  );
}
