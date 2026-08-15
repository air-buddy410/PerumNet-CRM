"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import type {
  ImportOutcome,
  ImportPlan,
  ItemPlan,
  MasterPlan,
  StockPlan,
  Tindakan,
} from "@/lib/item-import-service";
import type { RowIssue } from "@/lib/item-import";
import {
  applyCatalogImportAction,
  previewCatalogImportAction,
} from "@/app/(app)/inventory/actions";

type WarehouseOption = {
  id: string;
  code: string;
  name: string;
};

const IMPORT_ACTION_META: Record<Tindakan, { label: string; className: string }> = {
  CREATE: { label: "Buat", className: "is-approved" },
  LENGKAPI: { label: "Lengkapi", className: "is-pending" },
  SKIP: { label: "Lewati", className: "is-neutral" },
};

function ActionBadge({ action }: { action: Tindakan }) {
  const meta = IMPORT_ACTION_META[action];
  return <span className={`crm-badge ${meta.className} whitespace-nowrap`}>{meta.label}</span>;
}

function MasterPlanTable({ title, rows }: { title: string; rows: MasterPlan[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="min-w-0">
      <h3 className="mb-2 text-sm font-semibold text-slate-700">{title}</h3>
      <div className="overflow-x-auto rounded-lg border border-slate-100">
        <table className="min-w-[520px] w-full">
          <thead className="bg-slate-50/70">
            <tr>
              <th className="th">Kode</th>
              <th className="th">Nama</th>
              <th className="th">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={`${title}-${row.code}-${row.name}`}>
                <td className="td whitespace-nowrap font-mono text-xs">{row.code}</td>
                <td className="td max-w-[320px] break-words">{row.name}</td>
                <td className="td"><ActionBadge action={row.action} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ItemPlanTable({ rows }: { rows: ItemPlan[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-100">
      <table className="min-w-[1120px] w-full">
        <thead className="bg-slate-50/70">
          <tr>
            <th className="th">Baris</th>
            <th className="th">Kode</th>
            <th className="th">Nama</th>
            <th className="th">Aksi</th>
            <th className="th">Perubahan</th>
            <th className="th">Alasan</th>
            <th className="th">Catatan</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={`${row.rowNumber}-${row.code}`}>
              <td className="td whitespace-nowrap">{row.rowNumber}</td>
              <td className="td whitespace-nowrap font-mono text-xs">{row.code}</td>
              <td className="td max-w-[240px] break-words">{row.name || "—"}</td>
              <td className="td align-top"><ActionBadge action={row.action} /></td>
              <td className="td max-w-[300px] break-words">
                {row.changes.length > 0 ? (
                  <ul className="space-y-1">
                    {row.changes.map((change, index) => (
                      <li key={`${row.rowNumber}-change-${index}`}>{change}</li>
                    ))}
                  </ul>
                ) : "—"}
              </td>
              <td className="td max-w-[280px] break-words">
                {row.reason || (row.action === "LENGKAPI" ? "Data katalog yang kosong akan dilengkapi." : "—")}
              </td>
              <td className="td max-w-[340px] break-words text-amber-800">
                {row.notes.length > 0 ? (
                  <ul className="space-y-1">
                    {row.notes.map((note, index) => (
                      <li key={`${row.rowNumber}-note-${index}`}>{note}</li>
                    ))}
                  </ul>
                ) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StockPlanTable({ rows }: { rows: StockPlan[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-100">
      <table className="min-w-[680px] w-full">
        <thead className="bg-slate-50/70">
          <tr>
            <th className="th">Kode material</th>
            <th className="th">Jumlah</th>
            <th className="th">Aksi</th>
            <th className="th">Keterangan</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={`${row.itemCode}-${row.quantity}`}>
              <td className="td whitespace-nowrap font-mono text-xs">{row.itemCode}</td>
              <td className="td whitespace-nowrap">{row.quantity}</td>
              <td className="td"><ActionBadge action={row.action} /></td>
              <td className="td max-w-[360px] break-words">{row.reason ?? "Saldo awal akan dibuat."}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ItemCatalogImportWorkbench({
  warehouses,
  canPostOpeningBalance,
}: {
  warehouses: WarehouseOption[];
  canPostOpeningBalance: boolean;
}) {
  const [warehouseId, setWarehouseId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [allowPartial, setAllowPartial] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function resetResult() {
    setPlan(null);
    setOutcome(null);
    setError(null);
  }

  function handleWarehouseChange(event: ChangeEvent<HTMLSelectElement>) {
    setWarehouseId(event.target.value);
    setAllowPartial(false);
    resetResult();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setAllowPartial(false);
    resetResult();
  }

  function preview() {
    if (!warehouseId) {
      setError("Pilih gudang aktif terlebih dahulu.");
      return;
    }
    if (!file) {
      setError("Pilih berkas Excel terlebih dahulu.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("warehouseId", warehouseId);
    setError(null);
    setOutcome(null);
    setAllowPartial(false);
    startTransition(async () => {
      try {
        const result = await previewCatalogImportAction(formData);
        if (result.ok) {
          setPlan(result.data);
        } else {
          setPlan(null);
          setError(result.error);
        }
      } catch {
        setPlan(null);
        setError("Pratinjau katalog tidak dapat diproses. Periksa berkas lalu coba lagi.");
      }
    });
  }

  function apply() {
    if (!file || !warehouseId || !plan) return;
    const canApply = plan.ok || (plan.issues.length > 0 && allowPartial);
    if (!canApply) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("warehouseId", warehouseId);
    if (!plan.ok && allowPartial) formData.append("allowPartial", "1");
    setError(null);
    startTransition(async () => {
      try {
        const result = await applyCatalogImportAction(formData);
        if (result.ok) {
          setOutcome(result.data);
        } else {
          setError(result.error);
        }
      } catch {
        setError("Impor tidak dapat diterapkan. Tidak ada perubahan yang diasumsikan berhasil.");
      }
    });
  }

  const openingBalanceBlocked = Boolean(plan?.openingUnits && !canPostOpeningBalance);
  const canApply = Boolean(
    plan && file && warehouseId && !isPending && (plan.ok || (plan.issues.length > 0 && allowPartial)) && !openingBalanceBlocked,
  );

  return (
    <div className="space-y-6">
      <section className="card min-w-0 p-5 sm:p-6" aria-labelledby="catalog-import-file-title">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 id="catalog-import-file-title" className="text-lg font-semibold text-slate-700">Berkas sumber</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
              Pilih gudang aktif dan satu berkas .xlsx. Sistem memeriksa seluruh katalog sebelum perubahan diterapkan.
            </p>
          </div>
          <span className="crm-badge is-neutral shrink-0">Items Manage</span>
        </div>

        <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(13rem,18rem)_auto] sm:items-end">
          <div className="min-w-0">
            <label className="label" htmlFor="catalog-import-file">Berkas katalog</label>
            <input
              id="catalog-import-file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleFileChange}
              className="block min-w-0 max-w-full text-xs text-slate-500"
              disabled={isPending}
            />
            <p className="mt-2 truncate text-[11px] text-slate-400" title={file?.name ?? "Belum ada berkas"}>
              {file?.name ?? "Belum ada berkas dipilih"}
            </p>
          </div>
          <div className="min-w-0">
            <label className="label" htmlFor="catalog-import-warehouse">Gudang saldo awal</label>
            <select
              id="catalog-import-warehouse"
              className="input"
              value={warehouseId}
              onChange={handleWarehouseChange}
              disabled={isPending}
            >
              <option value="">— pilih gudang aktif —</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.code} · {warehouse.name}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="btn-primary justify-center whitespace-nowrap" onClick={preview} disabled={!file || !warehouseId || isPending}>
            {isPending ? "Memproses…" : "Pratinjau"}
          </button>
        </div>

        {warehouses.length === 0 && (
          <p className="crm-flash is-error mt-4" role="alert">Belum ada gudang aktif yang dapat dipilih.</p>
        )}
        {error && <div className="crm-flash is-error mt-4" role="alert">{error}</div>}
      </section>

      {plan && (
        <section className="card min-w-0 p-5 sm:p-6" aria-labelledby="catalog-import-preview-title">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 id="catalog-import-preview-title" className="text-lg font-semibold text-slate-700">Pratinjau katalog</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                {plan.ok
                  ? `Gudang tujuan: ${plan.warehouseName}. Berkas lolos pemeriksaan dan siap diterapkan.`
                  : "Berkas masih memiliki masalah dan belum dapat diterapkan."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="crm-badge is-approved">Buat {plan.willCreateItems}</span>
              <span className="crm-badge is-pending">Lengkapi {plan.willCompleteItems}</span>
              <span className="crm-badge is-neutral">Lewati {plan.willSkipItems}</span>
              <span className="crm-badge is-neutral">Kategori {plan.willCreateCategories}</span>
              <span className="crm-badge is-neutral">Vendor {plan.willCreateSuppliers}</span>
              <span className="crm-badge is-pending">Saldo awal {plan.openingUnits}</span>
            </div>
          </div>

          {plan.issues.length > 0 && (
            <div className="mt-5 rounded-lg border border-rose-100 bg-rose-50 p-4" role="alert">
              <h3 className="text-sm font-semibold text-rose-900">Perlu diperbaiki sebelum impor</h3>
              <ul className="mt-2 space-y-1 text-xs leading-relaxed text-rose-800">
                {plan.issues.map((issue: RowIssue, index) => (
                  <li key={`${issue.rowNumber}-${issue.column}-${index}`}>
                    Baris {issue.rowNumber} · kolom {issue.column}: {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {plan.issues.length > 0 && (
            <label className="mt-4 flex min-w-0 items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-xs leading-relaxed text-amber-900">
              <input
                type="checkbox"
                checked={allowPartial}
                onChange={(event) => setAllowPartial(event.target.checked)}
                disabled={isPending}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span>
                <span className="font-semibold">Terapkan sebagian — lewati {plan.issues.length} baris bermasalah</span>
                <span className="mt-1 block">Bawaan tetap mati. Keputusan ini dicatat dan baris yang dilewati akan ditampilkan pada hasil penerapan.</span>
              </span>
            </label>
          )}

          <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-2">
            <MasterPlanTable title="Kategori" rows={plan.categories} />
            <MasterPlanTable title="Vendor" rows={plan.suppliers} />
          </div>

          <div className="mt-5 min-w-0">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Material</h3>
            <ItemPlanTable rows={plan.items} />
          </div>

          <div className="mt-5 min-w-0">
            <div className="mb-2 flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
              <h3 className="text-sm font-semibold text-slate-700">Saldo awal</h3>
              <p className="text-xs leading-relaxed text-slate-500">
                Saldo awal akan membuat dokumen Goods Receipt untuk gudang terpilih.
              </p>
            </div>
            <StockPlanTable rows={plan.stock} />
            {plan.stock.length === 0 && <p className="text-xs text-slate-500">Tidak ada saldo awal yang akan dibuat.</p>}
          </div>

          <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-amber-100 bg-amber-50/70 p-4 text-xs leading-relaxed text-amber-900">
              <strong>Riwayat pergerakan:</strong> {plan.skippedMovements > 0
                ? `${plan.skippedMovements} baris riwayat tidak diimpor karena datanya tidak lengkap.`
                : "Tidak ada baris riwayat yang perlu dilewati."}
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-4 text-xs leading-relaxed text-slate-600">
              <strong>Lembar lain:</strong> {plan.ignoredSheets > 0
                ? `${plan.ignoredSheets} lembar tidak digunakan karena bukan bagian dari katalog.`
                : "Tidak ada lembar lain yang diabaikan."}
            </div>
          </div>

          {openingBalanceBlocked && (
            <div className="crm-flash is-error mt-5" role="alert">
              Saldo awal membutuhkan izin membuat dan memposting transaksi stock. Hubungi admin sebelum menerapkan impor ini.
            </div>
          )}

          <div className="mt-5 flex min-w-0 flex-col gap-3 rounded-lg border border-slate-100 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 text-xs leading-relaxed text-slate-600">
              Penerapan membaca ulang berkas asli yang sama. Menjalankan ulang berkas yang sama aman karena pencocokan katalog memakai kode yang stabil.
            </p>
            <button
              type="button"
              className="btn-primary shrink-0 justify-center whitespace-nowrap"
              onClick={apply}
              disabled={!canApply}
            >
              {isPending ? "Menerapkan…" : plan.ok ? "Terapkan impor" : "Terapkan sebagian"}
            </button>
          </div>
        </section>
      )}

      {outcome && (
        <section className="card min-w-0 p-5 sm:p-6" aria-labelledby="catalog-import-result-title">
          <h2 id="catalog-import-result-title" className="text-lg font-semibold text-slate-700">Impor selesai</h2>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs leading-relaxed text-slate-500" role="status">
            <span>{outcome.createdCategories} kategori dibuat</span>
            <span>{outcome.createdSuppliers} vendor dibuat</span>
            <span>{outcome.createdItems.length} material dibuat</span>
            <span>{outcome.completedItems.length} material dilengkapi</span>
            <span>{outcome.skippedItems} material dilewati</span>
            <span>{outcome.openingUnits} unit saldo awal</span>
          </div>

          {outcome.openingTxNumber && (
            <div className="crm-flash is-success mt-4" role="status">
              Dokumen saldo awal: <strong>{outcome.openingTxNumber}</strong> · {outcome.openingUnits} unit.
            </div>
          )}

          {outcome.skippedIssues.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50/70 p-4" role="status">
              <h3 className="text-sm font-semibold text-amber-900">Baris yang dilewati saat penerapan sebagian</h3>
              <ul className="mt-2 space-y-1 text-xs leading-relaxed text-amber-900">
                {outcome.skippedIssues.map((issue, index) => (
                  <li key={`${issue.rowNumber}-${issue.column}-${index}`}>
                    {issue.rowNumber > 0 ? `Baris ${issue.rowNumber}` : "Validasi berkas"} · {issue.column}: {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {outcome.createdItems.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-100">
              <table className="min-w-[560px] w-full">
                <thead className="bg-slate-50/70">
                  <tr><th className="th">Kode</th><th className="th">Nama material</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {outcome.createdItems.map((row) => (
                    <tr key={row.code}>
                      <td className="td whitespace-nowrap font-mono text-xs">{row.code}</td>
                      <td className="td max-w-[420px] break-words">{row.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {outcome.completedItems.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-100">
              <table className="min-w-[720px] w-full">
                <thead className="bg-slate-50/70">
                  <tr><th className="th">Kode</th><th className="th">Data yang dilengkapi</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {outcome.completedItems.map((row) => (
                    <tr key={row.code}>
                      <td className="td whitespace-nowrap font-mono text-xs">{row.code}</td>
                      <td className="td max-w-[520px] break-words">
                        <ul className="space-y-1">
                          {row.fields.map((field, index) => <li key={`${row.code}-field-${index}`}>{field}</li>)}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
