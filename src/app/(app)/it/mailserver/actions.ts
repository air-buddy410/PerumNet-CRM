"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { saveIntegration } from "@/lib/integrations";
import {
  loadMailcowIntegration,
  testMailcowConnection,
  pushDivisionTag,
  pushAllDivisionTags,
  MAILCOW_CODE,
} from "@/lib/mailserver";

// Setting mailserver = kewenangan it_manager (`integrations.manage`).
// Pengelolaan mailbox = kewenangan it_support DAN it_manager (`access.manage`),
// karena onboarding/offboarding akun internal memang pekerjaan IT Support.

export async function saveMailserverAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.INTEGRATIONS_MANAGE);
  const existing = await loadMailcowIntegration();

  const result = await saveIntegration(user, {
    id: existing?.id,
    code: MAILCOW_CODE,
    name: "Mailserver mailcow",
    category: "ITOPS",
    provider: "MAILCOW",
    baseUrl: String(formData.get("baseUrl") ?? ""),
    authType: "API_KEY",
    // Hanya NAMA env var. Tidak ada field untuk API key-nya sendiri, dan
    // saveIntegration menolak apa pun yang tidak berbentuk nama env var.
    credentialRef: String(formData.get("credentialRef") ?? ""),
    isEnabled: formData.get("isEnabled") === "on",
    notes: String(formData.get("notes") ?? ""),
  });

  revalidatePath("/it/mailserver");
  redirect(
    "/it/mailserver?" +
      (result.ok
        ? "ok=" + encodeURIComponent("Setting mailserver tersimpan.")
        : "error=" + encodeURIComponent(result.error))
  );
}

export async function testMailserverAction(): Promise<void> {
  const user = await requirePermission(PERMISSIONS.INTEGRATIONS_MANAGE);
  const probe = await testMailcowConnection(user);
  revalidatePath("/it/mailserver");
  redirect(
    "/it/mailserver?" +
      (probe.ok
        ? "ok=" +
          encodeURIComponent(
            `Terhubung — mailcow ${probe.version}, ${probe.mailboxCount} mailbox terbaca.`
          )
        : "error=" + encodeURIComponent(probe.error ?? "Gagal tanpa keterangan."))
  );
}

export async function pushTagAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.ACCESS_MANAGE);
  const email = String(formData.get("email") ?? "");
  const result = await pushDivisionTag(user, email);
  revalidatePath("/it/mailboxes");
  redirect(
    "/it/mailboxes?" +
      (result.ok
        ? "ok=" + encodeURIComponent(`Tag divisi ${email} diperbarui di mailserver.`)
        : "error=" + encodeURIComponent(result.error))
  );
}

export async function pushAllTagsAction(): Promise<void> {
  const user = await requirePermission(PERMISSIONS.ACCESS_MANAGE);
  const r = await pushAllDivisionTags(user);
  revalidatePath("/it/mailboxes");
  const msg = `${r.pushed} tag diperbarui${r.failed ? `, ${r.failed} gagal` : ""}.`;
  redirect(
    "/it/mailboxes?" +
      (r.failed === 0
        ? "ok=" + encodeURIComponent(msg)
        : // Sebagian gagal tetap dilaporkan sebagai galat beserta sebabnya —
          // "12 diperbarui" yang menyembunyikan 3 kegagalan menyesatkan.
          "error=" + encodeURIComponent(`${msg} ${r.errors.slice(0, 3).join(" · ")}`))
  );
}
