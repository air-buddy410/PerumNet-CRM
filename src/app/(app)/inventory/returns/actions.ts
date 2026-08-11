"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser, requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import {
  createReturnRequest,
  verifyReturnRequest,
  RETURN_CONDITIONS,
  type ReturnLineInput,
  type ReturnCondition,
} from "@/lib/warehouse-docs";

const MAX_ROWS = 10;

export async function createReturnAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const warehouseToId = String(formData.get("warehouseToId") ?? "");
  const note = String(formData.get("note") ?? "");

  const lines: ReturnLineInput[] = [];
  for (let i = 0; i < MAX_ROWS; i++) {
    const itemId = String(formData.get(`itemId_${i}`) ?? "");
    if (!itemId) continue;
    const qty = Number(formData.get(`qty_${i}`) ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const condition = String(formData.get(`condition_${i}`) ?? "GOOD") as ReturnCondition;
    if (!RETURN_CONDITIONS.includes(condition)) continue;
    const deviceId = String(formData.get(`deviceId_${i}`) ?? "");
    lines.push({ itemId, qty: Math.floor(qty), condition, deviceId: deviceId || null });
  }

  const result = await createReturnRequest(user, { warehouseToId, note, lines });
  revalidatePath("/inventory/returns");
  redirect(
    result.ok
      ? "/inventory/returns?ok=" + encodeURIComponent("Pengajuan pengembalian terkirim.")
      : "/inventory/returns/new?error=" + encodeURIComponent(result.error)
  );
}

export async function verifyReturnAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.STOCK_POST);
  const requestId = String(formData.get("requestId") ?? "");
  const accept = String(formData.get("accept") ?? "") === "yes";
  const verifyNote = String(formData.get("verifyNote") ?? "");

  const result = await verifyReturnRequest(user, requestId, accept, verifyNote);
  revalidatePath("/inventory/returns");
  revalidatePath("/inventory/stock");
  redirect(
    "/inventory/returns?" +
      (result.ok
        ? "ok=" +
          encodeURIComponent(
            accept ? "Pengembalian diterima — stock diperbarui." : "Pengembalian ditolak."
          )
        : "error=" + encodeURIComponent(result.error))
  );
}
