"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/rbac";
import { markRead, markAllRead } from "@/lib/notify";
import { db } from "@/lib/db";

// Klik notifikasi: tandai dibaca lalu lompat ke halaman terkait.
export async function openNotificationAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("notificationId") ?? "");
  await markRead(user, id);
  const n = await db.notification.findUnique({ where: { id } });
  revalidatePath("/notifications");
  redirect(n?.link && n.userId === user.id ? n.link : "/notifications");
}

export async function markAllReadAction(): Promise<void> {
  const user = await requireUser();
  await markAllRead(user);
  revalidatePath("/notifications");
  redirect("/notifications?ok=" + encodeURIComponent("Semua notifikasi ditandai dibaca."));
}
