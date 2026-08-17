"use client";

import { Power } from "lucide-react";
import { useActionState } from "react";
import { mintaRebootOnuAction } from "@/app/(app)/crm/customers/actions";

type Hasil = Awaited<ReturnType<typeof mintaRebootOnuAction>>;

function mintaReboot(_previous: Hasil | null, formData: FormData) {
  return mintaRebootOnuAction(formData);
}

/**
 * Tombol reboot ONU — meniru ALUS, tetapi ANTRE bukan eksekusi.
 *
 * Sengaja TIDAK merah dan TIDAK berlabel "Reboot sekarang": ia tidak
 * menyentuh perangkat. Yang jujur adalah "Antre reboot", dan pesan hasilnya
 * menegaskan bahwa eksekusinya menunggu cutover.
 */
export function CustomerOnuReboot({
  subscriptionId,
  hasPosition,
}: {
  subscriptionId: string;
  hasPosition: boolean;
}) {
  const [state, formAction, pending] = useActionState(mintaReboot, null);

  if (!hasPosition) return null;

  return (
    <div className="customer-onu-reboot">
      <form action={formAction} aria-busy={pending}>
        <input type="hidden" name="subscriptionId" value={subscriptionId} />
        <button type="submit" className="btn-secondary" disabled={pending || state?.ok}>
          <Power aria-hidden="true" />
          {pending ? "Mengantre…" : state?.ok ? "Sudah diantrekan" : "Antre reboot ONU"}
        </button>
      </form>
      {state?.ok && (
        <p className="customer-onu-reboot-note" role="status">{state.pesan}</p>
      )}
      {state && !state.ok && (
        <p className="customer-onu-reboot-error" role="alert">{state.error}</p>
      )}
      <p className="customer-onu-reboot-hint">
        Reboot belum aktif selama mode baca-saja. Tombol ini mencatat permintaan; eksekusi ke perangkat menyusul saat cutover.
      </p>
    </div>
  );
}
