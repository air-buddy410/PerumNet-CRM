"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { createSubnet, allocateIp, releaseIp } from "@/lib/noc";

export async function createSubnetAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.IPAM_MANAGE);
  const result = await createSubnet(user, {
    cidr: String(formData.get("cidr") ?? ""),
    name: String(formData.get("name") ?? ""),
    vlan: String(formData.get("vlan") ?? "") || undefined,
    gateway: String(formData.get("gateway") ?? "") || undefined,
    purpose: String(formData.get("purpose") ?? ""),
    ownerId: String(formData.get("ownerId") ?? "") || undefined,
    siteId: String(formData.get("siteId") ?? "") || undefined,
  });
  revalidatePath("/noc/ipam");
  if (!result.ok) {
    redirect("/noc/ipam?error=" + encodeURIComponent(result.error));
  }
  redirect(`/noc/ipam/${result.id}?ok=` + encodeURIComponent("Subnet dibuat."));
}

export async function allocateIpAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.IPAM_MANAGE);
  const subnetId = String(formData.get("subnetId") ?? "");
  const status = String(formData.get("status") ?? "ALLOCATED") as "ALLOCATED" | "RESERVED";
  const result = await allocateIp(user, {
    subnetId,
    address: String(formData.get("address") ?? ""),
    status,
    deviceId: String(formData.get("deviceId") ?? "") || undefined,
    subscriptionId: String(formData.get("subscriptionId") ?? "") || undefined,
    description: String(formData.get("description") ?? "") || undefined,
  });
  revalidatePath(`/noc/ipam/${subnetId}`);
  redirect(
    `/noc/ipam/${subnetId}?` +
      (result.ok
        ? "ok=" + encodeURIComponent("IP dialokasikan.")
        : "error=" + encodeURIComponent(result.error))
  );
}

export async function releaseIpAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.IPAM_MANAGE);
  const subnetId = String(formData.get("subnetId") ?? "");
  const ipId = String(formData.get("ipId") ?? "");
  const result = await releaseIp(user, ipId);
  revalidatePath(`/noc/ipam/${subnetId}`);
  redirect(
    `/noc/ipam/${subnetId}?` +
      (result.ok
        ? "ok=" + encodeURIComponent("IP dilepas (riwayat tercatat).")
        : "error=" + encodeURIComponent(result.error))
  );
}
