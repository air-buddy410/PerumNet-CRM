"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { createAlarm, ackAlarm, clearAlarm, createIncident } from "@/lib/noc";
import { db } from "@/lib/db";

export async function createAlarmAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.ALARMS_MANAGE);
  const result = await createAlarm(user, {
    severity: String(formData.get("severity") ?? ""),
    message: String(formData.get("message") ?? ""),
    deviceId: String(formData.get("deviceId") ?? "") || undefined,
    siteId: String(formData.get("siteId") ?? "") || undefined,
  });
  revalidatePath("/noc/alarms");
  redirect(
    "/noc/alarms?" +
      (result.ok
        ? "ok=" + encodeURIComponent("Alarm tercatat.")
        : "error=" + encodeURIComponent(result.error))
  );
}

export async function ackAlarmAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.ALARMS_MANAGE);
  const alarmId = String(formData.get("alarmId") ?? "");
  const result = await ackAlarm(user, alarmId);
  revalidatePath("/noc/alarms");
  redirect(
    "/noc/alarms?" +
      (result.ok
        ? "ok=" + encodeURIComponent("Alarm di-acknowledge.")
        : "error=" + encodeURIComponent(result.error))
  );
}

export async function clearAlarmAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.ALARMS_MANAGE);
  const alarmId = String(formData.get("alarmId") ?? "");
  const result = await clearAlarm(user, alarmId);
  revalidatePath("/noc/alarms");
  redirect(
    "/noc/alarms?" +
      (result.ok
        ? "ok=" + encodeURIComponent("Alarm clear.")
        : "error=" + encodeURIComponent(result.error))
  );
}

// Eskalasi alarm menjadi incident (alarm ↔ incident saling tertaut).
export async function escalateAlarmAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.INCIDENTS_CREATE);
  const alarmId = String(formData.get("alarmId") ?? "");
  const severity = String(formData.get("severity") ?? "");
  const alarm = await db.networkAlarm.findUnique({ where: { id: alarmId } });
  if (!alarm) {
    redirect("/noc/alarms?error=" + encodeURIComponent("Alarm tidak ditemukan."));
  }
  if (alarm.incidentId) {
    redirect("/noc/alarms?error=" + encodeURIComponent("Alarm sudah memiliki incident."));
  }
  const result = await createIncident(user, {
    title: alarm.message,
    type: "OTHER",
    severity,
    deviceId: alarm.deviceId ?? undefined,
    siteId: alarm.siteId ?? undefined,
    alarmId: alarm.id,
    initialNote: `Dieskalasi dari alarm ${alarm.alarmNumber}`,
  });
  revalidatePath("/noc/alarms");
  if (!result.ok) {
    redirect("/noc/alarms?error=" + encodeURIComponent(result.error));
  }
  redirect(`/noc/incidents/${result.id}?ok=` + encodeURIComponent("Incident dibuat dari alarm."));
}
