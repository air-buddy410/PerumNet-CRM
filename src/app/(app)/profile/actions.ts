"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { AUDIT_ACTIONS } from "@/lib/constants";
import { revalidatePath } from "next/cache";
import { updateOwnContact, passwordChangeAvailable, passwordChangeTarget } from "@/lib/profile";
import { changeOwnMailPassword } from "@/lib/mailserver";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Isi password saat ini"),
    newPassword: z.string().min(8, "Password baru minimal 8 karakter"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Konfirmasi password tidak sama",
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: "Password baru harus berbeda dari password lama",
  });

export async function changePasswordAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const parsed = schema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    redirect(
      "/profile?error=" +
        encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")
    );
  }

  // Bila identitas dipegang penyedia luar, CRM tidak boleh mengubah password
  // apa pun — mengubah hash lokal hanya akan memberi rasa aman palsu sementara
  // kredensial yang sebenarnya tidak berubah.
  if (!passwordChangeAvailable()) {
    redirect(
      "/profile?error=" +
        encodeURIComponent(
          "Password dikelola penyedia identitas terpusat, bukan oleh CRM."
        )
    );
  }

  const dbUser = await db.user.findUnique({ where: { id: user.id } });
  if (!dbUser) redirect("/profile?error=" + encodeURIComponent("Akun tidak ditemukan."));

  // Fase 54 — di mode MAILSERVER, yang diganti adalah password EMAIL-nya di
  // mailcow, bukan hash lokal. Mengubah hash lokal di mode ini tidak berguna:
  // tidak ada yang memakainya untuk login, jadi orang akan mengira passwordnya
  // sudah berganti padahal kredensial yang sebenarnya tidak berubah sama sekali.
  if (passwordChangeTarget() === "MAILSERVER") {
    const r = await changeOwnMailPassword(
      { id: dbUser.id, name: dbUser.name, email: dbUser.email },
      parsed.data.currentPassword,
      parsed.data.newPassword,
      parsed.data.confirmPassword
    );
    if (!r.ok) redirect("/profile?error=" + encodeURIComponent(r.error));

    // Sesi di perangkat lain dimatikan, sama seperti ganti password lokal:
    // begitu password email berganti, perangkat yang masih memegang sesi lama
    // seharusnya ikut membuktikan diri lagi.
    const naik = await db.user.update({
      where: { id: dbUser.id },
      data: { sessionEpoch: { increment: 1 }, mustChangePassword: false },
    });
    await createSession({
      userId: naik.id,
      username: naik.username,
      name: naik.name,
      epoch: naik.sessionEpoch,
    });
    revalidatePath("/profile");
    redirect(
      "/profile?ok=" +
        encodeURIComponent(
          "Password email berhasil diganti. Pakai password baru ini untuk masuk CRM maupun webmail."
        )
    );
  }

  if (!(await verifyPassword(parsed.data.currentPassword, dbUser.passwordHash))) {
    redirect("/profile?error=" + encodeURIComponent("Password saat ini salah."));
  }

  // Menaikkan epoch mematikan SELURUH sesi lama, termasuk di perangkat lain.
  // Inilah yang membuat ganti password berguna saat akun disusupi; tanpa ini
  // penyusup tetap masuk sampai tokennya kedaluwarsa sendiri.
  const updated = await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(parsed.data.newPassword),
      mustChangePassword: false,
      sessionEpoch: { increment: 1 },
    },
  });
  // Sesi di perangkat INI diterbitkan ulang supaya pengguna tidak ikut
  // terlempar keluar setelah mengganti passwordnya sendiri.
  await createSession({
    userId: updated.id,
    username: updated.username,
    name: updated.name,
    epoch: updated.sessionEpoch,
  });
  await logAudit({
    userId: user.id,
    action: AUDIT_ACTIONS.PASSWORD_CHANGE,
    module: "users",
    entityType: "User",
    entityId: user.id,
    description: `${user.name} mengganti password sendiri`,
  });
  redirect("/profile?ok=" + encodeURIComponent("Password berhasil diganti."));
}

// ── Kontrak profil untuk frontend (Fase 34, PRD Frontend §10) ───

/**
 * Menyimpan kontak milik sendiri. Field: name, phone.
 *
 * Hanya nama tampilan dan telepon yang bisa diubah dari sini. Email,
 * username, role, divisi, NIK, dan jabatan sengaja tidak tersedia — semuanya
 * berkonsekuensi RBAC atau kepegawaian dan harus lewat modulnya sendiri.
 */
export async function updateContactAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const result = await updateOwnContact(user, {
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? "") || null,
  });
  revalidatePath("/profile");
  redirect(
    "/profile?" +
      (result.ok
        ? "ok=" + encodeURIComponent("Kontak diperbarui.")
        : "error=" + encodeURIComponent(result.error))
  );
}
