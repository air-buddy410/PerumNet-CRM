"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS, CAMPAIGN_STATUSES } from "@/lib/constants";

const schema = z.object({
  name: z.string().min(3, "Nama campaign minimal 3 karakter"),
  channel: z.string().min(1, "Pilih channel"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  budget: z.string().optional(),
  targetAudience: z.string().optional(),
  areaId: z.string().optional(),
  picId: z.string().optional(),
  targetLeads: z.coerce.number().int().nonnegative().default(0),
  status: z.enum(CAMPAIGN_STATUSES),
  notes: z.string().optional(),
});

function parseRp(v: string | undefined): bigint {
  if (!v) return BigInt(0);
  const digits = v.replace(/[^\d]/g, "");
  return digits ? BigInt(digits) : BigInt(0);
}

export async function saveCampaignAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CAMPAIGNS_MANAGE);
  const id = String(formData.get("id") ?? "") || null;

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const target = id ? `/marketing/campaigns/${id}` : "/marketing/campaigns/new";
    redirect(
      `${target}?error=` +
        encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")
    );
  }
  const d = parsed.data;
  const data = {
    name: d.name,
    channel: d.channel,
    startDate: d.startDate ? new Date(d.startDate) : null,
    endDate: d.endDate ? new Date(d.endDate) : null,
    budget: parseRp(d.budget),
    targetAudience: d.targetAudience,
    areaId: d.areaId || null,
    picId: d.picId || null,
    targetLeads: d.targetLeads,
    status: d.status,
    notes: d.notes,
  };

  let campaignId = id;
  if (id) {
    await db.campaign.update({ where: { id }, data });
  } else {
    const count = await db.campaign.count();
    campaignId = (
      await db.campaign.create({
        data: { ...data, campaignNumber: `CMP-${String(count + 1).padStart(4, "0")}` },
      })
    ).id;
  }
  await logAudit({
    userId: user.id,
    action: id ? "CAMPAIGN_UPDATE" : "CAMPAIGN_CREATE",
    module: "campaigns",
    entityType: "Campaign",
    entityId: campaignId!,
    description: `${id ? "Mengubah" : "Membuat"} campaign "${d.name}"`,
  });
  revalidatePath("/marketing/campaigns");
  redirect(`/marketing/campaigns/${campaignId}?ok=` + encodeURIComponent("Campaign tersimpan."));
}
