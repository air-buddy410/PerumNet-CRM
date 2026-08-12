import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, formatDateTime, USER_LEVEL_LABELS } from "@/lib/constants";
import { PageHeader, Flash, BackLink, ActiveBadge } from "@/components/ui";
import {
  updateUserAction,
  toggleUserActiveAction,
  resetPasswordAction,
  freezeUserAction,
  unfreezeUserAction,
  toggleBreakGlassAction,
} from "../actions";
import { archiveDueAt, FREEZE_GRACE_MONTHS } from "@/lib/employment";

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

  const [user, roles, divisions] = await Promise.all([
    db.user.findUnique({
      where: { id },
      include: { roles: true },
    }),
    db.role.findMany({ orderBy: { name: "asc" } }),
    db.division.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
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
          <div>
            <label className="label" htmlFor="level">Level Organisasi</label>
            <select
              id="level"
              name="level"
              className="input"
              defaultValue={user.level}
              disabled={!canEdit}
            >
              {Object.entries(USER_LEVEL_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="divisionId">Divisi</label>
            <select
              id="divisionId"
              name="divisionId"
              className="input"
              defaultValue={user.divisionId ?? ""}
              disabled={!canEdit}
            >
              <option value="">— Tanpa divisi (khusus Owner) —</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
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

          <div className="card mt-6 space-y-3 p-6">
            <div>
              <h2 className="font-medium">
                {user.frozenAt ? "Cairkan Akun" : "Bekukan Akun"}
              </h2>
              <p className="text-sm text-slate-500">
                {user.frozenAt ? (
                  <>
                    Beku sejak {formatDateTime(user.frozenAt)}
                    {user.freezeReason ? ` — ${user.freezeReason}` : ""}. Akan
                    diarsipkan otomatis {archiveDueAt(user.frozenAt).toLocaleDateString("id-ID")}{" "}
                    bila tidak dicairkan.
                  </>
                ) : (
                  <>
                    Akun beku tidak bisa login dan sesinya yang sedang berjalan
                    ikut tertutup, tetapi seluruh datanya tetap utuh. Setelah{" "}
                    {FREEZE_GRACE_MONTHS} bulan beku, akun diarsipkan otomatis —
                    dan arsip pun masih bisa dipulihkan.
                  </>
                )}
              </p>
            </div>
            <form
              action={user.frozenAt ? unfreezeUserAction : freezeUserAction}
              className="flex flex-wrap items-end gap-3"
            >
              <input type="hidden" name="userId" value={user.id} />
              <div className="min-w-56 flex-1">
                <label className="label" htmlFor="freezeReason">Alasan</label>
                <input
                  id="freezeReason"
                  name="reason"
                  className="input"
                  required
                  minLength={3}
                  placeholder={user.frozenAt ? "mis. kontrak diperpanjang" : "mis. kontrak berakhir"}
                />
              </div>
              <button type="submit" className={user.frozenAt ? "btn-primary" : "btn-secondary"}>
                {user.frozenAt ? "Cairkan" : "Bekukan"}
              </button>
            </form>
          </div>

          {/* Fase 45 — akun darurat. Sengaja diberi izin paling tinggi
              (users.create), karena menandainya berarti memberi jalan pintas
              permanen ke sistem meski identitas terpusat aktif. */}
          {actor.permissions.has(PERMISSIONS.USERS_CREATE) && (
            <div className="card mt-6 space-y-3 border-amber-200 p-6">
              <div>
                <h2 className="font-medium">
                  Akun Darurat {user.allowLocalLogin && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-900">AKTIF</span>}
                </h2>
                <p className="text-sm text-slate-500">
                  {user.allowLocalLogin ? (
                    <>
                      Akun ini <strong>tetap bisa masuk memakai password lokal</strong> walaupun
                      identitas terpusat aktif, dan setiap pemakaiannya dicatat serta diberitakan
                      ke pemegang akses audit log.
                    </>
                  ) : (
                    <>
                      Tandai bila akun ini harus tetap bisa masuk saat penyedia identitas mati.
                      Tanpa satu pun akun bertanda ini, Authentik yang tumbang mengunci semua
                      orang dari CRM — termasuk dari memperbaiki Authentik-nya.
                    </>
                  )}
                </p>
              </div>
              <form action={toggleBreakGlassAction} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="userId" value={user.id} />
                <div className="min-w-56 flex-1">
                  <label className="label" htmlFor="bgReason">Alasan</label>
                  <input
                    id="bgReason"
                    name="reason"
                    className="input"
                    required
                    minLength={3}
                    placeholder={user.allowLocalLogin ? "mis. sudah tidak diperlukan" : "mis. akun pemulihan IT"}
                  />
                </div>
                <button type="submit" className="btn-secondary">
                  {user.allowLocalLogin ? "Cabut tanda" : "Tandai darurat"}
                </button>
              </form>
            </div>
          )}

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
