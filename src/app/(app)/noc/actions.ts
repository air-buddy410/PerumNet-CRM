"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import {
  PERMISSIONS,
  SITE_TYPES,
  NET_DEVICE_TYPES,
  LINK_MEDIA,
  CRITICALITY,
} from "@/lib/constants";

// CRUD master network inventory (site, perangkat, link) — PRD §28.

const siteSchema = z.object({
  id: z.string().optional(),
  siteCode: z.string().min(2).regex(/^[A-Za-z0-9_-]+$/, "Kode hanya huruf/angka/strip"),
  name: z.string().min(2, "Nama minimal 2 karakter"),
  type: z.enum(SITE_TYPES.map(([v]) => v) as [string, ...string[]]),
  address: z.string().optional(),
  areaId: z.string().optional(),
  picId: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "PLANNED"]),
  powerSource: z.string().optional(),
  backupPower: z.string().optional(),
  upstreamProvider: z.string().optional(),
  notes: z.string().optional(),
});

export async function saveSiteAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.NET_INVENTORY_MANAGE);
  const parsed = siteSchema.safeParse({
    ...Object.fromEntries(formData),
    id: formData.get("id") || undefined,
  });
  if (!parsed.success) {
    redirect("/noc/sites?error=" + encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid"));
  }
  const d = parsed.data;
  const siteCode = d.siteCode.toUpperCase();
  const dup = await db.networkSite.findFirst({
    where: { siteCode, ...(d.id ? { id: { not: d.id } } : {}) },
  });
  if (dup) redirect("/noc/sites?error=" + encodeURIComponent(`Kode "${siteCode}" sudah dipakai.`));

  const data = {
    siteCode,
    name: d.name,
    type: d.type,
    address: d.address || null,
    areaId: d.areaId || null,
    picId: d.picId || null,
    status: d.status,
    powerSource: d.powerSource || null,
    backupPower: d.backupPower || null,
    upstreamProvider: d.upstreamProvider || null,
    notes: d.notes || null,
  };
  const site = d.id
    ? await db.networkSite.update({ where: { id: d.id }, data })
    : await db.networkSite.create({ data });
  await logAudit({
    userId: user.id,
    action: d.id ? "SITE_UPDATE" : "SITE_CREATE",
    module: "noc",
    entityType: "NetworkSite",
    entityId: site.id,
    description: `${d.id ? "Mengubah" : "Membuat"} site ${siteCode} — ${d.name}`,
  });
  revalidatePath("/noc/sites");
  redirect("/noc/sites?ok=" + encodeURIComponent("Site tersimpan."));
}

const deviceSchema = z.object({
  id: z.string().optional(),
  hostname: z.string().min(2, "Hostname minimal 2 karakter"),
  deviceType: z.enum(NET_DEVICE_TYPES.map(([v]) => v) as [string, ...string[]]),
  vendor: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  macAddress: z.string().optional(),
  managementIp: z.string().optional(),
  siteId: z.string().min(1, "Pilih site"),
  rack: z.string().optional(),
  uPosition: z.string().optional(),
  firmware: z.string().optional(),
  criticality: z.enum(CRITICALITY),
  status: z.enum(["ACTIVE", "INACTIVE", "MAINTENANCE", "DOWN"]),
  ownerId: z.string().optional(),
  notes: z.string().optional(),
});

export async function saveNetDeviceAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.NET_INVENTORY_MANAGE);
  const parsed = deviceSchema.safeParse({
    ...Object.fromEntries(formData),
    id: formData.get("id") || undefined,
  });
  if (!parsed.success) {
    redirect("/noc/devices?error=" + encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid"));
  }
  const d = parsed.data;
  const dup = await db.networkDevice.findFirst({
    where: { hostname: d.hostname, ...(d.id ? { id: { not: d.id } } : {}) },
  });
  if (dup) redirect("/noc/devices?error=" + encodeURIComponent(`Hostname "${d.hostname}" sudah dipakai.`));

  const data = {
    hostname: d.hostname,
    deviceType: d.deviceType,
    vendor: d.vendor || null,
    model: d.model || null,
    serialNumber: d.serialNumber || null,
    macAddress: d.macAddress || null,
    managementIp: d.managementIp || null,
    siteId: d.siteId,
    rack: d.rack || null,
    uPosition: d.uPosition || null,
    firmware: d.firmware || null,
    criticality: d.criticality,
    status: d.status,
    ownerId: d.ownerId || null,
    notes: d.notes || null,
  };
  const device = d.id
    ? await db.networkDevice.update({ where: { id: d.id }, data })
    : await db.networkDevice.create({ data });
  await logAudit({
    userId: user.id,
    action: d.id ? "NETDEV_UPDATE" : "NETDEV_CREATE",
    module: "noc",
    entityType: "NetworkDevice",
    entityId: device.id,
    description: `${d.id ? "Mengubah" : "Membuat"} perangkat jaringan ${d.hostname}`,
  });
  revalidatePath("/noc/devices");
  redirect("/noc/devices?ok=" + encodeURIComponent("Perangkat tersimpan."));
}

const linkSchema = z.object({
  id: z.string().optional(),
  linkCode: z.string().min(2).regex(/^[A-Za-z0-9_-]+$/, "Kode hanya huruf/angka/strip"),
  name: z.string().optional(),
  siteAId: z.string().min(1, "Pilih site asal"),
  siteBId: z.string().min(1, "Pilih site tujuan"),
  media: z.enum(LINK_MEDIA),
  capacity: z.string().optional(),
  provider: z.string().optional(),
  circuitId: z.string().optional(),
  isPrimary: z.string().optional(),
  status: z.enum(["ACTIVE", "DEGRADED", "DOWN", "INACTIVE"]),
  notes: z.string().optional(),
});

export async function saveLinkAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.NET_INVENTORY_MANAGE);
  const parsed = linkSchema.safeParse({
    ...Object.fromEntries(formData),
    id: formData.get("id") || undefined,
  });
  if (!parsed.success) {
    redirect("/noc/links?error=" + encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid"));
  }
  const d = parsed.data;
  if (d.siteAId === d.siteBId) {
    redirect("/noc/links?error=" + encodeURIComponent("Site asal dan tujuan tidak boleh sama."));
  }
  const linkCode = d.linkCode.toUpperCase();
  const dup = await db.networkLink.findFirst({
    where: { linkCode, ...(d.id ? { id: { not: d.id } } : {}) },
  });
  if (dup) redirect("/noc/links?error=" + encodeURIComponent(`Kode "${linkCode}" sudah dipakai.`));

  const data = {
    linkCode,
    name: d.name || null,
    siteAId: d.siteAId,
    siteBId: d.siteBId,
    media: d.media,
    capacity: d.capacity || null,
    provider: d.provider || null,
    circuitId: d.circuitId || null,
    isPrimary: d.isPrimary === "on",
    status: d.status,
    notes: d.notes || null,
  };
  const link = d.id
    ? await db.networkLink.update({ where: { id: d.id }, data })
    : await db.networkLink.create({ data });
  await logAudit({
    userId: user.id,
    action: d.id ? "LINK_UPDATE" : "LINK_CREATE",
    module: "noc",
    entityType: "NetworkLink",
    entityId: link.id,
    description: `${d.id ? "Mengubah" : "Membuat"} link ${linkCode}`,
  });
  revalidatePath("/noc/links");
  redirect("/noc/links?ok=" + encodeURIComponent("Link tersimpan."));
}
