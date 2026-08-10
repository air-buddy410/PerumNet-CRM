import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { PageHeader, Flash, BackLink } from "@/components/ui";
import { createManualJournalAction } from "../../actions";

export const metadata = { title: "Jurnal Manual" };

export default async function NewJournalPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePermission(PERMISSIONS.GL_POST);
  const sp = await searchParams;
  const accounts = await db.account.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
  });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-3xl">
      <BackLink href="/finance/gl/journal" label="Kembali ke jurnal umum" />
      <PageHeader
        title="Jurnal Manual"
        subtitle="Total debit wajib sama dengan total kredit. Tiap baris tepat satu sisi."
      />
      <Flash error={sp.error} />

      <form action={createManualJournalAction} className="card space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="entryDate">Tanggal</label>
            <input id="entryDate" name="entryDate" type="date" className="input" required defaultValue={today} />
          </div>
          <div>
            <label className="label" htmlFor="memo">Memo</label>
            <input id="memo" name="memo" className="input" placeholder="mis. saldo awal, penyesuaian" />
          </div>
        </div>

        <div>
          <p className="label">Baris Jurnal (isi akun untuk baris yang dipakai)</p>
          <div className="space-y-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="grid grid-cols-[1fr_8rem_8rem_1fr] gap-2">
                <select name={`line${i}_accountId`} className="input" defaultValue="">
                  <option value="">— akun —</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} {a.name}</option>
                  ))}
                </select>
                <input name={`line${i}_debit`} inputMode="numeric" className="input" placeholder="Debit" />
                <input name={`line${i}_credit`} inputMode="numeric" className="input" placeholder="Kredit" />
                <input name={`line${i}_description`} className="input" placeholder="Keterangan" />
              </div>
            ))}
          </div>
        </div>
        <button type="submit" className="btn-primary">Posting Jurnal</button>
      </form>
    </div>
  );
}
