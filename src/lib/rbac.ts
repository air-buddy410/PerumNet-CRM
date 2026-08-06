import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import type { PermissionCode } from "@/lib/constants";

export interface CurrentUser {
  id: string;
  username: string;
  email: string;
  name: string;
  level: string; // STAFF | SUPERVISOR | OWNER
  divisionId: string | null;
  divisionName: string | null;
  mustChangePassword: boolean;
  roles: { id: string; code: string; name: string }[];
  permissions: Set<string>;
}

// Di-cache per request agar pemeriksaan permission berkali-kali tidak
// memukul database berulang.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;

  const user = await db.user.findUnique({
    where: { id: session.userId },
    include: {
      division: true,
      roles: {
        include: {
          role: {
            include: { permissions: { include: { permission: true } } },
          },
        },
      },
    },
  });
  if (!user || !user.isActive) return null;

  const permissions = new Set<string>();
  for (const ur of user.roles) {
    for (const rp of ur.role.permissions) permissions.add(rp.permission.code);
  }

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    name: user.name,
    level: user.level,
    divisionId: user.divisionId,
    divisionName: user.division?.name ?? null,
    mustChangePassword: user.mustChangePassword,
    roles: user.roles.map((ur) => ({
      id: ur.role.id,
      code: ur.role.code,
      name: ur.role.name,
    })),
    permissions,
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export function hasPermission(user: CurrentUser, code: PermissionCode): boolean {
  return user.permissions.has(code);
}

// Guard untuk halaman & server action. Melempar redirect bila belum login,
// dan error bila tidak berhak — mutasi selalu dicek di server, bukan di UI.
export async function requirePermission(code: PermissionCode): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.permissions.has(code)) {
    throw new Error(`Akses ditolak: memerlukan permission "${code}"`);
  }
  return user;
}
