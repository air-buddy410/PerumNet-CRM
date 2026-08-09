import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, IT_TICKET_TYPES, IT_TICKET_PRIORITIES, statusLabel } from "@/lib/constants";
import { PageHeader, Flash, BackLink } from "@/components/ui";
import { createTicketAction } from "../actions";

export const metadata = { title: "Tiket IT Baru" };

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePermission(PERMISSIONS.IT_TICKETS_CREATE);
  const sp = await searchParams;

  return (
    <div className="max-w-2xl">
      <BackLink href="/it/tickets" label="Kembali ke daftar tiket" />
      <PageHeader
        title="Tiket IT Baru"
        subtitle="Laporkan kendala perangkat kerja, akun, aplikasi, atau permintaan IT lainnya (PRD §39)."
      />
      <Flash error={sp.error} />

      <form action={createTicketAction} className="card space-y-4 p-6">
        <div>
          <label className="label" htmlFor="title">Judul</label>
          <input id="title" name="title" className="input" required />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="type">Jenis</label>
            <select id="type" name="type" className="input" required defaultValue="">
              <option value="" disabled>— pilih —</option>
              {IT_TICKET_TYPES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="priority">Prioritas</label>
            <select id="priority" name="priority" className="input" defaultValue="MEDIUM">
              {IT_TICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>{statusLabel(p)}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="description">Deskripsi</label>
          <textarea id="description" name="description" rows={4} className="input" required placeholder="Jelaskan kendala/permintaan secara detail. Jangan tulis password/secret di sini (rule 31)." />
        </div>
        <button type="submit" className="btn-primary">Buat Tiket</button>
      </form>
    </div>
  );
}
