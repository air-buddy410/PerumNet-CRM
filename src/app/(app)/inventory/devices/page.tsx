import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, DEVICE_STATUSES, statusLabel } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";

export const metadata = { title: "Perangkat" };

export default async function DevicesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; status?: string; q?: string }>;
}) {
  await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  const sp = await searchParams;

  const devices = await db.serializedDevice.findMany({
    where: {
      ...(sp.status ? { status: sp.status } : {}),
      ...(sp.q
        ? {
            OR: [
              { serialNumber: { contains: sp.q } },
              { macAddress: { contains: sp.q } },
            ],
          }
        : {}),
    },
    include: { item: true, warehouse: true, custodian: true, customer: true, subscription: true },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <PageHeader
        title="Perangkat Serialized"
        subtitle="Setiap perangkat memiliki tepat satu lokasi & satu penanggung jawab aktif (PRD §53)."
      />
      <Flash ok={sp.ok} error={sp.error} />

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-64">
          <label className="label" htmlFor="q">Cari SN / MAC</label>
          <input id="q" name="q" className="input" defaultValue={sp.q ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" className="input w-52" defaultValue={sp.status ?? ""}>
            <option value="">Semua status</option>
            {DEVICE_STATUSES.map((s) => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        {devices.length === 0 ? (
          <EmptyState message="Tidak ada perangkat yang cocok." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Serial Number</th>
                <th className="th">Item</th>
                <th className="th">Lokasi / Penanggung Jawab</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {devices.map((d) => {
                const location =
                  d.warehouse?.name ??
                  (d.custodian ? `Teknisi: ${d.custodian.name}` : null) ??
                  (d.customer
                    ? `Pelanggan: ${d.customer.name}${d.subscription ? ` (${d.subscription.serviceNumber})` : ""}`
                    : "—");
                return (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="td font-mono text-xs">
                      <Link href={`/inventory/devices/${d.id}`} className="font-semibold text-brand-600 hover:underline">
                        {d.serialNumber}
                      </Link>
                    </td>
                    <td className="td">{d.item.name}</td>
                    <td className="td text-xs">{location}</td>
                    <td className="td">
                      <Badge value={d.status} label={statusLabel(d.status)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
