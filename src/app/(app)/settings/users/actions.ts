"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { hashPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS, AUDIT_ACTIONS, USER_LEVELS } from "@/lib/constants";
import { freezeAccount, unfreezeAccount } from "@/lib/employment-lifecycle";
import { authProviderMode } from "@/lib/oidc";
import { resetMailPasswordFor } from "@/lib/mailserver";

const orgSchema = z.object({
  level: z.enum([USER_LEVELS.STAFF, USER_LEVELS.SUPERVISOR, USER_LEVELS.OWNER]),
  divisionId: z.string().optional(),
});

const createSchema = orgSchema.extend({
  name: z.string().min(2, "Nama minimal 2 karakter"),
  username: z
    .string()
    .min(3, "Username minimal 3 karakter")
    .regex(/^[a-z0-9._-]+$/, "Username hanya huruf kecil, angka, titik, strip"),
  email: z.string().email("Email tidak valid"),
  phone: z.string().optional(),
  password: z.string().min(8, "Password minimal 8 karakter"),
});

export async function createUserAction(formData: FormData): Promise<void> {
  const actor = await requirePermission(PERMISSIONS.USERS_CREATE);

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    username: formData.get("username"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    password: formData.get("password"),
    level: formData.get("level"),
    divisionId: formData.get("divisionId") || undefined,
  });
  if (!parsed.success) {
    redirect(
      "/settings/users/new?error=" +
        encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")
    );
  }
  if (parsed.data.level !== USER_LEVELS.OWNER && !parsed.data.divisionId) {
    redirect(
      "/settings/users/new?error=" +
        encodeURIComponent("Staff dan Supervisor wajib memiliki divisi.")
    );
  }
  const roleIds = formData.getAll("roleIds").map(String).filter(Boolean);
  if (roleIds.length === 0) {
    redirect(
      "/settings/users/new?error=" + encodeURIComponent("Pilih minimal satu role.")
    );
  }

  const dup = await db.user.findFirst({
    where: {
      OR: [{ username: parsed.data.username }, { email: parsed.data.email }],
    },
  });
  if (dup) {
    redirect(
      "/settings/users/new?error=" +
        encodeURIComponent("Username atau email sudah digunakan.")
    );
  }

  const user = await db.user.create({
    data: {
      name: parsed.data.name,
      username: parsed.data.username,
      email: parsed.data.email,
      phone: parsed.data.phone,
      level: parsed.data.level,
      divisionId: parsed.data.divisionId ?? null,
      passwordHash: await hashPassword(parsed.data.password),
      mustChangePassword: true,
      roles: { create: roleIds.map((roleId) => ({ roleId })) },
    },
  });
  await logAudit({
    userId: actor.id,
    action: AUDIT_ACTIONS.USER_CREATE,
    module: "users",
    entityType: "User",
    entityId: user.id,
    description: `Membuat user "${user.username}" (${user.name})`,
    metadata: { roleIds },
  });
  revalidatePath("/settings/users");
  redirect(
    `/settings/users/${user.id}?ok=` + encodeURIComponent("User berhasil dibuat.")
  );
}

const updateSchema = orgSchema.extend({
  userId: z.string().min(1),
  name: z.string().min(2, "Nama minimal 2 karakter"),
  email: z.string().email("Email tidak valid"),
  phone: z.string().optional(),
});

export async function updateUserAction(formData: FormData): Promise<void> {
  const actor = await requirePermission(PERMISSIONS.USERS_EDIT);
  const parsed = updateSchema.safeParse({
    userId: formData.get("userId"),
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    level: formData.get("level"),
    divisionId: formData.get("divisionId") || undefined,
  });
  if (!parsed.success) {
    redirect(
      "/settings/users?error=" +
        encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")
    );
  }
  const { userId, divisionId, ...data } = parsed.data;
  if (parsed.data.level !== USER_LEVELS.OWNER && !divisionId) {
    redirect(
      `/settings/users/${userId}?error=` +
        encodeURIComponent("Staff dan Supervisor wajib memiliki divisi.")
    );
  }
  const roleIds = formData.getAll("roleIds").map(String).filter(Boolean);
  if (roleIds.length === 0) {
    redirect(
      `/settings/users/${userId}?error=` + encodeURIComponent("Pilih minimal satu role.")
    );
  }

  const before = await db.user.findUnique({
    where: { id: userId },
    include: { roles: true },
  });
  if (!before) {
    redirect("/settings/users?error=" + encodeURIComponent("User tidak ditemukan."));
  }

  const dup = await db.user.findFirst({
    where: { email: data.email, id: { not: userId } },
  });
  if (dup) {
    redirect(
      `/settings/users/${userId}?error=` +
        encodeURIComponent("Email sudah digunakan user lain.")
    );
  }

  const beforeRoleIds = before.roles.map((r) => r.roleId).sort();
  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: { ...data, divisionId: divisionId ?? null },
    }),
    db.userRole.deleteMany({ where: { userId } }),
    db.userRole.createMany({
      data: roleIds.map((roleId) => ({ userId, roleId })),
    }),
  ]);

  await logAudit({
    userId: actor.id,
    action: AUDIT_ACTIONS.USER_UPDATE,
    module: "users",
    entityType: "User",
    entityId: userId,
    description: `Mengubah data user "${before.username}"`,
  });
  const rolesChanged =
    JSON.stringify(beforeRoleIds) !== JSON.stringify([...roleIds].sort());
  if (rolesChanged) {
    await logAudit({
      userId: actor.id,
      action: AUDIT_ACTIONS.USER_ROLE_CHANGE,
      module: "users",
      entityType: "User",
      entityId: userId,
      description: `Mengubah role user "${before.username}"`,
      metadata: { before: beforeRoleIds, after: roleIds },
    });
  }
  revalidatePath("/settings/users");
  redirect(
    `/settings/users/${userId}?ok=` + encodeURIComponent("Perubahan tersimpan.")
  );
}

export async function toggleUserActiveAction(formData: FormData): Promise<void> {
  const actor = await requirePermission(PERMISSIONS.USERS_EDIT);
  const userId = String(formData.get("userId") ?? "");

  if (userId === actor.id) {
    redirect(
      `/settings/users/${userId}?error=` +
        encodeURIComponent("Anda tidak dapat menonaktifkan akun sendiri.")
    );
  }
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) {
    redirect("/settings/users?error=" + encodeURIComponent("User tidak ditemukan."));
  }

  await db.user.update({
    where: { id: userId },
    data: { isActive: !user.isActive },
  });
  await logAudit({
    userId: actor.id,
    action: user.isActive
      ? AUDIT_ACTIONS.USER_DEACTIVATE
      : AUDIT_ACTIONS.USER_ACTIVATE,
    module: "users",
    entityType: "User",
    entityId: userId,
    description: `${user.isActive ? "Menonaktifkan" : "Mengaktifkan"} user "${user.username}"`,
  });
  revalidatePath("/settings/users");
  redirect(
    `/settings/users/${userId}?ok=` +
      encodeURIComponent(`User ${user.isActive ? "dinonaktifkan" : "diaktifkan"}.`)
  );
}

export async function resetPasswordAction(formData: FormData): Promise<void> {
  const actor = await requirePermission(PERMISSIONS.USERS_EDIT);
  const userId = String(formData.get("userId") ?? "");
  const password = String(formData.get("password") ?? "");

  if (password.length < 8) {
    redirect(
      `/settings/users/${userId}?error=` +
        encodeURIComponent("Password minimal 8 karakter.")
    );
  }
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) {
    redirect("/settings/users?error=" + encodeURIComponent("User tidak ditemukan."));
  }

  // Fase 56 — ke mana reset ini sebenarnya pergi.
  //
  // Pembagiannya PERSIS sama dengan login(): di mode MAILSERVER yang dipakai
  // masuk adalah password email, kecuali untuk akun darurat yang memang tetap
  // memakai hash lokal. Kalau tidak dibedakan begini, IT menekan tombol,
  // muncul pesan berhasil, dan orangnya tetap tidak bisa masuk — gagal
  // diam-diam sambil melapor sukses.
  const lewatMailserver = authProviderMode() === "MAILSERVER" && !user.allowLocalLogin;

  if (lewatMailserver) {
    const r = await resetMailPasswordFor(
      { id: actor.id, name: actor.name },
      { id: user.id, name: user.name, username: user.username, email: user.email },
      password
    );
    if (!r.ok) {
      redirect(`/settings/users/${userId}?error=` + encodeURIComponent(r.error));
    }
    // Sesi lama dimatikan: password yang dipakai masuk sudah berganti.
    // mustChangePassword memaksa yang bersangkutan memasang password sendiri
    // pada login pertama — password sementara dari IT tidak boleh menetap.
    await db.user.update({
      where: { id: userId },
      data: { mustChangePassword: true, sessionEpoch: { increment: 1 } },
    });
    redirect(
      `/settings/users/${userId}?ok=` +
        encodeURIComponent(
          "Password EMAIL direset di mailserver. Sampaikan lewat jalur langsung — " +
            "yang bersangkutan wajib menggantinya sendiri saat login pertama."
        )
    );
  }

  await db.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
      sessionEpoch: { increment: 1 },
    },
  });
  await logAudit({
    userId: actor.id,
    action: AUDIT_ACTIONS.PASSWORD_RESET,
    module: "users",
    entityType: "User",
    entityId: userId,
    description: `Reset password user "${user.username}"`,
  });
  redirect(
    `/settings/users/${userId}?ok=` +
      encodeURIComponent("Password direset. User wajib menggantinya saat login.")
  );
}

// ── Pembekuan akun (Fase 42) ────────────────────────────────────
// Beku BUKAN nonaktif. Nonaktif dipakai untuk akun yang memang sudah selesai
// riwayatnya; beku dipakai saat orangnya berhenti berhak masuk tetapi masih
// mungkin kembali — kontrak habis, cuti panjang, penyelidikan internal.
// Perbedaannya penting karena beku punya masa tenggang dan berujung arsip.

export async function freezeUserAction(formData: FormData): Promise<void> {
  const actor = await requirePermission(PERMISSIONS.USERS_EDIT);
  const userId = String(formData.get("userId") ?? "");
  const reason = String(formData.get("reason") ?? "");

  // Membekukan diri sendiri berarti mengunci diri di luar tanpa jalan kembali:
  // pencairan pun butuh akun yang bisa masuk.
  if (userId === actor.id) {
    redirect(
      `/settings/users/${userId}?error=` +
        encodeURIComponent("Anda tidak dapat membekukan akun sendiri.")
    );
  }
  const result = await freezeAccount(actor.id, userId, reason);
  revalidatePath("/settings/users");
  revalidatePath(`/settings/users/${userId}`);
  redirect(
    `/settings/users/${userId}?` +
      (result.ok
        ? "ok=" + encodeURIComponent("Akun dibekukan.")
        : "error=" + encodeURIComponent(result.error))
  );
}

export async function unfreezeUserAction(formData: FormData): Promise<void> {
  const actor = await requirePermission(PERMISSIONS.USERS_EDIT);
  const userId = String(formData.get("userId") ?? "");
  const reason = String(formData.get("reason") ?? "");

  const result = await unfreezeAccount(actor, userId, reason);
  revalidatePath("/settings/users");
  revalidatePath(`/settings/users/${userId}`);
  redirect(
    `/settings/users/${userId}?` +
      (result.ok
        ? "ok=" + encodeURIComponent("Akun dicairkan — pemiliknya bisa masuk kembali.")
        : "error=" + encodeURIComponent(result.error))
  );
}

// ── Akun darurat / break-glass (Fase 45) ────────────────────────
// Menandai akun yang tetap boleh masuk memakai password lokal walaupun
// identitas terpusat aktif. Tanpa minimal satu akun bertanda ini, penyedia
// identitas yang mati mengunci seluruh perusahaan dari CRM — termasuk dari
// memperbaiki penyedianya.
//
// Karena itu izinnya sengaja PALING TINGGI (users.create, bukan users.edit):
// menandai akun darurat berarti memberi jalan pintas permanen ke sistem.

export async function toggleBreakGlassAction(formData: FormData): Promise<void> {
  const actor = await requirePermission(PERMISSIONS.USERS_CREATE);
  const userId = String(formData.get("userId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (reason.length < 3) {
    redirect(
      `/settings/users/${userId}?error=` +
        encodeURIComponent("Alasan wajib diisi — penandaan akun darurat harus bisa ditelusuri.")
    );
  }
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) {
    redirect("/settings/users?error=" + encodeURIComponent("User tidak ditemukan."));
  }
  const next = !target.allowLocalLogin;

  await db.user.update({ where: { id: userId }, data: { allowLocalLogin: next } });
  await logAudit({
    userId: actor.id,
    action: next ? "USER_BREAK_GLASS_GRANT" : "USER_BREAK_GLASS_REVOKE",
    module: "users",
    entityType: "User",
    entityId: userId,
    description: `${next ? "Menandai" : "Mencabut tanda"} akun darurat pada "${target.username}" — ${reason}`,
  });
  revalidatePath("/settings/users");
  revalidatePath(`/settings/users/${userId}`);
  redirect(
    `/settings/users/${userId}?ok=` +
      encodeURIComponent(next ? "Akun ditandai sebagai akun darurat." : "Tanda akun darurat dicabut.")
  );
}
