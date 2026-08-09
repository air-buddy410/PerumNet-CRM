"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import {
  createOpnameSession,
  saveOpnameCounts,
  submitOpname,
  postOpname,
} from "@/lib/inventory";

export async function createOpnameAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.OPNAME_MANAGE);
  const warehouseId = String(formData.get("warehouseId") ?? "");
  const notes = String(formData.get("notes") ?? "") || undefined;
  if (!warehouseId) {
    redirect("/inventory/opname?error=" + encodeURIComponent("Pilih gudang."));
  }
  const result = await createOpnameSession(user, warehouseId, notes);
  revalidatePath("/inventory/opname");
  if (!result.ok) {
    redirect("/inventory/opname?error=" + encodeURIComponent(result.error));
  }
  redirect(
    `/inventory/opname/${result.id}?ok=` +
      encodeURIComponent("Sesi opname dibuka — cut-off qty sistem tersimpan.")
  );
}

export async function saveCountsAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.OPNAME_MANAGE);
  const sessionId = String(formData.get("sessionId") ?? "");
  const lineIds = formData.getAll("lineId").map(String);

  const counts = lineIds
    .map((lineId) => {
      const raw = String(formData.get(`counted_${lineId}`) ?? "").trim();
      if (raw === "") return null;
      return {
        lineId,
        countedQty: parseInt(raw, 10),
        reason: String(formData.get(`reason_${lineId}`) ?? "") || undefined,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null && !Number.isNaN(c.countedQty));

  const result = await saveOpnameCounts(user, sessionId, counts);
  redirect(
    `/inventory/opname/${sessionId}?` +
      (result.ok
        ? "ok=" + encodeURIComponent("Hasil hitung tersimpan.")
        : "error=" + encodeURIComponent(result.error))
  );
}

export async function submitOpnameAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.OPNAME_MANAGE);
  const sessionId = String(formData.get("sessionId") ?? "");
  const result = await submitOpname(user, sessionId);
  revalidatePath("/inventory/opname");
  redirect(
    `/inventory/opname/${sessionId}?` +
      (result.ok
        ? "ok=" + encodeURIComponent(result.data?.message ?? "Berhasil.")
        : "error=" + encodeURIComponent(result.error))
  );
}

export async function postOpnameAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.STOCK_POST);
  const sessionId = String(formData.get("sessionId") ?? "");
  const result = await postOpname(user, sessionId);
  revalidatePath("/inventory/opname");
  redirect(
    `/inventory/opname/${sessionId}?` +
      (result.ok
        ? "ok=" + encodeURIComponent("Adjustment diposting — saldo disesuaikan.")
        : "error=" + encodeURIComponent(result.error))
  );
}
