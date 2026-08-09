import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, ACCESS_TYPES } from "@/lib/constants";
import { PageHeader, Flash, BackLink } from "@/components/ui";
import { createAccessRequestAction } from "../actions";

export const metadata = { title: "Permintaan Akses Baru" };

export default async function NewAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.ACCESS_REQUEST);
  const sp = await searchParams;
  const users = await db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });

  return (
    <div className="max-w-2xl">
      <BackLink href="/it/access" label="Kembali ke access management" />
      <PageHeader
        title="Permintaan Akses Baru"
        subtitle="Akses production wajib approval (rule 28); akses sementara wajib expiry (rule 29). Jangan tulis password/secret (rule 31)."
      />
      <Flash error={sp.error} />

      <form action={createAccessRequestAction} className="card space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="targetUserId">User Penerima</label>
            <select id="targetUserId" name="targetUserId" className="input" defaultValue={user.id} required>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="accessType">Jenis Akses</label>
            <select id="accessType" name="accessType" className="input" required defaultValue="">
              <option value="" disabled>— pilih —</option>
              {ACCESS_TYPES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="systemName">Sistem</label>
            <input id="systemName" name="systemName" className="input" required placeholder="mis. DB billing, repo perumnet-crm" />
          </div>
          <div>
            <label className="label" htmlFor="roleRequested">Role / Level Akses</label>
            <input id="roleRequested" name="roleRequested" className="input" required placeholder="mis. read-only, admin" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="reason">Alasan (wajib)</label>
          <textarea id="reason" name="reason" rows={3} className="input" required />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isProduction" className="h-4 w-4" />
            Akses production
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isTemporary" className="h-4 w-4" />
            Sementara
          </label>
          <div>
            <label className="label" htmlFor="expiryDate">Expiry Date</label>
            <input id="expiryDate" name="expiryDate" type="datetime-local" className="input" />
          </div>
        </div>
        <button type="submit" className="btn-primary">Buat Permintaan</button>
      </form>
    </div>
  );
}
