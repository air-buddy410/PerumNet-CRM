"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import {
  PERMISSIONS,
  ENVIRONMENTS,
  CRITICALITY,
  IT_ASSET_TYPES,
} from "@/lib/constants";

// CRUD master IT inventory (server, aplikasi, aset) — PRD §38 & §45.

const serverSchema = z.object({
  id: z.string().optional(),
  hostname: z.string().min(2, "Hostname minimal 2 karakter"),
  environment: z.enum(ENVIRONMENTS),
  os: z.string().optional(),
  ipAddress: z.string().optional(),
  provider: z.string().optional(),
  region: z.string().optional(),
  cpu: z.string().optional(),
  ram: z.string().optional(),
  storage: z.string().optional(),
  ownerId: z.string().optional(),
  purpose: z.string().min(3, "Tujuan server wajib diisi"),
  backupPolicy: z.string().optional(),
  monitoringStatus: z.string().optional(),
  criticality: z.enum(CRITICALITY),
  expiryDate: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "DECOMMISSIONED"]),
  notes: z.string().optional(),
});

export async function saveServerAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.IT_INVENTORY_MANAGE);
  const parsed = serverSchema.safeParse({
    ...Object.fromEntries(formData),
    id: formData.get("id") || undefined,
  });
  if (!parsed.success) {
    redirect("/it/servers?error=" + encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid"));
  }
  const d = parsed.data;
  const hostname = d.hostname.toLowerCase();
  const dup = await db.server.findFirst({
    where: { hostname, ...(d.id ? { id: { not: d.id } } : {}) },
  });
  if (dup) redirect("/it/servers?error=" + encodeURIComponent(`Hostname "${hostname}" sudah terdaftar.`));

  const data = {
    hostname,
    environment: d.environment,
    os: d.os || null,
    ipAddress: d.ipAddress || null,
    provider: d.provider || null,
    region: d.region || null,
    cpu: d.cpu || null,
    ram: d.ram || null,
    storage: d.storage || null,
    ownerId: d.ownerId || null,
    purpose: d.purpose,
    backupPolicy: d.backupPolicy || null,
    monitoringStatus: d.monitoringStatus || null,
    criticality: d.criticality,
    expiryDate: d.expiryDate ? new Date(d.expiryDate) : null,
    status: d.status,
    notes: d.notes || null,
  };
  const server = d.id
    ? await db.server.update({ where: { id: d.id }, data })
    : await db.server.create({ data });
  await logAudit({
    userId: user.id,
    action: d.id ? "SERVER_UPDATE" : "SERVER_CREATE",
    module: "itops",
    entityType: "Server",
    entityId: server.id,
    description: `${d.id ? "Mengubah" : "Mendaftarkan"} server ${hostname} (${d.environment})`,
  });
  revalidatePath("/it/servers");
  redirect("/it/servers?ok=" + encodeURIComponent("Server tersimpan."));
}

const appSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, "Nama aplikasi minimal 2 karakter"),
  repository: z.string().optional(),
  ownerId: z.string().optional(),
  businessOwnerId: z.string().optional(),
  environment: z.enum(ENVIRONMENTS),
  domain: z.string().optional(),
  techStack: z.string().optional(),
  databaseInfo: z.string().optional(),
  dependencyNote: z.string().optional(),
  deploymentMethod: z.string().optional(),
  sla: z.string().optional(),
  serverId: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "DEPRECATED"]),
  monitoringNote: z.string().optional(),
  backupNote: z.string().optional(),
});

export async function saveApplicationAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.IT_INVENTORY_MANAGE);
  const parsed = appSchema.safeParse({
    ...Object.fromEntries(formData),
    id: formData.get("id") || undefined,
  });
  if (!parsed.success) {
    redirect("/it/applications?error=" + encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid"));
  }
  const d = parsed.data;
  const dup = await db.application.findFirst({
    where: { name: d.name, ...(d.id ? { id: { not: d.id } } : {}) },
  });
  if (dup) redirect("/it/applications?error=" + encodeURIComponent(`Aplikasi "${d.name}" sudah terdaftar.`));

  const data = {
    name: d.name,
    repository: d.repository || null,
    ownerId: d.ownerId || null,
    businessOwnerId: d.businessOwnerId || null,
    environment: d.environment,
    domain: d.domain || null,
    techStack: d.techStack || null,
    databaseInfo: d.databaseInfo || null,
    dependencyNote: d.dependencyNote || null,
    deploymentMethod: d.deploymentMethod || null,
    sla: d.sla || null,
    serverId: d.serverId || null,
    status: d.status,
    monitoringNote: d.monitoringNote || null,
    backupNote: d.backupNote || null,
  };
  const app = d.id
    ? await db.application.update({ where: { id: d.id }, data })
    : await db.application.create({ data });
  await logAudit({
    userId: user.id,
    action: d.id ? "APP_UPDATE" : "APP_CREATE",
    module: "itops",
    entityType: "Application",
    entityId: app.id,
    description: `${d.id ? "Mengubah" : "Mendaftarkan"} aplikasi ${d.name}`,
  });
  revalidatePath("/it/applications");
  redirect("/it/applications?ok=" + encodeURIComponent("Aplikasi tersimpan."));
}

const assetSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, "Nama aset minimal 2 karakter"),
  assetType: z.enum(IT_ASSET_TYPES.map(([v]) => v) as [string, ...string[]]),
  provider: z.string().optional(),
  ownerId: z.string().optional(),
  purchaseDate: z.string().optional(),
  expiryDate: z.string().optional(),
  autoRenewal: z.string().optional(),
  cost: z.string().optional(),
  paymentMethod: z.string().optional(),
  reminderDays: z.string().optional(),
  status: z.enum(["ACTIVE", "EXPIRED", "CANCELLED"]),
  notes: z.string().optional(),
});

export async function saveItAssetAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.IT_ASSETS_MANAGE);
  const parsed = assetSchema.safeParse({
    ...Object.fromEntries(formData),
    id: formData.get("id") || undefined,
  });
  if (!parsed.success) {
    redirect("/it/assets?error=" + encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid"));
  }
  const d = parsed.data;
  const cost = d.cost ? BigInt(d.cost.replace(/[^0-9]/g, "") || "0") : null;
  const dup = await db.itAsset.findFirst({
    where: { name: d.name, assetType: d.assetType, ...(d.id ? { id: { not: d.id } } : {}) },
  });
  if (dup) redirect("/it/assets?error=" + encodeURIComponent(`Aset "${d.name}" (${d.assetType}) sudah terdaftar.`));

  const data = {
    name: d.name,
    assetType: d.assetType,
    provider: d.provider || null,
    ownerId: d.ownerId || null,
    purchaseDate: d.purchaseDate ? new Date(d.purchaseDate) : null,
    expiryDate: d.expiryDate ? new Date(d.expiryDate) : null,
    autoRenewal: d.autoRenewal === "on",
    cost,
    paymentMethod: d.paymentMethod || null,
    reminderDays: d.reminderDays ? Number(d.reminderDays) : 30,
    status: d.status,
    notes: d.notes || null,
  };
  const asset = d.id
    ? await db.itAsset.update({ where: { id: d.id }, data })
    : await db.itAsset.create({ data });
  await logAudit({
    userId: user.id,
    action: d.id ? "IT_ASSET_UPDATE" : "IT_ASSET_CREATE",
    module: "itops",
    entityType: "ItAsset",
    entityId: asset.id,
    description: `${d.id ? "Mengubah" : "Mendaftarkan"} aset ${d.name} (${d.assetType})`,
  });
  revalidatePath("/it/assets");
  redirect("/it/assets?ok=" + encodeURIComponent("Aset tersimpan."));
}
