"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS, AUDIT_ACTIONS } from "@/lib/constants";

// Master data tidak pernah dihapus — hanya dinonaktifkan — karena akan
// direferensikan transaksi (immutability & traceability).

export type MasterEntity =
  | "cost-centers"
  | "categories"
  | "areas"
  | "packages"
  | "divisions";

const ENTITY_LABEL: Record<MasterEntity, string> = {
  "cost-centers": "Cost Center",
  categories: "Kategori",
  areas: "Area",
  packages: "Paket",
  divisions: "Divisi",
};

const baseSchema = z.object({
  code: z
    .string()
    .min(2, "Kode minimal 2 karakter")
    .regex(/^[A-Za-z0-9_-]+$/, "Kode hanya huruf, angka, strip, underscore"),
  name: z.string().min(2, "Nama minimal 2 karakter"),
  description: z.string().optional(),
});

const packageSchema = baseSchema.extend({
  downloadMbps: z.coerce.number().int().positive("Download harus > 0"),
  uploadMbps: z.coerce.number().int().positive("Upload harus > 0"),
  monthlyPrice: z.coerce.number().int().nonnegative(),
  installationFee: z.coerce.number().int().nonnegative(),
});

function back(entity: MasterEntity, msg: { ok?: string; error?: string }): never {
  const q = msg.error
    ? "?error=" + encodeURIComponent(msg.error)
    : "?ok=" + encodeURIComponent(msg.ok ?? "");
  redirect(`/settings/master/${entity}${q}`);
}

export async function saveMasterAction(formData: FormData): Promise<void> {
  const actor = await requirePermission(PERMISSIONS.MASTER_DATA_MANAGE);
  const entity = String(formData.get("entity")) as MasterEntity;
  const id = String(formData.get("id") ?? "") || null;

  if (!ENTITY_LABEL[entity]) back("cost-centers" as MasterEntity, { error: "Entitas tidak dikenal." });

  const raw = {
    code: formData.get("code"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    downloadMbps: formData.get("downloadMbps") ?? undefined,
    uploadMbps: formData.get("uploadMbps") ?? undefined,
    monthlyPrice: formData.get("monthlyPrice") ?? undefined,
    installationFee: formData.get("installationFee") ?? undefined,
  };

  const schema = entity === "packages" ? packageSchema : baseSchema;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    back(entity, { error: parsed.error.issues[0]?.message ?? "Input tidak valid" });
  }
  const data = parsed.data;
  const code = data.code.toUpperCase();

  // Cek duplikasi kode antar-entitas yang sama
  const dupWhere = { code, ...(id ? { id: { not: id } } : {}) };
  const dup =
    entity === "cost-centers"
      ? await db.costCenter.findFirst({ where: dupWhere })
      : entity === "categories"
        ? await db.category.findFirst({ where: dupWhere })
        : entity === "areas"
          ? await db.area.findFirst({ where: dupWhere })
          : entity === "divisions"
            ? await db.division.findFirst({ where: dupWhere })
            : await db.package.findFirst({ where: dupWhere });
  if (dup) back(entity, { error: `Kode "${code}" sudah digunakan.` });

  let entityId = id;
  if (entity === "cost-centers") {
    const payload = { code, name: data.name, description: data.description };
    entityId = id
      ? (await db.costCenter.update({ where: { id }, data: payload })).id
      : (await db.costCenter.create({ data: payload })).id;
  } else if (entity === "categories") {
    const payload = { code, name: data.name, type: "EXPENSE" };
    entityId = id
      ? (await db.category.update({ where: { id }, data: payload })).id
      : (await db.category.create({ data: payload })).id;
  } else if (entity === "areas") {
    const payload = { code, name: data.name, description: data.description };
    entityId = id
      ? (await db.area.update({ where: { id }, data: payload })).id
      : (await db.area.create({ data: payload })).id;
  } else if (entity === "divisions") {
    const payload = { code, name: data.name };
    entityId = id
      ? (await db.division.update({ where: { id }, data: payload })).id
      : (await db.division.create({ data: payload })).id;
  } else {
    const p = parsed.data as z.infer<typeof packageSchema>;
    const payload = {
      code,
      name: p.name,
      description: p.description,
      downloadMbps: p.downloadMbps,
      uploadMbps: p.uploadMbps,
      monthlyPrice: BigInt(p.monthlyPrice),
      installationFee: BigInt(p.installationFee),
    };
    entityId = id
      ? (await db.package.update({ where: { id }, data: payload })).id
      : (await db.package.create({ data: payload })).id;
  }

  await logAudit({
    userId: actor.id,
    action: id ? AUDIT_ACTIONS.MASTER_UPDATE : AUDIT_ACTIONS.MASTER_CREATE,
    module: "master_data",
    entityType: ENTITY_LABEL[entity],
    entityId: entityId ?? undefined,
    description: `${id ? "Mengubah" : "Membuat"} ${ENTITY_LABEL[entity]} "${code} — ${data.name}"`,
  });
  revalidatePath(`/settings/master/${entity}`);
  back(entity, { ok: `${ENTITY_LABEL[entity]} tersimpan.` });
}

export async function toggleMasterAction(formData: FormData): Promise<void> {
  const actor = await requirePermission(PERMISSIONS.MASTER_DATA_MANAGE);
  const entity = String(formData.get("entity")) as MasterEntity;
  const id = String(formData.get("id") ?? "");
  if (!ENTITY_LABEL[entity]) back("cost-centers" as MasterEntity, { error: "Entitas tidak dikenal." });

  const record =
    entity === "cost-centers"
      ? await db.costCenter.findUnique({ where: { id } })
      : entity === "categories"
        ? await db.category.findUnique({ where: { id } })
        : entity === "areas"
          ? await db.area.findUnique({ where: { id } })
          : entity === "divisions"
            ? await db.division.findUnique({ where: { id } })
            : await db.package.findUnique({ where: { id } });
  if (!record) back(entity, { error: "Data tidak ditemukan." });

  const data = { isActive: !record.isActive };
  if (entity === "cost-centers") await db.costCenter.update({ where: { id }, data });
  else if (entity === "categories") await db.category.update({ where: { id }, data });
  else if (entity === "areas") await db.area.update({ where: { id }, data });
  else if (entity === "divisions") await db.division.update({ where: { id }, data });
  else await db.package.update({ where: { id }, data });

  await logAudit({
    userId: actor.id,
    action: AUDIT_ACTIONS.MASTER_TOGGLE,
    module: "master_data",
    entityType: ENTITY_LABEL[entity],
    entityId: id,
    description: `${record.isActive ? "Menonaktifkan" : "Mengaktifkan"} ${ENTITY_LABEL[entity]} "${record.code}"`,
  });
  revalidatePath(`/settings/master/${entity}`);
  back(entity, {
    ok: `${ENTITY_LABEL[entity]} "${record.code}" ${record.isActive ? "dinonaktifkan" : "diaktifkan"}.`,
  });
}
