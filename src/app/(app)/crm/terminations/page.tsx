import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  TERMINATION_STATUSES,
  statusLabel,
  formatDateTime,
} from "@/lib/constants";
import { PageHeader, Badge, EmptyState, Flash } from "@/components/ui";

export const metadata = { title: "Terminasi Pelanggan" };

export default async function TerminationsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; status?: string; q?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.TERMINATION_VIEW);
  const sp = await searchParams;

  const terminations = await db.customerTermination.findMany({
    where: {
      ...(sp.status ? { status: sp.status } : {}),
      ...(sp.q
        ? {
            OR: [
              { terminationNumber: { contains: sp.q } },
              { customer: { name: { contains: sp.q } } },
              { subscription: { serviceNumber: { contains: sp.q } } },
            ],
          }
        : {}),
    },
    include: {
      customer: { select: { name: true } },
      subscription: { select: { serviceNumber: true } },
      recovery: { select: { id: true, recoveryNumber: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const canCreate = user.permissions.has(PERMISSIONS.TERMINATION_CREATE);

  return (
    <div>
      <PageHeader
        title="Terminasi Pelanggan"
        subtitle="Persetujuan terminasi otomatis menerbitkan surat penarikan perangkat — keduanya dibuat dalam satu transaksi."
        action={
          canCreate ? (
            <div className="flex items-center gap-2">
              <a href="/api/export/terminations" className="btn-secondary">Export CSV</a>
              <Link href="/crm/terminations/new" className="btn-primary">
                Ajukan Terminasi
              </Link>
            </div>
          ) : (
            <a href="/api/export/terminations" className="btn-secondary">Export CSV</a>
          )
        }
      />
      <Flash ok={sp.ok} error={sp.error} />

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-64">
          <label className="label" htmlFor="q">Cari nomor / pelanggan</label>
          <input id="q" name="q" className="input" defaultValue={sp.q ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" className="input w-52" defaultValue={sp.status ?? ""}>
            <option value="">Semua status</option>
            {TERMINATION_STATUSES.map((s) => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        {terminations.length === 0 ? (
          <EmptyState message="Belum ada pengajuan terminasi." />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Nomor</th>
                <th className="th">Pelanggan</th>
                <th className="th">Layanan</th>
                <th className="th">Berlaku</th>
                <th className="th">Penarikan</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {terminations.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="td">
                    <Link
                      href={`/crm/terminations/${t.id}`}
                      className="font-semibold text-brand-600 hover:underline"
                    >
                      {t.terminationNumber}
                    </Link>
                  </td>
                  <td className="td">{t.customer.name}</td>
                  <td className="td font-mono text-xs">{t.subscription.serviceNumber}</td>
                  <td className="td text-xs">{formatDateTime(t.effectiveDate)}</td>
                  <td className="td text-xs">
                    {t.recovery ? (
                      <Link
                        href={`/inventory/device-recoveries/${t.recovery.id}`}
                        className="text-brand-600 hover:underline"
                      >
                        {t.recovery.recoveryNumber}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="td">
                    <Badge value={t.status} label={statusLabel(t.status)} />
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
