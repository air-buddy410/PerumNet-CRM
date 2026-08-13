import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  INTEGRATION_CATEGORIES,
  INTEGRATION_PROVIDERS,
  INTEGRATION_AUTH_TYPES,
  formatDateTime,
} from "@/lib/constants";
import { PageHeader, Flash, Badge, EmptyState } from "@/components/ui";
import { parseTableQuery, SortableTableHeader, TableControls, type TableSearchParams } from "@/components/table-controls";
import { saveIntegrationAction } from "./actions";

export const metadata = { title: "Integrasi" };

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<TableSearchParams>;
}) {
  await requirePermission(PERMISSIONS.INTEGRATIONS_MANAGE);
  const sp = await searchParams;
  const tableOptions = [
    { value: "category", label: "Kategori" },
    { value: "code", label: "Kode" },
    { value: "name", label: "Nama" },
  ] as const;
  const table = parseTableQuery(sp, {
    defaultSort: "category",
    defaultDirection: "asc",
    sortOptions: tableOptions,
  });
  const orderBy: Prisma.IntegrationOrderByWithRelationInput[] = [
    { [table.sort]: table.direction },
    { id: "asc" },
  ];

  const [integrations, totalCount, editRow] = await Promise.all([
    db.integration.findMany({
      include: { _count: { select: { events: true } } },
      orderBy,
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.integration.count(),
    table.query.edit ? db.integration.findUnique({ where: { id: table.query.edit } }) : Promise.resolve(null),
  ]);
  const catLabel = (c: string) => INTEGRATION_CATEGORIES.find(([v]) => v === c)?.[1] ?? c;
  const provLabel = (p: string) => INTEGRATION_PROVIDERS.find(([v]) => v === p)?.[1] ?? p;

  return (
    <div>
      <PageHeader
        title="Integrasi Eksternal"
        subtitle="Kelola konektor monitoring, billing, WhatsApp, dan layanan lain. Secret tetap dikelola melalui environment, bukan di halaman ini."
      />
      <Flash ok={table.query.ok} error={table.query.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="card overflow-x-auto">
          {integrations.length === 0 ? (
            <EmptyState message="Belum ada integrasi terdaftar." />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th"><SortableTableHeader basePath="/settings/integrations" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="code" label="Kode" /></th>
                  <th className="th"><SortableTableHeader basePath="/settings/integrations" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="name" label="Nama" /></th>
                  <th className="th"><SortableTableHeader basePath="/settings/integrations" query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="category" label="Kategori" /></th>
                  <th className="th">Provider</th>
                  <th className="th">Event</th>
                  <th className="th">Event Terakhir</th>
                  <th className="th">Status</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {integrations.map((i) => (
                  <tr key={i.id} className="hover:bg-slate-50">
                    <td className="td font-mono text-xs">
                      <Link href={`/settings/integrations/${i.id}`} className="text-brand-600 hover:underline">
                        {i.code}
                      </Link>
                    </td>
                    <td className="td font-medium">{i.name}</td>
                    <td className="td text-xs">{catLabel(i.category)}</td>
                    <td className="td text-xs">{provLabel(i.provider)}</td>
                    <td className="td">{i._count.events}</td>
                    <td className="td text-xs">{i.lastEventAt ? formatDateTime(i.lastEventAt) : "-"}</td>
                    <td className="td">
                      <Badge value={i.isEnabled ? "ACTIVE" : "INACTIVE"} label={i.isEnabled ? "Aktif" : "Nonaktif"} />
                    </td>
                    <td className="td text-right text-xs">
                      <Link href={`/settings/integrations?edit=${i.id}`} className="text-brand-600 hover:underline">
                        Ubah
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <TableControls
            basePath="/settings/integrations"
            query={table.query}
            page={table.page}
            pageSize={table.pageSize}
            sort={table.sort}
            direction={table.direction}
            sortOptions={tableOptions}
            total={totalCount}
          />
        </div>

        <div className="card h-fit p-5">
          <h2 className="mb-4 font-medium">{editRow ? `Ubah: ${editRow.code}` : "Integrasi Baru"}</h2>
          <form action={saveIntegrationAction} className="space-y-3">
            {editRow && <input type="hidden" name="id" value={editRow.id} />}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="code">Kode (slug)</label>
                <input id="code" name="code" className="input" defaultValue={editRow?.code ?? ""} required placeholder="mis. zabbix-core" />
              </div>
              <div>
                <label className="label" htmlFor="name">Nama</label>
                <input id="name" name="name" className="input" defaultValue={editRow?.name ?? ""} required />
              </div>
              <div>
                <label className="label" htmlFor="category">Kategori</label>
                <select id="category" name="category" className="input" defaultValue={editRow?.category ?? "NETWORK"}>
                  {INTEGRATION_CATEGORIES.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="provider">Provider</label>
                <select id="provider" name="provider" className="input" defaultValue={editRow?.provider ?? "ZABBIX"}>
                  {INTEGRATION_PROVIDERS.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="baseUrl">Base URL</label>
              <input id="baseUrl" name="baseUrl" className="input" defaultValue={editRow?.baseUrl ?? ""} placeholder="https://monitor.perumnet.id" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="authType">Autentikasi</label>
                <select id="authType" name="authType" className="input" defaultValue={editRow?.authType ?? "NONE"}>
                  {INTEGRATION_AUTH_TYPES.map((t) => (
                    <option key={t} value={t}>{t === "NONE" ? "None" : t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="credentialRef">Credential Ref (env var)</label>
                <input id="credentialRef" name="credentialRef" className="input" defaultValue={editRow?.credentialRef ?? ""} placeholder="ZABBIX_API_TOKEN" />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Isi <em>nama environment variable</em> yang menyimpan secret — jangan tempel secret-nya (rule 31).
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isEnabled" className="h-4 w-4" defaultChecked={editRow?.isEnabled ?? false} />
              Aktifkan (webhook menerima event)
            </label>
            <div>
              <label className="label" htmlFor="notes">Catatan</label>
              <textarea id="notes" name="notes" rows={2} className="input" defaultValue={editRow?.notes ?? ""} />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary">{editRow ? "Simpan" : "Tambah"}</button>
              {editRow && <Link href="/settings/integrations" className="btn-secondary">Batal</Link>}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
