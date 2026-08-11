"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import {
  requestDeviceWriteoff,
  finalizeDeviceWriteoff,
  setDeviceOwnership,
} from "@/lib/inventory";

export async function requestWriteoffAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.DEVICES_WRITEOFF);
  const deviceId = String(formData.get("deviceId") ?? "");
  const target = String(formData.get("target") ?? "");
  const chronology = String(formData.get("chronology") ?? "");
  if (target !== "LOST" && target !== "DAMAGED") {
    redirect(`/inventory/devices/${deviceId}?error=` + encodeURIComponent("Target tidak valid."));
  }
  const result = await requestDeviceWriteoff(user, deviceId, target as "LOST" | "DAMAGED", chronology);
  revalidatePath("/inventory/devices");
  redirect(
    `/inventory/devices/${deviceId}?` +
      (result.ok
        ? "ok=" + encodeURIComponent("Pengajuan write-off dibuat — menunggu approval.")
        : "error=" + encodeURIComponent(result.error))
  );
}

export async function finalizeWriteoffAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.DEVICES_WRITEOFF);
  const deviceId = String(formData.get("deviceId") ?? "");
  const target = String(formData.get("target") ?? "");
  if (target !== "LOST" && target !== "DAMAGED") {
    redirect(`/inventory/devices/${deviceId}?error=` + encodeURIComponent("Target tidak valid."));
  }
  const result = await finalizeDeviceWriteoff(user, deviceId, target as "LOST" | "DAMAGED");
  revalidatePath("/inventory/devices");
  redirect(
    `/inventory/devices/${deviceId}?` +
      (result.ok
        ? "ok=" + encodeURIComponent("Write-off difinalisasi — status final tercatat.")
        : "error=" + encodeURIComponent(result.error))
  );
}

/**
 * Fase 28 — koreksi kepemilikan perangkat (PRD §21).
 * Backfill memberi semua perangkat lama nilai COMPANY; perangkat yang
 * sebenarnya milik pelanggan harus dikoreksi lewat sini, bukan lewat DB.
 */
export async function setOwnershipAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.DEVICE_OWNERSHIP_MANAGE);
  const deviceId = String(formData.get("deviceId") ?? "");
  const ownership = String(formData.get("ownership") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const result = await setDeviceOwnership(user, deviceId, ownership, reason);
  revalidatePath("/inventory/devices");
  redirect(
    `/inventory/devices/${deviceId}?` +
      (result.ok
        ? "ok=" + encodeURIComponent("Kepemilikan perangkat diperbarui dan tercatat di audit log.")
        : "error=" + encodeURIComponent(result.error))
  );
}
