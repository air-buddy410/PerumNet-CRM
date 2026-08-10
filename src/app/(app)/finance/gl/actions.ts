"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, POSTING_EVENTS } from "@/lib/constants";
import {
  saveAccount,
  savePostingRule,
  createJournalEntry,
  reverseJournalEntry,
  type JournalLineInput,
} from "@/lib/gl";

function parseRupiah(v: FormDataEntryValue | null): bigint {
  return BigInt(String(v ?? "").replace(/[^0-9]/g, "") || "0");
}

export async function saveAccountAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.GL_MANAGE);
  const tax = String(formData.get("taxPercent") ?? "").trim();
  const result = await saveAccount(user, {
    id: String(formData.get("id") ?? "") || undefined,
    code: String(formData.get("code") ?? ""),
    name: String(formData.get("name") ?? ""),
    category: String(formData.get("category") ?? ""),
    parentId: String(formData.get("parentId") ?? "") || null,
    isTaxAccount: formData.get("isTaxAccount") === "on",
    taxPercent: tax ? Number(tax) : null,
    cashbookId: String(formData.get("cashbookId") ?? "") || null,
    isActive: formData.get("isActive") === "on",
  });
  revalidatePath("/finance/gl/accounts");
  redirect(
    "/finance/gl/accounts?" +
      (result.ok ? "ok=" + encodeURIComponent("Akun tersimpan.") : "error=" + encodeURIComponent(result.error))
  );
}

export async function savePostingRuleAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.GL_MANAGE);
  const event = String(formData.get("event") ?? "");
  if (!POSTING_EVENTS.some(([e]) => e === event)) {
    redirect("/finance/gl/accounts?error=" + encodeURIComponent("Event posting tidak dikenal."));
  }
  const result = await savePostingRule(user, {
    event,
    debitAccountId: String(formData.get("debitAccountId") ?? "") || null,
    creditAccountId: String(formData.get("creditAccountId") ?? "") || null,
    isActive: formData.get("isActive") === "on",
  });
  revalidatePath("/finance/gl/accounts");
  redirect(
    "/finance/gl/accounts?" +
      (result.ok ? "ok=" + encodeURIComponent("Posting rule tersimpan.") : "error=" + encodeURIComponent(result.error))
  );
}

export async function createManualJournalAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.GL_POST);
  const date = String(formData.get("entryDate") ?? "");
  const lines: JournalLineInput[] = [];
  for (let i = 0; i < 6; i++) {
    const accountId = String(formData.get(`line${i}_accountId`) ?? "");
    if (!accountId) continue;
    const debit = parseRupiah(formData.get(`line${i}_debit`));
    const credit = parseRupiah(formData.get(`line${i}_credit`));
    lines.push({
      accountId,
      debit,
      credit,
      description: String(formData.get(`line${i}_description`) ?? "") || undefined,
    });
  }
  const result = await createJournalEntry(user, {
    entryDate: date ? new Date(date) : new Date(NaN),
    source: "MANUAL",
    memo: String(formData.get("memo") ?? "") || undefined,
    lines,
  });
  revalidatePath("/finance/gl/journal");
  if (!result.ok) {
    redirect("/finance/gl/journal/new?error=" + encodeURIComponent(result.error));
  }
  redirect(`/finance/gl/journal/${result.id}?ok=` + encodeURIComponent("Jurnal diposting."));
}

export async function reverseJournalAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.GL_POST);
  const id = String(formData.get("entryId") ?? "");
  const result = await reverseJournalEntry(user, id, String(formData.get("reason") ?? ""));
  revalidatePath("/finance/gl/journal");
  redirect(
    `/finance/gl/journal/${id}?` +
      (result.ok ? "ok=" + encodeURIComponent("Jurnal dibalik.") : "error=" + encodeURIComponent(result.error))
  );
}
