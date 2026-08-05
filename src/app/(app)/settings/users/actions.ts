"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { hashPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS, AUDIT_ACTIONS } from "@/lib/constants";

const createSchema = z.object({
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
  });
  if (!parsed.success) {
    redirect(
      "/settings/users/new?error=" +
        encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")
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

const updateSchema = z.object({
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
  });
  if (!parsed.success) {
    redirect(
      "/settings/users?error=" +
        encodeURIComponent(parsed.error.issues[0]?.message ?? "Input tidak valid")
    );
  }
  const { userId, ...data } = parsed.data;
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
    db.user.update({ where: { id: userId }, data }),
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

  await db.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
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
