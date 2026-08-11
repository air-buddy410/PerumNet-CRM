import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, CHANGE_TYPES, statusLabel } from "@/lib/constants";
import { PageHeader, Flash, BackLink } from "@/components/ui";
import { createChangeAction } from "../actions";

export const metadata = { title: "Change Request Baru" };

export default async function NewChangePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.CHANGES_CREATE);
  const sp = await searchParams;
  const users = await db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });

  return (
    <div className="max-w-2xl">
      <BackLink href="/noc/changes" label="Kembali ke daftar change" />
      <PageHeader
        title="Change Request Baru"
        subtitle="Rencana rollback wajib untuk perubahan non-standar. Persetujuan mengikuti jenis perubahan."
      />
      <Flash error={sp.error} />

      <form action={createChangeAction} className="card space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="title">Judul</label>
            <input id="title" name="title" className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="changeType">Jenis</label>
            <select id="changeType" name="changeType" className="input" required defaultValue="">
              <option value="" disabled>— pilih —</option>
              {CHANGE_TYPES.map((t) => (
                <option key={t} value={t}>{statusLabel(t)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="picId">PIC</label>
            <select id="picId" name="picId" className="input" defaultValue={user.id}>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="reason">Tujuan & Alasan (wajib)</label>
            <textarea id="reason" name="reason" rows={2} className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="impactedDevices">Perangkat Terdampak</label>
            <input id="impactedDevices" name="impactedDevices" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="impactedServices">Layanan Terdampak</label>
            <input id="impactedServices" name="impactedServices" className="input" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="risk">Risiko (wajib)</label>
            <textarea id="risk" name="risk" rows={2} className="input" required />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="implementationPlan">Implementation Plan (wajib)</label>
            <textarea id="implementationPlan" name="implementationPlan" rows={3} className="input" required />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="testPlan">Test Plan</label>
            <textarea id="testPlan" name="testPlan" rows={2} className="input" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="rollbackPlan">Rollback Plan (wajib kecuali Standard)</label>
            <textarea id="rollbackPlan" name="rollbackPlan" rows={3} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="windowStart">Maintenance Window Mulai</label>
            <input id="windowStart" name="windowStart" type="datetime-local" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="windowEnd">Maintenance Window Selesai</label>
            <input id="windowEnd" name="windowEnd" type="datetime-local" className="input" />
          </div>
        </div>
        <button type="submit" className="btn-primary">Buat Draft</button>
      </form>
    </div>
  );
}
