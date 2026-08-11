"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { moveAllocation, deactivateSlot } from "@/lib/slots";

export async function createSlotAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.STOCK_CREATE);
  const warehouseId = String(formData.get("warehouseId") ?? "");
  const typeId = String(formData.get("typeId") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();

  let error = "";
  if (!warehouseId || !typeId || !code) {
    error = "Gudang, tipe, dan kode slot wajib diisi.";
  } else {
    const exists = await db.stockSlot.findFirst({ where: { warehouseId, code } });
    if (exists) error = `Slot dengan kode ${code} sudah ada di gudang tersebut.`;
  }

  if (!error) {
    const slot = await db.stockSlot.create({
      data: { warehouseId, typeId, code, name: name || null },
    });
    await logAudit({
      userId: user.id,
      action: "SLOT_CREATE",
      module: "inventory",
      entityType: "StockSlot",
      entityId: slot.id,
      description: `Membuat slot ${code}`,
    });
  }

  revalidatePath("/inventory/slots");
  redirect(
    "/inventory/slots?" +
      (error ? "error=" + encodeURIComponent(error) : "ok=" + encodeURIComponent("Slot dibuat."))
  );
}

export async function moveAllocationAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.STOCK_CREATE);
  const result = await moveAllocation(user, {
    warehouseId: String(formData.get("warehouseId") ?? ""),
    itemId: String(formData.get("itemId") ?? ""),
    fromSlotId: String(formData.get("fromSlotId") ?? "") || null,
    toSlotId: String(formData.get("toSlotId") ?? "") || null,
    qty: Number(formData.get("qty") ?? 0),
    note: String(formData.get("note") ?? ""),
  });
  revalidatePath("/inventory/slots");
  redirect(
    "/inventory/slots?" +
      (result.ok
        ? "ok=" + encodeURIComponent("Alokasi diperbarui.")
        : "error=" + encodeURIComponent(result.error))
  );
}

export async function deactivateSlotAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.STOCK_CREATE);
  const result = await deactivateSlot(user, String(formData.get("slotId") ?? ""));
  revalidatePath("/inventory/slots");
  redirect(
    "/inventory/slots?" +
      (result.ok
        ? "ok=" + encodeURIComponent("Slot dinonaktifkan.")
        : "error=" + encodeURIComponent(result.error))
  );
}
