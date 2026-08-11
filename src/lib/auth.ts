import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession, destroySession, getSession } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { AUDIT_ACTIONS } from "@/lib/constants";

export async function login(
  identifier: string,
  password: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await db.user.findFirst({
    where: { OR: [{ username: identifier }, { email: identifier }] },
  });

  if (!user || !user.isActive) {
    await logAudit({
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      module: "auth",
      description: `Login gagal untuk "${identifier}" (user tidak ditemukan / nonaktif)`,
    });
    return { ok: false, error: "Username atau password salah." };
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    await logAudit({
      userId: user.id,
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      module: "auth",
      description: `Login gagal untuk "${user.username}" (password salah)`,
    });
    return { ok: false, error: "Username atau password salah." };
  }

  await createSession({
    userId: user.id,
    username: user.username,
    name: user.name,
    epoch: user.sessionEpoch,
  });
  await logAudit({
    userId: user.id,
    action: AUDIT_ACTIONS.LOGIN,
    module: "auth",
    description: `${user.name} login`,
  });
  return { ok: true };
}

export async function logout(): Promise<void> {
  const session = await getSession();
  if (session) {
    await logAudit({
      userId: session.userId,
      action: AUDIT_ACTIONS.LOGOUT,
      module: "auth",
      description: `${session.name} logout`,
    });
  }
  await destroySession();
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
