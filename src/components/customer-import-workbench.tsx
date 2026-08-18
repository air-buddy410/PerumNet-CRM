"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import type { RowIssue } from "@/lib/customer-import";
import type {
  CustomerPlan,
  ImportOutcome,
  ImportPlan,
  OdpPlan,
  Tindakan,
} from "@/lib/customer-import-service";
import {
  applyCustomerImportAction,
  previewCustomerImportAction,
} from "@/app/(app)/crm/customers/actions";

const ACTION_META: Record<Tindakan, { label: string; className: string }> = {
  CREATE: { label: "Buat", className: "is-approved" },
  LENGKAPI: { label: "Lengkapi", className: "is-pending" },
  SKIP: { label: "Lewati", className: "is-neutral" },
};

function ActionBadge({ action }: { action: Tindakan }) {
  const meta = ACTION_META[action];
  return <span className={`crm-badge ${meta.className} whitespace-nowrap`}>{meta.label}</span>;
}

function IssueList({ issues, title = "Masalah pada berkas" }: { issues: RowIssue[]; title?: string }) {
  if (issues.length === 0) return null;

  return (
    <div className="mt-5 rounded-lg border border-rose-100 bg-rose-50 p-4" role="alert">
      <h3 className="text-sm font-semibold text-rose-900">{title}</h3>
      <ul className="mt-2 space-y-1 text-xs leading-relaxed text-rose-800">
        {issues.map((issue, index) => (
          <li key={`${issue.rowNumber}-${issue.column}-${index}`}>
            {issue.rowNumber > 0 ? `Baris ${issue.rowNumber}` : "Validasi berkas"} · {issue.column}: {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CustomerPlanTable({ rows }: { rows: CustomerPlan[] }) {
  if (rows.length === 0) return <p className="text-xs text-slate-500">Tidak ada baris pelanggan.</p>;

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-100">
      <table className="min-w-[1120px] w-full">
        <thead className="bg-slate-50/70">
          <tr>
            <th className="th">Baris</th>
            <th className="th">CID</th>
            <th className="th">Nama</th>
            <th className="th">Aksi</th>
            <th className="th">Perubahan</th>
            <th className="th">Alasan</th>
            <th className="th">Catatan</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={`${row.rowNumber}-${row.cid}`}>
              <td className="td whitespace-nowrap">{row.rowNumber}</td>
              <td className="td whitespace-nowrap font-mono text-xs">{row.cid}</td>
              <td className="td max-w-[220px] break-words">{row.name || "—"}</td>
              <td className="td align-top"><ActionBadge action={row.action} /></td>
              <td className="td max-w-[300px] break-words">
                {row.changes.length > 0 ? (
                  <ul className="space-y-1">
                    {row.changes.map((change, index) => (
                      <li key={`${row.cid}-change-${index}`}>{change}</li>
                    ))}
                  </ul>
                ) : "—"}
              </td>
              <td className="td max-w-[280px] break-words">
                {row.reason || (row.action === "LENGKAPI" ? "Data kosong akan dilengkapi." : "—")}
              </td>
              <td className="td max-w-[360px] break-words text-amber-800">
                {row.notes.length > 0 ? (
                  <ul className="space-y-1">
                    {row.notes.map((note, index) => (
                      <li key={`${row.cid}-note-${index}`}>{note}</li>
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

function OdpPlanTable({ rows }: { rows: OdpPlan[] }) {
  if (rows.length === 0) return <p className="text-xs text-slate-500">Tidak ada ODP baru atau yang dirujuk.</p>;

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-100">
      <table className="min-w-[620px] w-full">
        <thead className="bg-slate-50/70">
          <tr>
            <th className="th">Kode ODP</th>
            <th className="th">Aksi</th>
            <th className="th">Baris pelanggan</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.code}>
              <td className="td whitespace-nowrap font-mono text-xs">{row.code}</td>
              <td className="td"><ActionBadge action={row.action} /></td>
              <td className="td whitespace-nowrap">{row.customers}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OutcomeSummary({ outcome }: { outcome: ImportOutcome }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs leading-relaxed text-slate-500" role="status">
      <span>{outcome.createdCustomers.length} pelanggan dibuat</span>
      <span>{outcome.completedCustomers.length} pelanggan dilengkapi</span>
      <span>{outcome.createdSubscriptions} subscription dibuat</span>
      <span>{outcome.createdOdps.length} ODP dibuat</span>
      <span>{outcome.linkedOdpPorts} port ODP tertaut</span>
      <span>{outcome.skipped} dilewati</span>
      {outcome.skippedIssues.length > 0 && <span>{outcome.skippedIssues.length} baris bermasalah dilewati</span>}
    </div>
  );
}

export function CustomerImportWorkbench() {
  const [file, setFile] = useState<File | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [allowPartial, setAllowPartial] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setPlan(null);
    setOutcome(null);
    setAllowPartial(false);
    setError(null);
  }

  function preview() {
    if (!file) {
      setError("Pilih berkas Excel terlebih dahulu.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    setError(null);
    setOutcome(null);
    setAllowPartial(false);
    startTransition(async () => {
      try {
        const result = await previewCustomerImportAction(formData);
        if (result.ok) {
          setPlan(result.data);
        } else {
          setPlan(null);
          setError(result.error);
        }
      } catch {
        setPlan(null);
        setError("Pratinjau pelanggan tidak dapat diproses. Periksa berkas lalu coba lagi.");
      }
    });
  }

  function apply() {
    if (!file || !plan) return;
    const partialAllowed = plan.issues.length > 0 && plan.unknownPackages.length === 0;
    const canApply = plan.ok || (partialAllowed && allowPartial);
    if (!canApply) return;

    const formData = new FormData();
    formData.append("file", file);
    if (!plan.ok && allowPartial) formData.append("allowPartial", "1");
    setError(null);
    startTransition(async () => {
      try {
        const result = await applyCustomerImportAction(formData);
        if (result.ok) {
          setOutcome(result.data);
        } else {
          setError(result.error);
        }
      } catch {
        setError("Impor pelanggan tidak dapat diterapkan. Tidak ada perubahan yang diasumsikan berhasil.");
      }
    });
  }

  const partialBlockedByPackage = Boolean(plan && plan.unknownPackages.length > 0);
  const partialAllowed = Boolean(plan && plan.issues.length > 0 && !partialBlockedByPackage);
  const canApply = Boolean(
    plan && file && !isPending && (plan.ok || (partialAllowed && allowPartial)),
  );

  return (
    <div className="space-y-6">
      <section className="card min-w-0 p-5 sm:p-6" aria-labelledby="customer-import-file-title">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 id="customer-import-file-title" className="text-lg font-semibold text-slate-700">Berkas sumber</h2>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">
              Satu berkas dapat membuat ODP, pelanggan, dan subscription. Pilih berkas .xlsx untuk melihat rencana sebelum data diterapkan.
            </p>
          </div>
          <span className="crm-badge is-neutral shrink-0">Customer + Subscription</span>
        </div>

        <div className="crm-import-file-controls mt-5 min-w-0">
          <div className="crm-import-file-field min-w-0">
            <label className="label" htmlFor="customer-import-file">Berkas Excel</label>
            <input
              id="customer-import-file"
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
          <button type="button" className="btn-primary justify-center whitespace-nowrap" onClick={preview} disabled={!file || isPending}>
            {isPending ? "Memproses…" : "Pratinjau"}
          </button>
        </div>
        {error && <div className="crm-flash is-error mt-4" role="alert">{error}</div>}
      </section>

      {plan && (
        <section className="card min-w-0 p-5 sm:p-6" aria-labelledby="customer-import-preview-title">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 id="customer-import-preview-title" className="text-lg font-semibold text-slate-700">Pratinjau pelanggan, ODP, dan subscription</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                {plan.ok ? "Berkas lolos pemeriksaan dan siap diterapkan." : "Berkas memiliki masalah. Periksa barisnya atau pilih penerapan sebagian dengan sadar."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="crm-badge is-approved">Pelanggan baru {plan.willCreateCustomers}</span>
              <span className="crm-badge is-pending">Dilengkapi {plan.willCompleteCustomers}</span>
              <span className="crm-badge is-neutral">Dilewati {plan.willSkipCustomers}</span>
              <span className="crm-badge is-approved">ODP baru {plan.willCreateOdps}</span>
              <span className="crm-badge is-approved">Subscription {plan.willCreateSubscriptions}</span>
              {plan.skipped > 0 && <span className="crm-badge is-neutral">Baris kosong {plan.skipped}</span>}
            </div>
          </div>

          <IssueList issues={plan.issues} title="Perlu diperiksa sebelum penerapan" />

          {plan.unknownPackages.length > 0 && (
            <div className="crm-flash is-error mt-4" role="alert">
              <strong>Paket belum tersedia di master:</strong> {plan.unknownPackages.join(", ")}. Buat atau samakan paket terlebih dahulu; penerapan sebagian tetap tidak dapat melewati paket tanpa harga.
            </div>
          )}

          {plan.unknownSales.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50/70 p-4 text-xs leading-relaxed text-amber-900">
              <strong>Sales belum ditetapkan:</strong> nama berikut tidak dicocokkan otomatis. Pelanggan tetap dapat diproses dan pemiliknya dapat ditentukan kemudian.
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {plan.unknownSales.map((sales, index) => <li key={`${sales}-${index}`}>{sales}</li>)}
              </ul>
            </div>
          )}

          {plan.odps.some((odp) => odp.action === "CREATE") && (
            <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50/70 p-4 text-xs leading-relaxed text-amber-900">
              <strong>Kapasitas ODP adalah dugaan:</strong> ODP baru akan dibuat dengan 8 port karena sumber data tidak memuat kapasitas. Verifikasi kapasitas dan okupansi di lapangan sebelum menjadikannya acuan operasional.
            </div>
          )}

          <div className="mt-5 min-w-0">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Pelanggan</h3>
            <CustomerPlanTable rows={plan.customers} />
          </div>

          <div className="mt-5 min-w-0">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">ODP dan port</h3>
            <OdpPlanTable rows={plan.odps} />
          </div>

          <div className="mt-5 rounded-lg border border-slate-100 bg-slate-50/70 p-4 text-xs leading-relaxed text-slate-600">
            Penerapan membaca ulang berkas asli yang sama. ODP dibuat lebih dahulu, lalu pelanggan dan subscription dibuat, kemudian subscription menempati port ODP yang masih kosong.
          </div>

          {partialAllowed && (
            <label className="mt-5 flex min-w-0 items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-xs leading-relaxed text-amber-900">
              <input
                type="checkbox"
                checked={allowPartial}
                onChange={(event) => setAllowPartial(event.target.checked)}
                disabled={isPending}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span>
                <span className="font-semibold">Terapkan sebagian — lewati {plan.issues.length} baris bermasalah</span>
                <span className="mt-1 block">Keputusan ini sadar dan tercatat. Baris yang dilewati akan ditampilkan pada hasil penerapan.</span>
              </span>
            </label>
          )}

          {partialBlockedByPackage && (
            <p className="crm-flash is-error mt-5" role="alert">
              Penerapan sebagian tidak tersedia selama masih ada paket yang belum memiliki padanan di master.
            </p>
          )}

          <div className="mt-5 flex min-w-0 flex-col gap-3 rounded-lg border border-slate-100 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 text-xs leading-relaxed text-slate-600">
              Setelah sebagian diterapkan, berkas yang sama aman dijalankan ulang karena pencocokan memakai NIK/telepon, nomor layanan, dan kode ODP yang stabil.
            </p>
            <button type="button" className="btn-primary shrink-0 justify-center whitespace-nowrap" onClick={apply} disabled={!canApply}>
              {isPending ? "Menerapkan…" : plan.ok ? "Terapkan impor" : "Terapkan sebagian"}
            </button>
          </div>
        </section>
      )}

      {outcome && (
        <section className="card min-w-0 p-5 sm:p-6" aria-labelledby="customer-import-result-title">
          <h2 id="customer-import-result-title" className="text-lg font-semibold text-slate-700">Hasil penerapan</h2>
          <OutcomeSummary outcome={outcome} />

          {outcome.skippedIssues.length > 0 && (
            <IssueList issues={outcome.skippedIssues} title="Baris yang dilewati saat penerapan sebagian" />
          )}

          {outcome.createdOdps.length > 0 && (
            <div className="mt-5 rounded-lg border border-slate-100 bg-slate-50/70 p-4 text-xs leading-relaxed text-slate-600">
              <strong>ODP dibuat:</strong> {outcome.createdOdps.join(", ")}
            </div>
          )}

          {outcome.createdCustomers.length > 0 && (
            <div className="mt-5 overflow-x-auto rounded-lg border border-slate-100">
              <table className="min-w-[700px] w-full">
                <thead className="bg-slate-50/70">
                  <tr><th className="th">CID</th><th className="th">Nomor customer</th><th className="th">Nama</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {outcome.createdCustomers.map((row) => (
                    <tr key={row.cid}>
                      <td className="td whitespace-nowrap font-mono text-xs">{row.cid}</td>
                      <td className="td whitespace-nowrap font-semibold">{row.customerNumber}</td>
                      <td className="td max-w-[360px] break-words">{row.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {outcome.completedCustomers.length > 0 && (
            <div className="mt-5 overflow-x-auto rounded-lg border border-slate-100">
              <table className="min-w-[760px] w-full">
                <thead className="bg-slate-50/70">
                  <tr><th className="th">CID</th><th className="th">Data yang dilengkapi</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {outcome.completedCustomers.map((row) => (
                    <tr key={row.cid}>
                      <td className="td whitespace-nowrap font-mono text-xs">{row.cid}</td>
                      <td className="td max-w-[600px] break-words">
                        <ul className="space-y-1">
                          {row.fields.map((field, index) => <li key={`${row.cid}-field-${index}`}>{field}</li>)}
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
