"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { saveIntegration, regenerateWebhookToken } from "@/lib/integrations";

export async function saveIntegrationAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.INTEGRATIONS_MANAGE);
  const id = String(formData.get("id") ?? "") || undefined;
  const result = await saveIntegration(user, {
    id,
    code: String(formData.get("code") ?? ""),
    name: String(formData.get("name") ?? ""),
    category: String(formData.get("category") ?? ""),
    provider: String(formData.get("provider") ?? ""),
    baseUrl: String(formData.get("baseUrl") ?? "") || undefined,
    authType: String(formData.get("authType") ?? "NONE"),
    credentialRef: String(formData.get("credentialRef") ?? "") || undefined,
    isEnabled: formData.get("isEnabled") === "on",
    notes: String(formData.get("notes") ?? "") || undefined,
  });
  revalidatePath("/settings/integrations");
  if (!result.ok) {
    redirect(
      `/settings/integrations${id ? `?edit=${id}&` : "?"}error=` + encodeURIComponent(result.error)
    );
  }
  redirect(`/settings/integrations/${result.id}?ok=` + encodeURIComponent("Integrasi tersimpan."));
}

export async function regenerateTokenAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.INTEGRATIONS_MANAGE);
  const id = String(formData.get("integrationId") ?? "");
  const result = await regenerateWebhookToken(user, id);
  revalidatePath("/settings/integrations");
  redirect(
    `/settings/integrations/${id}?` +
      (result.ok
        ? "ok=" + encodeURIComponent("Token baru dibuat — perbarui konfigurasi di sistem monitoring.")
        : "error=" + encodeURIComponent(result.error))
  );
}
