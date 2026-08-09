import { CAMPAIGN_CHANNELS, CAMPAIGN_STATUSES, statusLabel } from "@/lib/constants";
import { saveCampaignAction } from "./actions";

// Server component form dipakai untuk create & edit.
export function CampaignForm({
  campaign,
  areas,
  users,
}: {
  campaign?: {
    id: string;
    name: string;
    channel: string;
    startDate: Date | null;
    endDate: Date | null;
    budget: bigint;
    targetAudience: string | null;
    areaId: string | null;
    picId: string | null;
    targetLeads: number;
    status: string;
    notes: string | null;
  } | null;
  areas: { id: string; name: string }[];
  users: { id: string; name: string }[];
}) {
  const d = (date: Date | null | undefined) =>
    date ? date.toISOString().slice(0, 10) : "";

  return (
    <form action={saveCampaignAction} className="card space-y-4 p-6">
      {campaign && <input type="hidden" name="id" value={campaign.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="name">Nama Campaign</label>
          <input id="name" name="name" className="input" defaultValue={campaign?.name ?? ""} required />
        </div>
        <div>
          <label className="label" htmlFor="channel">Channel</label>
          <select id="channel" name="channel" className="input" defaultValue={campaign?.channel ?? ""} required>
            <option value="" disabled>— pilih —</option>
            {CAMPAIGN_CHANNELS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" className="input" defaultValue={campaign?.status ?? "DRAFT"}>
            {CAMPAIGN_STATUSES.map((s) => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="startDate">Mulai</label>
          <input id="startDate" name="startDate" type="date" className="input" defaultValue={d(campaign?.startDate)} />
        </div>
        <div>
          <label className="label" htmlFor="endDate">Selesai</label>
          <input id="endDate" name="endDate" type="date" className="input" defaultValue={d(campaign?.endDate)} />
        </div>
        <div>
          <label className="label" htmlFor="budget">Budget (Rp)</label>
          <input id="budget" name="budget" inputMode="numeric" className="input" defaultValue={campaign ? String(campaign.budget) : ""} />
        </div>
        <div>
          <label className="label" htmlFor="targetLeads">Target Lead</label>
          <input id="targetLeads" name="targetLeads" type="number" min={0} className="input" defaultValue={campaign?.targetLeads ?? 0} />
        </div>
        <div>
          <label className="label" htmlFor="areaId">Area</label>
          <select id="areaId" name="areaId" className="input" defaultValue={campaign?.areaId ?? ""}>
            <option value="">— semua area —</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="picId">PIC</label>
          <select id="picId" name="picId" className="input" defaultValue={campaign?.picId ?? ""}>
            <option value="">— pilih PIC —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="targetAudience">Target Audience</label>
          <input id="targetAudience" name="targetAudience" className="input" defaultValue={campaign?.targetAudience ?? ""} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="notes">Catatan</label>
          <textarea id="notes" name="notes" rows={2} className="input" defaultValue={campaign?.notes ?? ""} />
        </div>
      </div>
      <button type="submit" className="btn-primary">Simpan</button>
    </form>
  );
}
