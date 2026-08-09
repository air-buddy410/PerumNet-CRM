"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import {
  createWorkOrder,
  assignWorkOrder,
  startWorkOrder,
  installDevice,
  uninstallDevice,
  recordMaterialUsage,
  completeWorkOrder,
  closeWorkOrder,
  cancelWorkOrder,
} from "@/lib/workorder";
import { saveAttachment } from "@/lib/files";

const createSchema = z.object({
  type: z.string().min(1, "Pilih jenis WO"),
  customerId: z.string().optional(),
  subscriptionId: z.string().optional(),
  address: z.string().min(5, "Alamat wajib diisi"),
  description: z.string().min(5, "Deskripsi pekerjaan wajib diisi"),
  scheduledAt: z.string().optional(),
  technicianId: z.string().optional(),
});

export async function createWorkOrderAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.WORK_ORDERS_CREATE);
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(
      "/operations/work-orders/new?error=" +
        encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")
    );
  }
  const d = parsed.data;
  const result = await createWorkOrder(user, {
    type: d.type,
    customerId: d.customerId || undefined,
    subscriptionId: d.subscriptionId || undefined,
    address: d.address,
    description: d.description,
    scheduledAt: d.scheduledAt ? new Date(d.scheduledAt) : null,
    technicianId: d.technicianId || undefined,
  });
  if (!result.ok) {
    redirect("/operations/work-orders/new?error=" + encodeURIComponent(result.error));
  }
  revalidatePath("/operations/work-orders");
  redirect(
    `/operations/work-orders/${result.id}?ok=` + encodeURIComponent("Work order dibuat.")
  );
}

function back(woId: string, result: { ok: boolean; error?: string }, okMsg: string): never {
  redirect(
    `/operations/work-orders/${woId}?` +
      (result.ok
        ? "ok=" + encodeURIComponent(okMsg)
        : "error=" + encodeURIComponent(result.error ?? "Gagal."))
  );
}

export async function assignWorkOrderAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.WORK_ORDERS_ASSIGN);
  const woId = String(formData.get("woId") ?? "");
  const technicianId = String(formData.get("technicianId") ?? "");
  const scheduledAt = String(formData.get("scheduledAt") ?? "");
  const result = await assignWorkOrder(
    user,
    woId,
    technicianId,
    scheduledAt ? new Date(scheduledAt) : undefined
  );
  revalidatePath("/operations/work-orders");
  back(woId, result, "Teknisi ditugaskan.");
}

export async function startWorkOrderAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.WORK_ORDERS_EXECUTE);
  const woId = String(formData.get("woId") ?? "");
  const result = await startWorkOrder(user, woId);
  back(woId, result, "WO dimulai.");
}

export async function installDeviceAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.WORK_ORDERS_EXECUTE);
  const woId = String(formData.get("woId") ?? "");
  const deviceId = String(formData.get("deviceId") ?? "");
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  if (!deviceId || !subscriptionId) {
    back(woId, { ok: false, error: "Pilih perangkat dan subscription." }, "");
  }
  const result = await installDevice(user, woId, deviceId, subscriptionId);
  back(woId, result, "Perangkat terpasang & tertaut ke subscription.");
}

export async function uninstallDeviceAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.WORK_ORDERS_EXECUTE);
  const woId = String(formData.get("woId") ?? "");
  const deviceId = String(formData.get("deviceId") ?? "");
  const result = await uninstallDevice(user, woId, deviceId);
  back(woId, result, "Perangkat ditarik ke custody teknisi.");
}

export async function materialUsageAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.WORK_ORDERS_EXECUTE);
  const woId = String(formData.get("woId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const qty = parseInt(String(formData.get("qty") ?? "0"), 10);
  const note = String(formData.get("note") ?? "") || undefined;
  const result = await recordMaterialUsage(user, woId, itemId, qty, note);
  back(woId, result, "Pemakaian material tercatat.");
}

export async function completeWorkOrderAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.WORK_ORDERS_EXECUTE);
  const woId = String(formData.get("woId") ?? "");
  const result = await completeWorkOrder(
    user,
    woId,
    String(formData.get("resultNotes") ?? ""),
    String(formData.get("customerConfirmation") ?? "")
  );
  revalidatePath("/operations/work-orders");
  back(woId, result, "WO selesai dikerjakan — menunggu verifikasi & penutupan.");
}

export async function closeWorkOrderAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.WORK_ORDERS_CLOSE);
  const woId = String(formData.get("woId") ?? "");
  const result = await closeWorkOrder(user, woId);
  revalidatePath("/operations/work-orders");
  back(woId, result, "WO ditutup.");
}

export async function cancelWorkOrderAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.WORK_ORDERS_CREATE);
  const woId = String(formData.get("woId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const result = await cancelWorkOrder(user, woId, reason);
  revalidatePath("/operations/work-orders");
  back(woId, result, "WO dibatalkan.");
}

export async function uploadWoPhotoAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.WORK_ORDERS_EXECUTE);
  const woId = String(formData.get("woId") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    back(woId, { ok: false, error: "Pilih file terlebih dahulu." }, "");
  }
  const result = await saveAttachment(file as File, "WorkOrder", woId, user.id);
  back(
    woId,
    result.ok ? { ok: true } : { ok: false, error: result.ok === false ? result.error : "" },
    "Foto bukti terunggah."
  );
}
