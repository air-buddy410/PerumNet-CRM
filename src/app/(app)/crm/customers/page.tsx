import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, statusLabel } from "@/lib/constants";
import { PageHeader, Badge, EmptyState, Flash } from "@/components/ui";

export const metadata = { title: "Customers" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; q?: string }>;
}) {
  await requirePermission(PERMISSIONS.CUSTOMERS_VIEW);
  const sp = await searchParams;

  const customers = await db.customer.findMany({
    where: sp.q
      ? {
          OR: [
            { name: { contains: sp.q } },
            { customerNumber: { contains: sp.q } },
            { phone: { contains: sp.q } },
          ],
        }
      : undefined,
    include: {
      area: true,
      salesOwner: true,
      _count: { select: { subscriptions: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Pelanggan berasal dari konversi lead (dengan quotation Accepted) — traceability Lead → Customer terjaga."
      />
      <Flash ok={sp.ok} error={sp.error} />

      <form method="GET" className="mb-4 flex items-end gap-3">
        <div className="w-72">
          <label className="label" htmlFor="q">Cari</label>
          <input
            id="q"
            name="q"
            className="input"
            placeholder="Nama / nomor / telepon"
            defaultValue={sp.q ?? ""}
          />
        </div>
        <button type="submit" className="btn-secondary">Cari</button>
      </form>

      <div className="card overflow-x-auto">
        {customers.length === 0 ? (
          <EmptyState message="Belum ada customer. Konversi lead dengan quotation Accepted untuk membuat customer." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Nomor</th>
                <th className="th">Nama</th>
                <th className="th">Jenis</th>
                <th className="th">Telepon</th>
                <th className="th">Area</th>
                <th className="th">Sales Owner</th>
                <th className="th">Subscription</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="td">
                    <Link
                      href={`/crm/customers/${c.id}`}
                      className="font-medium text-brand-600 hover:underline"
                    >
                      {c.customerNumber}
                    </Link>
                  </td>
                  <td className="td">
                    <div className="font-medium">{c.name}</div>
                    {c.company && <div className="text-xs text-slate-500">{c.company}</div>}
                  </td>
                  <td className="td text-xs">{statusLabel(c.customerType)}</td>
                  <td className="td whitespace-nowrap">{c.phone}</td>
                  <td className="td text-xs">{c.area?.name ?? "-"}</td>
                  <td className="td text-xs">{c.salesOwner?.name ?? "-"}</td>
                  <td className="td">{c._count.subscriptions}</td>
                  <td className="td">
                    <Badge value={c.status} label={statusLabel(c.status)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
