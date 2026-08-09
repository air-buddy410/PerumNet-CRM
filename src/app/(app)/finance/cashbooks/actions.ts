"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/constants";

const schema = z.object({
  id: z.string().optional(),
  code: z
    .string()
    .min(2, "Kode minimal 2 karakter")
    .regex(/^[A-Za-z0-9_-]+$/, "Kode hanya huruf/angka/strip/underscore"),
  name: z.string().min(2, "Nama minimal 2 karakter"),
});

export async function saveCashbookAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CASH_MANAGE);
  const parsed = schema.safeParse({
    ...Object.fromEntries(formData),
    id: formData.get("id") || undefined,
  });
  if (!parsed.success) {
    redirect(
      "/finance/cashbooks?error=" +
        encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")
    );
  }
  const d = parsed.data;
  const code = d.code.toUpperCase();
  const dup = await db.cashbook.findFirst({
    where: { code, ...(d.id ? { id: { not: d.id } } : {}) },
  });
  if (dup) {
    redirect("/finance/cashbooks?error=" + encodeURIComponent(`Kode "${code}" sudah dipakai.`));
  }
  // Saldo TIDAK ikut diedit — hanya code & nama (business rule 2).
  const cashbook = d.id
    ? await db.cashbook.update({ where: { id: d.id }, data: { code, name: d.name } })
    : await db.cashbook.create({ data: { code, name: d.name } });
  await logAudit({
    userId: user.id,
    action: d.id ? "CASHBOOK_UPDATE" : "CASHBOOK_CREATE",
    module: "finance",
    entityType: "Cashbook",
    entityId: cashbook.id,
    description: `${d.id ? "Mengubah" : "Membuat"} cashbook ${code} — ${d.name}`,
  });
  revalidatePath("/finance/cashbooks");
  redirect("/finance/cashbooks?ok=" + encodeURIComponent("Cashbook tersimpan."));
}

export async function toggleCashbookAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.CASH_MANAGE);
  const id = String(formData.get("id") ?? "");
  const cashbook = await db.cashbook.findUnique({ where: { id } });
  if (!cashbook) {
    redirect("/finance/cashbooks?error=" + encodeURIComponent("Cashbook tidak ditemukan."));
  }
  await db.cashbook.update({ where: { id }, data: { isActive: !cashbook.isActive } });
  await logAudit({
    userId: user.id,
    action: "CASHBOOK_TOGGLE",
    module: "finance",
    entityType: "Cashbook",
    entityId: id,
    description: `${cashbook.isActive ? "Menonaktifkan" : "Mengaktifkan"} cashbook ${cashbook.code}`,
  });
  revalidatePath("/finance/cashbooks");
  redirect("/finance/cashbooks?ok=" + encodeURIComponent(`Cashbook ${cashbook.code} diperbarui.`));
}
