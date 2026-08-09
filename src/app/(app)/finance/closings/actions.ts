"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatRupiah } from "@/lib/constants";
import { createClosing } from "@/lib/finance";

function parseRp(v: FormDataEntryValue | null): bigint {
  const digits = String(v ?? "").replace(/[^\d]/g, "");
  return digits ? BigInt(digits) : BigInt(0);
}

export async function createClosingAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CLOSINGS_MANAGE);
  const type = String(formData.get("type") ?? "DAILY") as "DAILY" | "MONTHLY";
  const lockedUntilRaw = String(formData.get("lockedUntil") ?? "");

  const result = await createClosing(user, {
    cashbookId: String(formData.get("cashbookId") ?? ""),
    type,
    physicalBalance: parseRp(formData.get("physicalBalance")),
    reason: String(formData.get("reason") ?? "") || undefined,
    lockedUntil: lockedUntilRaw ? new Date(lockedUntilRaw + "T23:59:59") : null,
  });
  revalidatePath("/finance/closings");
  revalidatePath("/finance/cashbooks");
  if (!result.ok) {
    redirect("/finance/closings?error=" + encodeURIComponent(result.error));
  }
  const variance = BigInt(result.data?.variance ?? "0");
  redirect(
    "/finance/closings?ok=" +
      encodeURIComponent(
        variance === BigInt(0)
          ? "Closing tercatat — kas sesuai sistem."
          : `Closing tercatat dengan variance ${formatRupiah(variance)} (masuk variance report).`
      )
  );
}
