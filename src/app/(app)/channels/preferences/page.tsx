import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, CUSTOMER_CHANNELS, statusLabel } from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { setCustomerChannelAction } from "../actions";

export const metadata = { title: "Preferensi Notifikasi" };

export default async function PreferencesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.CHANNELS_VIEW);
  const sp = await searchParams;
  const canManage = user.permissions.has(PERMISSIONS.CHANNELS_MANAGE);

  const customers = await db.customer.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    take: 300,
  });
  const counts = CUSTOMER_CHANNELS.map(([v, l]) => ({
    value: v,
    label: l,
    count: customers.filter((c) => c.notifyChannel === v).length,
  }));

  return (
    <div>
      <PageHeader
        title="Preferensi Notifikasi Pelanggan"
        subtitle={`Kanal pilihan pelanggan (§9). ${counts.map((c) => `${c.label}: ${c.count}`).join(" · ")}. Pelanggan "Tidak menerima" tidak akan dikirimi pesan.`}
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="card overflow-x-auto">
        {customers.length === 0 ? (
          <EmptyState message="Belum ada pelanggan aktif." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Pelanggan</th>
                <th className="th">Telepon</th>
                <th className="th">Email</th>
                <th className="th">Preferensi</th>
                {canManage && <th className="th">Ubah</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="td whitespace-nowrap text-xs">
                    <span className="font-mono">{c.customerNumber}</span>{" "}
                    <span className="font-medium">{c.name}</span>
                  </td>
                  <td className="td whitespace-nowrap text-xs">{c.phone}</td>
                  <td className="td whitespace-nowrap text-xs">{c.email ?? "-"}</td>
                  <td className="td">
                    <Badge value={c.notifyChannel} label={statusLabel(c.notifyChannel)} />
                  </td>
                  {canManage && (
                    <td className="td">
                      <form action={setCustomerChannelAction} className="flex items-center gap-1">
                        <input type="hidden" name="customerId" value={c.id} />
                        <select name="channel" className="input px-1 py-0.5 text-xs" defaultValue={c.notifyChannel}>
                          {CUSTOMER_CHANNELS.map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </select>
                        <button type="submit" className="text-xs text-brand-600 hover:underline">Simpan</button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
