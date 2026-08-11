"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser, requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import {
  createMaterialRequest,
  cancelMaterialRequest,
  decideMaterialRequest,
  type MaterialRequestLineInput,
} from "@/lib/warehouse-docs";

const MAX_ROWS = 6;

export async function createMaterialRequestAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const lines: MaterialRequestLineInput[] = [];
  for (let i = 0; i < MAX_ROWS; i++) {
    const itemId = String(formData.get(`itemId_${i}`) ?? "");
    const qty = Number(formData.get(`qty_${i}`) ?? 0);
    if (!itemId || !Number.isFinite(qty) || qty <= 0) continue;
    lines.push({ itemId, qty: Math.floor(qty) });
  }

  const result = await createMaterialRequest(user, {
    warehouseId: String(formData.get("warehouseId") ?? ""),
    purpose: String(formData.get("purpose") ?? ""),
    note: String(formData.get("note") ?? ""),
    lines,
  });
  revalidatePath("/portal");
  redirect(
    "/portal?" +
      (result.ok
        ? "ok=" + encodeURIComponent("Permintaan terkirim — menunggu keputusan admin gudang.")
        : "error=" + encodeURIComponent(result.error))
  );
}

export async function cancelMaterialRequestAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const result = await cancelMaterialRequest(user, String(formData.get("requestId") ?? ""));
  revalidatePath("/portal");
  redirect(
    "/portal?" +
      (result.ok
        ? "ok=" + encodeURIComponent("Permintaan dibatalkan.")
        : "error=" + encodeURIComponent(result.error))
  );
}

export async function decideMaterialRequestAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.STOCK_CREATE);
  const approve = String(formData.get("approve") ?? "") === "yes";
  const result = await decideMaterialRequest(
    user,
    String(formData.get("requestId") ?? ""),
    approve,
    String(formData.get("decisionNote") ?? "")
  );
  revalidatePath("/inventory/requests");
  revalidatePath("/inventory/stock");
  redirect(
    "/inventory/requests?" +
      (result.ok
        ? "ok=" +
          encodeURIComponent(
            approve
              ? "Permintaan disetujui — draft pengeluaran dibuat dan stock direservasi."
              : "Permintaan ditolak."
          )
        : "error=" + encodeURIComponent(result.error))
  );
}
