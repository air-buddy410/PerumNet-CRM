"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, INSPECTION_CHECKLIST } from "@/lib/constants";
import {
  assignRecovery,
  recordAttempt,
  pickupDevices,
  confirmPhysicalDisconnect,
  receiveDevices,
  inspectDevice,
  markNotReturned,
  type PickupLine,
} from "@/lib/device-recovery";

function back(
  id: string,
  result: { ok: true; id: string } | { ok: false; error: string },
  okMsg: string
): never {
  redirect(
    `/inventory/device-recoveries/${id}?` +
      (result.ok ? "ok=" + encodeURIComponent(okMsg) : "error=" + encodeURIComponent(result.error))
  );
}

export async function assignRecoveryAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.RECOVERY_ASSIGN);
  const id = String(formData.get("recoveryId") ?? "");
  const scheduled = String(formData.get("scheduledAt") ?? "");
  const result = await assignRecovery(
    user,
    id,
    String(formData.get("technicianId") ?? ""),
    scheduled ? new Date(scheduled) : null
  );
  revalidatePath("/inventory/device-recoveries");
  back(id, result, "Teknisi ditugaskan.");
}

export async function recordAttemptAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.RECOVERY_PICKUP);
  const id = String(formData.get("recoveryId") ?? "");
  const result = await recordAttempt(user, id, {
    result: String(formData.get("result") ?? ""),
    note: String(formData.get("note") ?? ""),
  });
  revalidatePath("/inventory/device-recoveries");
  back(id, result, "Kunjungan tercatat.");
}

export async function pickupDevicesAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.RECOVERY_PICKUP);
  const id = String(formData.get("recoveryId") ?? "");
  const lines: PickupLine[] = [];
  for (const itemId of formData.getAll("pick").map(String)) {
    lines.push({
      itemId,
      actualSerial: String(formData.get(`serial_${itemId}`) ?? ""),
      actualMac: String(formData.get(`mac_${itemId}`) ?? ""),
      mismatchNote: String(formData.get(`note_${itemId}`) ?? ""),
    });
  }
  const result = lines.length
    ? await pickupDevices(user, id, lines)
    : ({ ok: false, error: "Pilih minimal satu perangkat." } as const);
  revalidatePath("/inventory/device-recoveries");
  back(id, result, "Perangkat tercatat ditarik.");
}

export async function confirmDisconnectAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.RECOVERY_PICKUP);
  const id = String(formData.get("recoveryId") ?? "");
  const result = await confirmPhysicalDisconnect(user, id);
  revalidatePath("/inventory/device-recoveries");
  revalidatePath("/noc/ftth");
  back(id, result, "Pemutusan fisik dikonfirmasi — port ODP dilepas.");
}

export async function receiveDevicesAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.RECOVERY_RECEIVE);
  const id = String(formData.get("recoveryId") ?? "");
  const itemIds = formData.getAll("receive").map(String);
  const result = await receiveDevices(user, id, itemIds);
  revalidatePath("/inventory/device-recoveries");
  back(id, result, "Perangkat masuk karantina — belum menambah stok tersedia.");
}

export async function inspectDeviceAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.RECOVERY_INSPECT);
  const id = String(formData.get("recoveryId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const checklist: Record<string, boolean> = {};
  for (const [key] of INSPECTION_CHECKLIST) {
    checklist[key] = formData.get(`chk_${key}`) === "on";
  }
  const result = await inspectDevice(user, itemId, {
    checklist,
    decision: String(formData.get("decision") ?? ""),
    note: String(formData.get("note") ?? ""),
  });
  revalidatePath("/inventory/device-recoveries");
  revalidatePath("/inventory/stock");
  back(id, result, "Inspeksi tersimpan.");
}

export async function markNotReturnedAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.RECOVERY_ESCALATE);
  const id = String(formData.get("recoveryId") ?? "");
  const result = await markNotReturned(
    user,
    String(formData.get("itemId") ?? ""),
    String(formData.get("note") ?? "")
  );
  revalidatePath("/inventory/device-recoveries");
  back(id, result, "Perangkat dinyatakan tidak kembali.");
}
