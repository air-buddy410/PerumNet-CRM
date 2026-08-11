"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

export async function toggleTaskAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.MASTER_DATA_MANAGE);
  const taskId = String(formData.get("taskId") ?? "");
  const task = await db.scheduledTask.findUnique({ where: { id: taskId } });
  if (!task) redirect("/settings/scheduler?error=" + encodeURIComponent("Tugas tidak ditemukan."));

  const next = !task.isEnabled;
  await db.scheduledTask.update({ where: { id: taskId }, data: { isEnabled: next } });
  await logAudit({
    userId: user.id,
    action: next ? "SCHEDULER_ENABLE" : "SCHEDULER_DISABLE",
    module: "settings",
    entityType: "ScheduledTask",
    entityId: taskId,
    // Mematikan evaluasi tunggakan berarti pelanggan menunggak tidak diisolir —
    // itu keputusan operasional yang harus terlihat di audit log.
    description: `${next ? "Mengaktifkan" : "Mematikan"} pekerjaan berkala ${task.code}`,
  });

  revalidatePath("/settings/scheduler");
  redirect(
    "/settings/scheduler?ok=" +
      encodeURIComponent(`${task.name} ${next ? "diaktifkan" : "dimatikan"}.`)
  );
}

export async function setIntervalAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.MASTER_DATA_MANAGE);
  const taskId = String(formData.get("taskId") ?? "");
  const intervalSec = Number(formData.get("intervalSec") ?? 0);

  if (!Number.isInteger(intervalSec) || intervalSec < 30 || intervalSec > 86_400) {
    redirect(
      "/settings/scheduler?error=" +
        encodeURIComponent("Interval harus 30–86400 detik.")
    );
  }

  const task = await db.scheduledTask.findUnique({ where: { id: taskId } });
  if (!task) redirect("/settings/scheduler?error=" + encodeURIComponent("Tugas tidak ditemukan."));

  await db.scheduledTask.update({ where: { id: taskId }, data: { intervalSec } });
  await logAudit({
    userId: user.id,
    action: "SCHEDULER_INTERVAL",
    module: "settings",
    entityType: "ScheduledTask",
    entityId: taskId,
    description: `Interval ${task!.code}: ${task!.intervalSec}s → ${intervalSec}s`,
  });

  revalidatePath("/settings/scheduler");
  redirect("/settings/scheduler?ok=" + encodeURIComponent("Interval diperbarui."));
}
