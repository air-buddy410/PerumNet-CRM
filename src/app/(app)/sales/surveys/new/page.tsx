import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { PageHeader, Flash, BackLink } from "@/components/ui";
import { createSurveyAction } from "../actions";

export const metadata = { title: "Ajukan Survey" };

export default async function NewSurveyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; leadId?: string }>;
}) {
  await requirePermission(PERMISSIONS.SURVEYS_CREATE);
  const sp = await searchParams;

  const [leads, packages] = await Promise.all([
    db.lead.findMany({
      where: { status: { notIn: ["CONVERTED", "LOST", "NOT_INTERESTED"] } },
      orderBy: { createdAt: "desc" },
      include: { interestPackage: true },
    }),
    db.package.findMany({ where: { isActive: true }, orderBy: { monthlyPrice: "asc" } }),
  ]);
  const preselect = sp.leadId ? leads.find((l) => l.id === sp.leadId) : undefined;

  return (
    <div className="max-w-2xl">
      <BackLink href="/sales/surveys" label="Kembali ke daftar survey" />
      <PageHeader
        title="Ajukan Survey"
        subtitle="Survey diajukan dari lead; status lead otomatis menjadi Perlu Survey."
      />
      <Flash error={sp.error} />

      <form action={createSurveyAction} className="card space-y-4 p-6">
        <div>
          <label className="label" htmlFor="leadId">Lead</label>
          <select
            id="leadId"
            name="leadId"
            className="input"
            defaultValue={preselect?.id ?? ""}
            required
          >
            <option value="" disabled>— pilih lead —</option>
            {leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.leadNumber} — {l.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="address">Alamat Survey</label>
          <textarea
            id="address"
            name="address"
            rows={2}
            className="input"
            defaultValue={preselect?.address ?? ""}
            required
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="contactName">Nama Kontak di Lokasi</label>
            <input
              id="contactName"
              name="contactName"
              className="input"
              defaultValue={preselect?.name ?? ""}
            />
          </div>
          <div>
            <label className="label" htmlFor="contactPhone">Telepon Kontak</label>
            <input
              id="contactPhone"
              name="contactPhone"
              className="input"
              defaultValue={preselect?.phone ?? ""}
            />
          </div>
          <div>
            <label className="label" htmlFor="packageId">Paket</label>
            <select
              id="packageId"
              name="packageId"
              className="input"
              defaultValue={preselect?.interestPackageId ?? ""}
            >
              <option value="">— belum ditentukan —</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="bandwidthMbps">Kebutuhan Bandwidth (Mbps)</label>
            <input
              id="bandwidthMbps"
              name="bandwidthMbps"
              type="number"
              min={1}
              className="input"
              defaultValue={preselect?.estBandwidthMbps ?? ""}
            />
          </div>
        </div>
        <button type="submit" className="btn-primary">Ajukan Survey</button>
      </form>
    </div>
  );
}
