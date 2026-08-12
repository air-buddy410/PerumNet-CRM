"use client";

type FormAction = (formData: FormData) => Promise<void>;

type PendingRecoveryItem = {
  id: string;
  snapshotSerial: string;
  snapshotMac: string | null;
};

export function RecoveryPickupForm({
  action,
  recoveryId,
  items,
  origin,
}: {
  action: FormAction;
  recoveryId: string;
  items: PendingRecoveryItem[];
  origin?: "portal" | "backoffice";
}) {
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="recoveryId" value={recoveryId} />
      {origin && <input type="hidden" name="origin" value={origin} />}
      {items.map((item) => (
        <fieldset key={item.id} className="rounded-lg border border-slate-200 p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="pick" value={item.id} className="rounded" />
            <span className="font-mono text-xs">{item.snapshotSerial}</span>
          </label>
          <input name={`serial_${item.id}`} className="input mt-2 text-xs" defaultValue={item.snapshotSerial} placeholder="Serial yang ditemukan" />
          <input name={`mac_${item.id}`} className="input mt-2 text-xs" defaultValue={item.snapshotMac ?? ""} placeholder="MAC (opsional)" />
          <input name={`note_${item.id}`} className="input mt-2 text-xs" placeholder="Catatan bila serial/MAC berbeda" />
        </fieldset>
      ))}
      <button type="submit" className="btn-primary w-full justify-center">Simpan penarikan</button>
    </form>
  );
}
