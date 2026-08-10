"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import {
  saveOltDevice,
  savePonPort,
  saveOdp,
  assignPort,
  releasePort,
  setPortStatus,
  reconcilePortUsage,
} from "@/lib/ftth";

function num(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  return s ? Number(s) : null;
}

export async function saveOltAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.FTTH_MANAGE);
  const result = await saveOltDevice(user, {
    id: String(formData.get("id") ?? "") || undefined,
    networkDeviceId: String(formData.get("networkDeviceId") ?? ""),
    vendor: String(formData.get("vendor") ?? ""),
    model: String(formData.get("model") ?? "") || undefined,
    managementIp: String(formData.get("managementIp") ?? ""),
    telnetPort: num(formData.get("telnetPort")),
    snmpPort: num(formData.get("snmpPort")),
    credentialRef: String(formData.get("credentialRef") ?? "") || null,
    notes: String(formData.get("notes") ?? "") || undefined,
  });
  revalidatePath("/noc/ftth");
  redirect(
    "/noc/ftth?" +
      (result.ok ? "ok=" + encodeURIComponent("OLT tersimpan.") : "error=" + encodeURIComponent(result.error))
  );
}

export async function savePonPortAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.FTTH_MANAGE);
  const result = await savePonPort(user, {
    oltId: String(formData.get("oltId") ?? ""),
    slot: Number(formData.get("slot") ?? -1),
    port: Number(formData.get("port") ?? -1),
    label: String(formData.get("label") ?? "") || undefined,
  });
  revalidatePath("/noc/ftth");
  redirect(
    "/noc/ftth?" +
      (result.ok ? "ok=" + encodeURIComponent("PON port ditambahkan.") : "error=" + encodeURIComponent(result.error))
  );
}

export async function saveOdpAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.FTTH_MANAGE);
  const id = String(formData.get("id") ?? "") || undefined;
  const result = await saveOdp(user, {
    id,
    code: String(formData.get("code") ?? ""),
    siteId: String(formData.get("siteId") ?? "") || null,
    ponPortId: String(formData.get("ponPortId") ?? "") || null,
    parentId: String(formData.get("parentId") ?? "") || null,
    portCapacity: Number(formData.get("portCapacity") ?? 0),
    opticPowerDbm: num(formData.get("opticPowerDbm")),
    latitude: num(formData.get("latitude")),
    longitude: num(formData.get("longitude")),
    status: String(formData.get("status") ?? "ACTIVE"),
    notes: String(formData.get("notes") ?? "") || undefined,
  });
  revalidatePath("/noc/ftth");
  if (!result.ok) {
    redirect(`/noc/ftth${id ? `?edit=${id}&` : "?"}error=` + encodeURIComponent(result.error));
  }
  redirect(`/noc/ftth/odp/${result.id}?ok=` + encodeURIComponent("ODP tersimpan — port disinkronkan."));
}

function backOdp(odpId: string, result: { ok: boolean; error?: string }, okMsg: string): never {
  redirect(
    `/noc/ftth/odp/${odpId}?` +
      (result.ok ? "ok=" + encodeURIComponent(okMsg) : "error=" + encodeURIComponent(result.error ?? "Gagal."))
  );
}

export async function assignPortAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.FTTH_MANAGE);
  const odpId = String(formData.get("odpId") ?? "");
  const result = await assignPort(user, {
    odpPortId: String(formData.get("odpPortId") ?? ""),
    subscriptionId: String(formData.get("subscriptionId") ?? ""),
    note: String(formData.get("note") ?? "") || undefined,
  });
  revalidatePath("/noc/ftth");
  backOdp(odpId, result, "Port dialokasikan ke langganan.");
}

export async function releasePortAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.FTTH_MANAGE);
  const odpId = String(formData.get("odpId") ?? "");
  const result = await releasePort(user, String(formData.get("odpPortId") ?? ""));
  revalidatePath("/noc/ftth");
  backOdp(odpId, result, "Port dilepas.");
}

export async function setPortStatusAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.FTTH_MANAGE);
  const odpId = String(formData.get("odpId") ?? "");
  const result = await setPortStatus(
    user,
    String(formData.get("odpPortId") ?? ""),
    String(formData.get("status") ?? ""),
    String(formData.get("note") ?? "") || undefined
  );
  revalidatePath("/noc/ftth");
  backOdp(odpId, result, "Status port diperbarui.");
}

export async function reconcilePortsAction(): Promise<void> {
  const user = await requirePermission(PERMISSIONS.FTTH_MANAGE);
  const result = await reconcilePortUsage(user);
  revalidatePath("/noc/ftth");
  redirect(
    "/noc/ftth?" +
      (result.ok
        ? "ok=" + encodeURIComponent(`Rekonsiliasi selesai: ${result.data?.checked} ODP diperiksa, ${result.data?.fixed} dikoreksi.`)
        : "error=" + encodeURIComponent(result.error))
  );
}
