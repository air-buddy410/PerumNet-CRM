"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import {
  saveMessageTemplate,
  setCustomerChannel,
  queueCustomerMessage,
  queueBroadcast,
  runOutboundQueue,
  retryMessage,
  saveAnnouncement,
} from "@/lib/channels";

export async function saveTemplateAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CHANNELS_MANAGE);
  const result = await saveMessageTemplate(user, {
    id: String(formData.get("id") ?? "") || undefined,
    code: String(formData.get("code") ?? ""),
    name: String(formData.get("name") ?? ""),
    channel: String(formData.get("channel") ?? ""),
    subject: String(formData.get("subject") ?? "") || undefined,
    body: String(formData.get("body") ?? ""),
    isActive: formData.get("isActive") === "on",
  });
  revalidatePath("/channels/templates");
  redirect(
    "/channels/templates?" +
      (result.ok ? "ok=" + encodeURIComponent("Template tersimpan.") : "error=" + encodeURIComponent(result.error))
  );
}

export async function setCustomerChannelAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CHANNELS_MANAGE);
  const result = await setCustomerChannel(
    user,
    String(formData.get("customerId") ?? ""),
    String(formData.get("channel") ?? "")
  );
  revalidatePath("/channels/preferences");
  redirect(
    "/channels/preferences?" +
      (result.ok ? "ok=" + encodeURIComponent("Preferensi tersimpan.") : "error=" + encodeURIComponent(result.error))
  );
}

export async function queueMessageAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CHANNELS_MANAGE);
  const result = await queueCustomerMessage(user, {
    customerId: String(formData.get("customerId") ?? ""),
    templateCode: String(formData.get("templateCode") ?? "") || undefined,
    bodyOverride: String(formData.get("body") ?? "") || undefined,
    integrationId: String(formData.get("integrationId") ?? "") || null,
  });
  revalidatePath("/channels/outbox");
  redirect(
    "/channels/outbox?" +
      (result.ok ? "ok=" + encodeURIComponent("Pesan masuk antrian.") : "error=" + encodeURIComponent(result.error))
  );
}

export async function broadcastAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CHANNELS_MANAGE);
  const result = await queueBroadcast(user, {
    templateCode: String(formData.get("templateCode") ?? ""),
    customerIds: formData.getAll("customerIds").map(String).filter(Boolean),
    integrationId: String(formData.get("integrationId") ?? "") || null,
  });
  revalidatePath("/channels/outbox");
  redirect(
    "/channels/outbox?" +
      (result.ok
        ? "ok=" + encodeURIComponent(
            `Blast: ${result.data?.queued} diantrikan, ${result.data?.skipped} dilewati${result.data?.reasons.length ? ` (${result.data.reasons[0]})` : ""}.`
          )
        : "error=" + encodeURIComponent(result.error))
  );
}

export async function runQueueAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CHANNELS_MANAGE);
  const limit = Number(formData.get("rateLimit") ?? 20);
  const result = await runOutboundQueue(user, undefined, limit);
  revalidatePath("/channels/outbox");
  redirect(
    "/channels/outbox?" +
      (result.ok
        ? "ok=" + encodeURIComponent(`Antrian dijalankan: ${result.data?.sent} terkirim, ${result.data?.failed} gagal.`)
        : "error=" + encodeURIComponent(result.error))
  );
}

export async function retryMessageAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CHANNELS_MANAGE);
  const result = await retryMessage(user, String(formData.get("messageId") ?? ""));
  revalidatePath("/channels/outbox");
  redirect(
    "/channels/outbox?" +
      (result.ok ? "ok=" + encodeURIComponent("Pesan dikembalikan ke antrian.") : "error=" + encodeURIComponent(result.error))
  );
}

export async function saveAnnouncementAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CHANNELS_MANAGE);
  const start = String(formData.get("startAt") ?? "");
  const end = String(formData.get("endAt") ?? "");
  const result = await saveAnnouncement(user, {
    id: String(formData.get("id") ?? "") || undefined,
    title: String(formData.get("title") ?? ""),
    badge: String(formData.get("badge") ?? "") || undefined,
    body: String(formData.get("body") ?? ""),
    startAt: start ? new Date(start) : new Date(NaN),
    endAt: end ? new Date(end) : null,
    isPublished: formData.get("isPublished") === "on",
  });
  revalidatePath("/channels/announcements");
  redirect(
    "/channels/announcements?" +
      (result.ok ? "ok=" + encodeURIComponent("Pengumuman tersimpan.") : "error=" + encodeURIComponent(result.error))
  );
}
