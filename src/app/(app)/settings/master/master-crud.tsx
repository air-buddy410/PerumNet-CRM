import Link from "next/link";
import { PageHeader, Flash, ActiveBadge, EmptyState } from "@/components/ui";
import { SortableTableHeader, TableControls, type TableDirection, type TablePageSize, type TableQuery, type TableSortOption } from "@/components/table-controls";
import { saveMasterAction, toggleMasterAction, type MasterEntity } from "./actions";

export interface MasterRow {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  extraCols?: string[]; // kolom tambahan (paket)
  extraFields?: Record<string, string | number>; // prefill edit (paket)
}

export interface MasterTableState {
  query: TableQuery;
  page: number;
  pageSize: TablePageSize;
  sort: string;
  direction: TableDirection;
  sortOptions: readonly TableSortOption[];
  total: number;
}

export function MasterCrud({
  entity,
  title,
  subtitle,
  extraHeaders = [],
  rows,
  editRow,
  canManage,
  isPackage = false,
  flash,
  table,
}: {
  entity: MasterEntity;
  title: string;
  subtitle: string;
  extraHeaders?: string[];
  rows: MasterRow[];
  editRow: MasterRow | null;
  canManage: boolean;
  isPackage?: boolean;
  flash: { ok?: string; error?: string };
  table: MasterTableState;
}) {
  const base = `/settings/master/${entity}`;

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      <Flash ok={flash.ok} error={flash.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="card overflow-x-auto">
          {rows.length === 0 ? (
            <EmptyState message="Belum ada data." />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th"><SortableTableHeader basePath={base} query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="code" label="Kode" /></th>
                  <th className="th"><SortableTableHeader basePath={base} query={table.query} currentSort={table.sort} currentDirection={table.direction} sortKey="name" label="Nama" /></th>
                  {extraHeaders.map((h) => (
                    <th key={h} className="th">{h}</th>
                  ))}
                  <th className="th">Status</th>
                  {canManage && <th className="th"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="td font-mono text-xs">{row.code}</td>
                    <td className="td">
                      <div className="font-medium">{row.name}</div>
                      {row.description && (
                        <div className="text-xs text-slate-500">{row.description}</div>
                      )}
                    </td>
                    {(row.extraCols ?? []).map((c, i) => (
                      <td key={i} className="td whitespace-nowrap">{c}</td>
                    ))}
                    <td className="td">
                      <ActiveBadge isActive={row.isActive} />
                    </td>
                    {canManage && (
                      <td className="td whitespace-nowrap text-right text-xs">
                        <Link
                          href={`${base}?edit=${row.id}`}
                          className="text-brand-600 hover:underline"
                        >
                          Ubah
                        </Link>
                        <form action={toggleMasterAction} className="ml-3 inline">
                          <input type="hidden" name="entity" value={entity} />
                          <input type="hidden" name="id" value={row.id} />
                          <button type="submit" className="text-slate-500 hover:underline">
                            {row.isActive ? "Nonaktifkan" : "Aktifkan"}
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <TableControls
            basePath={base}
            query={table.query}
            page={table.page}
            pageSize={table.pageSize}
            sort={table.sort}
            direction={table.direction}
            sortOptions={table.sortOptions}
            total={table.total}
          />
        </div>

        {canManage && (
          <div className="card h-fit p-5">
            <h2 className="mb-4 font-medium">
              {editRow ? `Ubah: ${editRow.code}` : "Tambah Baru"}
            </h2>
            <form action={saveMasterAction} className="space-y-3">
              <input type="hidden" name="entity" value={entity} />
              {editRow && <input type="hidden" name="id" value={editRow.id} />}
              <div>
                <label className="label" htmlFor="code">Kode</label>
                <input
                  id="code"
                  name="code"
                  className="input"
                  defaultValue={editRow?.code ?? ""}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="name">Nama</label>
                <input
                  id="name"
                  name="name"
                  className="input"
                  defaultValue={editRow?.name ?? ""}
                  required
                />
              </div>
              {isPackage && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label" htmlFor="downloadMbps">Download (Mbps)</label>
                      <input
                        id="downloadMbps"
                        name="downloadMbps"
                        type="number"
                        min={1}
                        className="input"
                        defaultValue={editRow?.extraFields?.downloadMbps ?? ""}
                        required
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor="uploadMbps">Upload (Mbps)</label>
                      <input
                        id="uploadMbps"
                        name="uploadMbps"
                        type="number"
                        min={1}
                        className="input"
                        defaultValue={editRow?.extraFields?.uploadMbps ?? ""}
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label" htmlFor="monthlyPrice">Harga Bulanan (Rp)</label>
                    <input
                      id="monthlyPrice"
                      name="monthlyPrice"
                      type="number"
                      min={0}
                      className="input"
                      defaultValue={editRow?.extraFields?.monthlyPrice ?? ""}
                      required
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="installationFee">Biaya Instalasi (Rp)</label>
                    <input
                      id="installationFee"
                      name="installationFee"
                      type="number"
                      min={0}
                      className="input"
                      defaultValue={editRow?.extraFields?.installationFee ?? 0}
                      required
                    />
                  </div>
                </>
              )}
              {!isPackage && entity !== "categories" && entity !== "divisions" && (
                <div>
                  <label className="label" htmlFor="description">Deskripsi</label>
                  <textarea
                    id="description"
                    name="description"
                    rows={2}
                    className="input"
                    defaultValue={editRow?.description ?? ""}
                  />
                </div>
              )}
              <div className="flex gap-2">
                <button type="submit" className="btn-primary">
                  {editRow ? "Simpan" : "Tambah"}
                </button>
                {editRow && (
                  <Link href={base} className="btn-secondary">
                    Batal
                  </Link>
                )}
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
