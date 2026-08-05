import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { PageHeader, Flash, BackLink } from "@/components/ui";
import { createUserAction } from "../actions";

export const metadata = { title: "Tambah User" };

export default async function NewUserPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePermission(PERMISSIONS.USERS_CREATE);
  const sp = await searchParams;
  const roles = await db.role.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="max-w-2xl">
      <BackLink href="/settings/users" label="Kembali ke daftar user" />
      <PageHeader title="Tambah User" />
      <Flash error={sp.error} />

      <form action={createUserAction} className="card space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="name">Nama Lengkap</label>
            <input id="name" name="name" className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="username">Username</label>
            <input id="username" name="username" className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="phone">Telepon</label>
            <input id="phone" name="phone" className="input" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="password">Password Awal</label>
            <input
              id="password"
              name="password"
              type="password"
              className="input"
              required
              minLength={8}
            />
            <p className="mt-1 text-xs text-slate-500">
              User akan diminta mengganti password saat pertama kali login.
            </p>
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
                <input type="checkbox" name="roleIds" value={r.id} className="accent-brand-600" />
                {r.name}
              </label>
            ))}
          </div>
        </div>

        <button type="submit" className="btn-primary">Simpan</button>
      </form>
    </div>
  );
}
