import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { PageHeader, Flash, BackLink } from "@/components/ui";
import { createQuotationAction } from "../actions";
import { QuotationFields } from "../quotation-fields";

export const metadata = { title: "Quotation Baru" };

export default async function NewQuotationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; leadId?: string }>;
}) {
  await requirePermission(PERMISSIONS.QUOTATIONS_CREATE);
  const sp = await searchParams;

  const [leads, packages] = await Promise.all([
    db.lead.findMany({
      where: {
        status: { notIn: ["CONVERTED", "LOST", "NOT_INTERESTED"] },
        salesOwnerId: { not: null },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.package.findMany({ where: { isActive: true }, orderBy: { monthlyPrice: "asc" } }),
  ]);

  return (
    <div className="max-w-2xl">
      <BackLink href="/sales/quotations" label="Kembali ke daftar quotation" />
      <PageHeader
        title="Quotation Baru"
        subtitle="Hanya lead ber-owner yang bisa dibuatkan quotation. Quotation baru berstatus Draft."
      />
      <Flash error={sp.error} />

      <form action={createQuotationAction} className="card space-y-4 p-6">
        <div>
          <label className="label" htmlFor="leadId">Lead</label>
          <select id="leadId" name="leadId" className="input" defaultValue={sp.leadId ?? ""} required>
            <option value="" disabled>— pilih lead —</option>
            {leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.leadNumber} — {l.name}
              </option>
            ))}
          </select>
        </div>
        <QuotationFields packages={packages} />
        <button type="submit" className="btn-primary">Simpan Draft</button>
      </form>
    </div>
  );
}
