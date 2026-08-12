"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { restoreRecord } from "@/lib/archive";

// SENGAJA hanya ada satu action di sini: memulihkan.
//
// Tidak ada action menghapus permanen, dan itu bukan kelalaian — arsip yang
// bisa dikosongkan bukan arsip. Bila suatu saat ada permintaan menambahkannya,
// jawabannya ada di komentar model ArchivedRecord dan di src/lib/archive.ts.

export async function restoreArchivedAction(formData: FormData): Promise<void> {
  const actor = await requirePermission(PERMISSIONS.ARCHIVE_RESTORE);
  const id = String(formData.get("id") ?? "");
  const result = await restoreRecord(actor, id);
  revalidatePath("/settings/trash");
  redirect(
    "/settings/trash?" +
      (result.ok
        ? "ok=" + encodeURIComponent("Baris dipulihkan.")
        : "error=" + encodeURIComponent(result.error))
  );
}
