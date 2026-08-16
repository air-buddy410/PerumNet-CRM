"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS, TRACKING_TYPES, ITEM_UNITS, DEVICE_CONDITIONS } from "@/lib/constants";
import { previewCatalogImport, applyCatalogImport } from "@/lib/item-import-service";

/** Kode kondisi barang, diturunkan dari satu daftar yang sama dengan formulir. */
const KODE_KONDISI = DEVICE_CONDITIONS.map(([v]) => v) as unknown as [string, ...string[]];

const itemSchema = z.object({
  id: z.string().optional(),
  code: z
    .string()
    .min(2, "Kode minimal 2 karakter")
    .regex(/^[A-Za-z0-9_-]+$/, "Kode hanya huruf/angka/strip/underscore"),
  name: z.string().min(2, "Nama minimal 2 karakter"),
  categoryId: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  unit: z.enum(ITEM_UNITS),
  trackingType: z.enum(TRACKING_TYPES.map(([v]) => v) as [string, ...string[]]),
  minStock: z.coerce.number().int().nonnegative().default(0),
  // Fase 74 — bidang katalog. Sudah terisi dari Impor Katalog, tetapi sampai
  // sekarang belum bisa disunting dari formulir.
  supplierId: z.string().optional(),
  purchaseCost: z.string().optional(),
  salePrice: z.string().optional(),
  // Diambil dari DEVICE_CONDITIONS, bukan ditulis ulang di sini. Daftar itu
  // memuat tiga nilai (`DAMAGED` ikut), dan menyalinnya jadi dua membuat
  // pilihan "Rusak" yang tampil di formulir ditolak sebagai "Input tidak
  // valid" — pesan yang tidak menyebut sebabnya, pada pilihan yang aplikasi
  // sendiri tawarkan.
  condition: z.enum(KODE_KONDISI).optional(),
});

/**
 * Rupiah dari formulir menjadi BigInt.
 *
 * `undefined` bila bidangnya tidak dikirim sama sekali — Prisma membacanya
 * sebagai "jangan sentuh". Formulir yang tidak menampilkan harga tidak boleh
 * menghapus harga hasil impor hanya karena ia tidak mengirimkannya.
 */
function rupiah(nilai: string | undefined, dikirim: boolean): bigint | null | undefined {
  if (!dikirim) return undefined;
  const bersih = (nilai ?? "").replace(/[^\d]/g, "");
  return bersih ? BigInt(bersih) : null;
}

export async function saveItemAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.ITEMS_MANAGE);
  const parsed = itemSchema.safeParse({
    ...Object.fromEntries(formData),
    id: formData.get("id") || undefined,
  });
  if (!parsed.success) {
    redirect(
      "/inventory/items?error=" +
        encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")
    );
  }
  const d = parsed.data;
  const code = d.code.toUpperCase();

  const dup = await db.item.findFirst({
    where: { code, ...(d.id ? { id: { not: d.id } } : {}) },
  });
  if (dup) {
    redirect("/inventory/items?error=" + encodeURIComponent(`Kode "${code}" sudah dipakai.`));
  }

  if (d.id) {
    // Tracking type tidak boleh berubah setelah item punya transaksi/perangkat.
    const existing = await db.item.findUnique({
      where: { id: d.id },
      include: { _count: { select: { txLines: true, devices: true } } },
    });
    if (!existing) redirect("/inventory/items?error=" + encodeURIComponent("Item tidak ditemukan."));
    if (
      existing.trackingType !== d.trackingType &&
      (existing._count.txLines > 0 || existing._count.devices > 0)
    ) {
      redirect(
        "/inventory/items?error=" +
          encodeURIComponent("Tracking type tidak dapat diubah karena item sudah memiliki transaksi/perangkat.")
      );
    }
  }

  // Pemasok yang disebut harus benar-benar ada. Menyimpan `supplierId` yang
  // tidak dikenal membuat Prisma menolak dengan galat relasi yang mentah.
  if (d.supplierId) {
    const ada = await db.supplier.findUnique({ where: { id: d.supplierId }, select: { id: true } });
    if (!ada) {
      redirect("/inventory/items?error=" + encodeURIComponent("Pemasok yang dipilih tidak ditemukan."));
    }
  }

  const data = {
    code,
    name: d.name,
    categoryId: d.categoryId || null,
    brand: d.brand || null,
    model: d.model || null,
    unit: d.unit,
    trackingType: d.trackingType,
    minStock: d.minStock,
    supplierId: formData.get("supplierId") === null ? undefined : d.supplierId || null,
    purchaseCost: rupiah(d.purchaseCost, formData.get("purchaseCost") !== null),
    salePrice: rupiah(d.salePrice, formData.get("salePrice") !== null),
    condition: d.condition,
  };
  const item = d.id
    ? await db.item.update({ where: { id: d.id }, data })
    : await db.item.create({ data });

  await logAudit({
    userId: user.id,
    action: d.id ? "ITEM_UPDATE" : "ITEM_CREATE",
    module: "inventory",
    entityType: "Item",
    entityId: item.id,
    description: `${d.id ? "Mengubah" : "Membuat"} item ${code} — ${d.name}`,
  });
  revalidatePath("/inventory/items");
  redirect("/inventory/items?ok=" + encodeURIComponent("Item tersimpan."));
}

export async function toggleItemAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.ITEMS_MANAGE);
  const id = String(formData.get("id") ?? "");
  const item = await db.item.findUnique({ where: { id } });
  if (!item) redirect("/inventory/items?error=" + encodeURIComponent("Item tidak ditemukan."));
  await db.item.update({ where: { id }, data: { isActive: !item.isActive } });
  await logAudit({
    userId: user.id,
    action: "ITEM_TOGGLE",
    module: "inventory",
    entityType: "Item",
    entityId: id,
    description: `${item.isActive ? "Menonaktifkan" : "Mengaktifkan"} item ${item.code}`,
  });
  revalidatePath("/inventory/items");
  redirect("/inventory/items?ok=" + encodeURIComponent(`Item ${item.code} diperbarui.`));
}

const warehouseSchema = z.object({
  id: z.string().optional(),
  code: z.string().min(2).regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().min(2, "Nama minimal 2 karakter"),
  address: z.string().optional(),
});

export async function saveWarehouseAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.ITEMS_MANAGE);
  const parsed = warehouseSchema.safeParse({
    ...Object.fromEntries(formData),
    id: formData.get("id") || undefined,
  });
  if (!parsed.success) {
    redirect(
      "/inventory/warehouses?error=" +
        encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")
    );
  }
  const d = parsed.data;
  const code = d.code.toUpperCase();
  const dup = await db.warehouse.findFirst({
    where: { code, ...(d.id ? { id: { not: d.id } } : {}) },
  });
  if (dup) {
    redirect("/inventory/warehouses?error=" + encodeURIComponent(`Kode "${code}" sudah dipakai.`));
  }
  const data = { code, name: d.name, address: d.address || null };
  const warehouse = d.id
    ? await db.warehouse.update({ where: { id: d.id }, data })
    : await db.warehouse.create({ data });
  await logAudit({
    userId: user.id,
    action: d.id ? "WAREHOUSE_UPDATE" : "WAREHOUSE_CREATE",
    module: "inventory",
    entityType: "Warehouse",
    entityId: warehouse.id,
    description: `${d.id ? "Mengubah" : "Membuat"} gudang ${code} — ${d.name}`,
  });
  revalidatePath("/inventory/warehouses");
  redirect("/inventory/warehouses?ok=" + encodeURIComponent("Gudang tersimpan."));
}

export async function toggleWarehouseAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.ITEMS_MANAGE);
  const id = String(formData.get("id") ?? "");
  const warehouse = await db.warehouse.findUnique({ where: { id } });
  if (!warehouse) redirect("/inventory/warehouses?error=" + encodeURIComponent("Gudang tidak ditemukan."));
  await db.warehouse.update({ where: { id }, data: { isActive: !warehouse.isActive } });
  await logAudit({
    userId: user.id,
    action: "WAREHOUSE_TOGGLE",
    module: "inventory",
    entityType: "Warehouse",
    entityId: id,
    description: `${warehouse.isActive ? "Menonaktifkan" : "Mengaktifkan"} gudang ${warehouse.code}`,
  });
  revalidatePath("/inventory/warehouses");
  redirect("/inventory/warehouses?ok=" + encodeURIComponent(`Gudang ${warehouse.code} diperbarui.`));
}

// ── Impor katalog material (Fase 61) ────────────────────────────
//
// Keduanya MENGEMBALIKAN nilai alih-alih redirect: hasil pratinjau adalah
// tabel yang harus dibaca dulu sebelum admin gudang memutuskan.
//
// Penerapan mengunggah ULANG berkasnya, bukan mengirim baris hasil pratinjau.
// Pratinjau yang teliti tidak ada gunanya kalau penerapannya percaya begitu
// saja pada apa yang datang dari peramban.

export async function previewCatalogImportAction(formData: FormData) {
  const user = await requirePermission(PERMISSIONS.ITEMS_MANAGE);
  return previewCatalogImport(user, formData.get("file") as File, String(formData.get("warehouseId") ?? ""));
}

export async function applyCatalogImportAction(formData: FormData) {
  const user = await requirePermission(PERMISSIONS.ITEMS_MANAGE);
  // `allowPartial` HARUS datang dari centang yang sadar di layar, bukan
  // nilai bawaan. Melewati baris bermasalah adalah keputusan operator.
  const result = await applyCatalogImport(user, formData.get("file") as File, String(formData.get("warehouseId") ?? ""), {
    allowPartial: formData.get("allowPartial") === "1",
  });
  if (result.ok) {
    revalidatePath("/inventory/items");
    revalidatePath("/inventory/stock");
  }
  return result;
}

// ── Master pemasok (Fase 74) ────────────────────────────────────
//
// Dipisahkan dari `NetworkDevice.vendor`, yang artinya MEREK perangkat
// (ZTE, MikroTik) dan bukan pihak yang menjualnya.

const supplierSchema = z.object({
  id: z.string().optional(),
  code: z
    .string()
    .min(2, "Kode minimal 2 karakter")
    .regex(/^[A-Za-z0-9_-]+$/, "Kode hanya huruf/angka/strip/underscore"),
  name: z.string().min(2, "Nama minimal 2 karakter"),
  phone: z.string().optional(),
  email: z.string().email("Email tidak valid").optional().or(z.literal("")),
  address: z.string().optional(),
  website: z.string().optional(),
  notes: z.string().optional(),
});

export async function saveSupplierAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.ITEMS_MANAGE);
  const parsed = supplierSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect("/inventory/suppliers?error=" + encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid"));
  }
  const { id, code, ...d } = parsed.data;
  const data = {
    code: code.toUpperCase(),
    name: d.name,
    phone: d.phone || null,
    email: d.email || null,
    address: d.address || null,
    website: d.website || null,
    notes: d.notes || null,
  };

  const bentrok = await db.supplier.findFirst({ where: { code: data.code, ...(id ? { NOT: { id } } : {}) }, select: { id: true } });
  if (bentrok) {
    redirect("/inventory/suppliers?error=" + encodeURIComponent(`Kode ${data.code} sudah dipakai pemasok lain.`));
  }

  const hasil = id
    ? await db.supplier.update({ where: { id }, data })
    : await db.supplier.create({ data });

  await logAudit({
    userId: user.id,
    action: id ? "SUPPLIER_UPDATE" : "SUPPLIER_CREATE",
    module: "inventory",
    entityType: "Supplier",
    entityId: hasil.id,
    description: `${id ? "Mengubah" : "Membuat"} pemasok ${data.code} — ${data.name}`,
  });
  revalidatePath("/inventory/suppliers");
  redirect("/inventory/suppliers?ok=" + encodeURIComponent(`Pemasok ${data.code} disimpan.`));
}

export async function toggleSupplierAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.ITEMS_MANAGE);
  const id = String(formData.get("id") ?? "");
  const s = await db.supplier.findUnique({ where: { id }, select: { id: true, code: true, isActive: true } });
  if (!s) redirect("/inventory/suppliers?error=" + encodeURIComponent("Pemasok tidak ditemukan."));

  // DINONAKTIFKAN, tidak dihapus. Pemasok yang pernah dipakai tetap jadi
  // bagian riwayat pembelian barang; menghapusnya memutus asal-usul harga.
  await db.supplier.update({ where: { id }, data: { isActive: !s.isActive } });
  await logAudit({
    userId: user.id,
    action: "SUPPLIER_TOGGLE",
    module: "inventory",
    entityType: "Supplier",
    entityId: id,
    description: `${s.isActive ? "Menonaktifkan" : "Mengaktifkan"} pemasok ${s.code}`,
  });
  revalidatePath("/inventory/suppliers");
  redirect("/inventory/suppliers?ok=" + encodeURIComponent(`Pemasok ${s.code} diperbarui.`));
}
