import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatDateTime } from "@/lib/constants";
import { PageHeader, Flash, BackLink, ActiveBadge } from "@/components/ui";
import {
  updateUserAction,
  toggleUserActiveAction,
  resetPasswordAction,
} from "../actions";

export const metadata = { title: "Detail User" };

export default async function UserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const actor = await requirePermission(PERMISSIONS.USERS_VIEW);
  const canEdit = actor.permissions.has(PERMISSIONS.USERS_EDIT);
  const { id } = await params;
  const sp = await searchParams;

  const [user, roles] = await Promise.all([
    db.user.findUnique({
      where: { id },
      include: { roles: true },
    }),
    db.role.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!user) notFound();

  const userRoleIds = new Set(user.roles.map((r) => r.roleId));

  return (
    <div className="max-w-2xl">
      <BackLink href="/settings/users" label="Kembali ke daftar user" />
      <PageHeader
        title={user.name}
        subtitle={`@${user.username} · dibuat ${formatDateTime(user.createdAt)}`}
        action={<ActiveBadge isActive={user.isActive} />}
      />
      <Flash ok={sp.ok} error={sp.error} />

      <form action={updateUserAction} className="card space-y-4 p-6">
        <input type="hidden" name="userId" value={user.id} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="name">Nama Lengkap</label>
            <input
              id="name"
              name="name"
              className="input"
              defaultValue={user.name}
              required
              disabled={!canEdit}
            />
          </div>
          <div>
            <label className="label">Username</label>
            <input className="input bg-slate-50" value={user.username} disabled />
          </div>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              className="input"
              defaultValue={user.email}
              required
              disabled={!canEdit}
            />
          </div>
          <div>
            <label className="label" htmlFor="phone">Telepon</label>
            <input
              id="phone"
              name="phone"
              className="input"
              defaultValue={user.phone ?? ""}
              disabled={!canEdit}
            />
          </div>
        </div>

        <div>
          <div className="label">Role</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {roles.map((r) => (
              <label
                key={r.id}
                className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  name="roleIds"
                  value={r.id}
                  defaultChecked={userRoleIds.has(r.id)}
                  className="accent-brand-600"
                  disabled={!canEdit}
                />
                {r.name}
              </label>
            ))}
          </div>
        </div>

        {canEdit && (
          <button type="submit" className="btn-primary">Simpan Perubahan</button>
        )}
      </form>

      {canEdit && (
        <>
          <div className="card mt-6 space-y-4 p-6">
            <h2 className="font-medium">Reset Password</h2>
            <form action={resetPasswordAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="userId" value={user.id} />
              <div className="min-w-56 flex-1">
                <label className="label" htmlFor="password">Password Baru</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  className="input"
                  required
                  minLength={8}
                />
              </div>
              <button type="submit" className="btn-secondary">Reset</button>
            </form>
          </div>

          <div className="card mt-6 flex items-center justify-between p-6">
            <div>
              <h2 className="font-medium">
                {user.isActive ? "Nonaktifkan User" : "Aktifkan User"}
              </h2>
              <p className="text-sm text-slate-500">
                {user.isActive
                  ? "User nonaktif tidak dapat login. Data & jejak audit tetap tersimpan."
                  : "Aktifkan kembali agar user dapat login."}
              </p>
            </div>
            <form action={toggleUserActiveAction}>
              <input type="hidden" name="userId" value={user.id} />
              <button
                type="submit"
                className={user.isActive ? "btn-danger" : "btn-primary"}
              >
                {user.isActive ? "Nonaktifkan" : "Aktifkan"}
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
