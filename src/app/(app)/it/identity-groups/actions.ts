"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { saveIntegration } from "@/lib/integrations";
import {
  loadAuthentikIntegration,
  testAuthentikConnection,
  applyGroupSync,
  AUTHENTIK_CODE,
} from "@/lib/identity-groups";

// Setting dan penerapan sinkronisasi grup Authentik.
//
// Izinnya `integrations.manage` (dipegang it_manager): menerbitkan divisi ke
// IdP berarti menentukan siapa bisa masuk aplikasi lain, dan itu bukan
// kewenangan sehari-hari.

export async function saveAuthentikAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.INTEGRATIONS_MANAGE);
  const existing = await loadAuthentikIntegration();

  const result = await saveIntegration(user, {
    id: existing?.id,
    code: AUTHENTIK_CODE,
    name: "Authentik (penyedia identitas)",
    category: "ITOPS",
    provider: "AUTHENTIK",
    // Boleh dikosongkan — kalau kosong, alamatnya diturunkan dari OIDC_ISSUER
    // sehingga tidak mungkin ada dua alamat yang berbeda pendapat.
    baseUrl: String(formData.get("baseUrl") ?? ""),
    authType: "TOKEN",
    // Hanya NAMA env var. Tidak ada field untuk tokennya sendiri.
    credentialRef: String(formData.get("credentialRef") ?? ""),
    isEnabled: formData.get("isEnabled") === "on",
    notes: String(formData.get("notes") ?? ""),
  });

  revalidatePath("/it/identity-groups");
  redirect(
    "/it/identity-groups?" +
      (result.ok
        ? "ok=" + encodeURIComponent("Setting Authentik tersimpan.")
        : "error=" + encodeURIComponent(result.error))
  );
}

export async function testAuthentikAction(): Promise<void> {
  const user = await requirePermission(PERMISSIONS.INTEGRATIONS_MANAGE);
  const probe = await testAuthentikConnection(user);
  revalidatePath("/it/identity-groups");
  redirect(
    "/it/identity-groups?" +
      (probe.ok
        ? "ok=" +
          encodeURIComponent(
            `Terhubung — ${probe.userCount} pengguna, ${probe.groupCount} grup terbaca.`
          )
        : "error=" + encodeURIComponent(probe.error ?? "Gagal tanpa keterangan."))
  );
}

/**
 * Menerapkan rencana ke Authentik.
 *
 * Tidak menerima rencana dari form — `applyGroupSync` menghitungnya ulang.
 * Rencana yang dikirim dari peramban bisa saja sudah basi, dan menerapkan
 * rencana basi berarti mengeluarkan orang dari grup berdasarkan keadaan yang
 * sudah tidak berlaku.
 */
export async function applyGroupSyncAction(): Promise<void> {
  const user = await requirePermission(PERMISSIONS.INTEGRATIONS_MANAGE);
  const r = await applyGroupSync(user);
  revalidatePath("/it/identity-groups");

  const msg =
    `${r.created} grup dibuat · ${r.added} ditambahkan · ${r.removed} dikeluarkan` +
    (r.failed ? `, ${r.failed} gagal` : ".");
  redirect(
    "/it/identity-groups?" +
      (r.failed === 0
        ? "ok=" + encodeURIComponent(msg)
        : // Sebagian gagal tetap dilaporkan sebagai galat beserta sebabnya —
          // ringkasan yang menyembunyikan kegagalan lebih buruk daripada
          // tidak ada ringkasan.
          "error=" + encodeURIComponent(`${msg} ${r.errors.slice(0, 3).join(" · ")}`))
  );
}
