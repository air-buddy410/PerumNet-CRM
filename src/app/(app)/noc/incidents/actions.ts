"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import {
  createIncident,
  ackIncident,
  addIncidentUpdate,
  setImpactedSubscriptions,
  resolveIncident,
  closeIncident,
} from "@/lib/noc";

export async function createIncidentAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.INCIDENTS_CREATE);
  const result = await createIncident(user, {
    title: String(formData.get("title") ?? ""),
    type: String(formData.get("type") ?? "OTHER"),
    severity: String(formData.get("severity") ?? ""),
    isOutage: formData.get("isOutage") === "on",
    deviceId: String(formData.get("deviceId") ?? "") || undefined,
    linkId: String(formData.get("linkId") ?? "") || undefined,
    siteId: String(formData.get("siteId") ?? "") || undefined,
    areaId: String(formData.get("areaId") ?? "") || undefined,
    initialNote: String(formData.get("initialNote") ?? "") || undefined,
  });
  revalidatePath("/noc/incidents");
  if (!result.ok) {
    redirect("/noc/incidents/new?error=" + encodeURIComponent(result.error));
  }
  redirect(`/noc/incidents/${result.id}?ok=` + encodeURIComponent("Incident dibuat."));
}

function back(id: string, result: { ok: boolean; error?: string }, okMsg: string): never {
  redirect(
    `/noc/incidents/${id}?` +
      (result.ok
        ? "ok=" + encodeURIComponent(okMsg)
        : "error=" + encodeURIComponent(result.error ?? "Gagal."))
  );
}

export async function ackIncidentAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.INCIDENTS_MANAGE);
  const id = String(formData.get("incidentId") ?? "");
  const result = await ackIncident(user, id);
  revalidatePath("/noc/incidents");
  back(id, result, "Acknowledged — Anda menjadi PIC.");
}

export async function updateIncidentAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.INCIDENTS_MANAGE);
  const id = String(formData.get("incidentId") ?? "");
  const newStatus = String(formData.get("newStatus") ?? "") || undefined;
  const result = await addIncidentUpdate(
    user,
    id,
    String(formData.get("note") ?? ""),
    newStatus as "INVESTIGATING" | "MITIGATING" | undefined
  );
  back(id, result, "Timeline diperbarui.");
}

export async function setImpactAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.INCIDENTS_MANAGE);
  const id = String(formData.get("incidentId") ?? "");
  const subscriptionIds = formData.getAll("subscriptionIds").map(String).filter(Boolean);
  const result = await setImpactedSubscriptions(user, id, subscriptionIds);
  back(id, result, `${subscriptionIds.length} pelanggan terdampak tercatat.`);
}

export async function resolveIncidentAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.INCIDENTS_MANAGE);
  const id = String(formData.get("incidentId") ?? "");
  const result = await resolveIncident(
    user,
    id,
    String(formData.get("resolution") ?? ""),
    String(formData.get("recoveryNote") ?? "")
  );
  revalidatePath("/noc/incidents");
  back(id, result, "Incident resolved — layanan pulih terverifikasi.");
}

export async function closeIncidentAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.INCIDENTS_MANAGE);
  const id = String(formData.get("incidentId") ?? "");
  const result = await closeIncident(
    user,
    id,
    String(formData.get("rootCause") ?? ""),
    String(formData.get("preventiveAction") ?? "") || undefined
  );
  revalidatePath("/noc/incidents");
  back(id, result, "Incident ditutup.");
}
