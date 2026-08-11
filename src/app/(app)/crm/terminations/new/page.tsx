import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, TERMINATION_REASONS } from "@/lib/constants";
import { PageHeader, Flash, BackLink, EmptyState } from "@/components/ui";
import { createTerminationAction } from "../actions";

export const metadata = { title: "Ajukan Terminasi" };

export default async function NewTerminationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; subscriptionId?: string }>;
}) {
  await requirePermission(PERMISSIONS.TERMINATION_CREATE);
  const sp = await searchParams;

  // Langganan yang sedang punya terminasi berjalan sengaja tidak ditawarkan —
  // aturannya tetap ditegakkan di service layer, ini hanya supaya petugas
  // tidak memilih sesuatu yang pasti ditolak.
  const busy = await db.customerTermination.findMany({
    where: { status: { in: ["DRAFT", "SUBMITTED", "APPROVED"] } },
    select: { subscriptionId: true },
  });
  const subscriptions = await db.subscription.findMany({
    where: {
      status: { not: "TERMINATED" },
      id: { notIn: busy.map((b) => b.subscriptionId) },
    },
    include: { customer: { select: { name: true } } },
    orderBy: { serviceNumber: "asc" },
    take: 500,
  });
  const warehouses = await db.warehouse.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-2xl">
      <BackLink href="/crm/terminations" label="Kembali ke daftar terminasi" />
      <PageHeader
        title="Ajukan Terminasi"
        subtitle="Snapshot pelanggan, layanan, jaringan, perangkat, dan tunggakan direkam saat pengajuan."
      />
      <Flash error={sp.error} />

      {subscriptions.length === 0 ? (
        <EmptyState message="Tidak ada langganan yang bisa diterminasi." />
      ) : (
        <form action={createTerminationAction} className="card space-y-4 p-6">
          <div>
            <label className="label" htmlFor="subscriptionId">Langganan</label>
            <select
              id="subscriptionId"
              name="subscriptionId"
              className="input"
              defaultValue={sp.subscriptionId ?? ""}
              required
            >
              <option value="">— pilih langganan —</option>
              {subscriptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.serviceNumber} — {s.customer.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="reasonCategory">Kategori alasan</label>
            <select id="reasonCategory" name="reasonCategory" className="input" defaultValue="CUSTOMER_REQUEST">
              {TERMINATION_REASONS.map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="reason">Alasan terminasi</label>
            <textarea id="reason" name="reason" rows={3} className="input" required />
          </div>

          <div>
            <label className="label" htmlFor="effectiveDate">Tanggal berlaku</label>
            <input
              id="effectiveDate"
              name="effectiveDate"
              type="date"
              className="input"
              defaultValue={today}
              required
            />
            <p className="mt-1 text-xs text-slate-500">
              Pelanggan tetap dilayani sampai tanggal ini, meskipun terminasinya sudah disetujui.
            </p>
          </div>

          <div>
            <label className="label" htmlFor="warehouseToId">Gudang penerima perangkat</label>
            <select id="warehouseToId" name="warehouseToId" className="input" required>
              <option value="">— pilih gudang —</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          <button type="submit" className="btn-primary w-full justify-center">
            Buat Draft Terminasi
          </button>
        </form>
      )}
    </div>
  );
}
