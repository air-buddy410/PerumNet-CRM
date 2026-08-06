import { requireUser } from "@/lib/rbac";
import { USER_LEVEL_LABELS } from "@/lib/constants";
import { PageHeader, Flash } from "@/components/ui";
import { changePasswordAction } from "./actions";

export const metadata = { title: "Profil" };

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  return (
    <div className="max-w-xl">
      <PageHeader title="Profil Saya" />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="card mb-6 p-6">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Nama</dt>
            <dd className="mt-0.5 text-sm">{user.name}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Username</dt>
            <dd className="mt-0.5 text-sm">@{user.username}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Email</dt>
            <dd className="mt-0.5 text-sm">{user.email}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Role</dt>
            <dd className="mt-0.5 text-sm">
              {user.roles.map((r) => r.name).join(", ") || "-"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Divisi</dt>
            <dd className="mt-0.5 text-sm">{user.divisionName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Level</dt>
            <dd className="mt-0.5 text-sm">{USER_LEVEL_LABELS[user.level] ?? user.level}</dd>
          </div>
        </dl>
      </div>

      <div className="card p-6">
        <h2 className="mb-4 font-medium">Ganti Password</h2>
        <form action={changePasswordAction} className="space-y-4">
          <div>
            <label className="label" htmlFor="currentPassword">Password Saat Ini</label>
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              className="input"
              autoComplete="current-password"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="newPassword">Password Baru</label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              className="input"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </div>
          <div>
            <label className="label" htmlFor="confirmPassword">Konfirmasi Password Baru</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              className="input"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </div>
          <button type="submit" className="btn-primary">Simpan Password</button>
        </form>
      </div>
    </div>
  );
}
