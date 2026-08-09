import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { PageHeader, Flash, BackLink } from "@/components/ui";
import { createProjectAction } from "../actions";

export const metadata = { title: "Proyek Baru" };

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePermission(PERMISSIONS.PROJECTS_MANAGE);
  const sp = await searchParams;

  const [customers, areas, users] = await Promise.all([
    db.customer.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } }),
    db.area.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="max-w-2xl">
      <BackLink href="/projects" label="Kembali ke daftar proyek" />
      <PageHeader title="Proyek Baru" />
      <Flash error={sp.error} />

      <form action={createProjectAction} className="card space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="name">Nama Proyek</label>
            <input id="name" name="name" className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="managerId">Project Manager</label>
            <select id="managerId" name="managerId" className="input" required defaultValue="">
              <option value="" disabled>— pilih —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="budget">Budget (Rp)</label>
            <input id="budget" name="budget" inputMode="numeric" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="customerId">Customer</label>
            <select id="customerId" name="customerId" className="input" defaultValue="">
              <option value="">— internal / tanpa customer —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.customerNumber} — {c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="areaId">Area / Lokasi</label>
            <select id="areaId" name="areaId" className="input" defaultValue="">
              <option value="">— tidak ditentukan —</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="startDate">Mulai</label>
            <input id="startDate" name="startDate" type="date" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="endDate">Target Selesai</label>
            <input id="endDate" name="endDate" type="date" className="input" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="notes">Catatan</label>
            <textarea id="notes" name="notes" rows={2} className="input" />
          </div>
        </div>
        <button type="submit" className="btn-primary">Buat Proyek</button>
      </form>
    </div>
  );
}
