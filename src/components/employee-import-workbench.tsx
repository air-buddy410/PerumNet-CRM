"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import type { RowIssue } from "@/lib/employee-import";
import type { ImportOutcome, ImportPlan } from "@/lib/employee-import-service";
import { applyEmployeeImportAction, previewEmployeeImportAction } from "@/app/(app)/hrd/actions";

type ImportAction = ImportPlan["rows"][number]["action"];

const IMPORT_ACTION_META: Record<ImportAction, { label: string; className: string }> = {
  CREATE: { label: "Buat", className: "is-approved" },
  LENGKAPI: { label: "Lengkapi", className: "is-pending" },
  SKIP: { label: "Lewati", className: "is-neutral" },
};

export function EmployeeImportWorkbench() {
  const [file, setFile] = useState<File | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setPlan(null);
    setOutcome(null);
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
    startTransition(async () => {
      try {
        const result = await previewEmployeeImportAction(formData);
        if (result.ok) {
          setPlan(result.data);
        } else {
          setPlan(null);
          setError(result.error);
        }
      } catch {
        setPlan(null);
        setError("Pratinjau tidak dapat diproses. Periksa berkas lalu coba lagi.");
      }
    });
  }

  function apply() {
    if (!file || !plan?.ok) return;

    const formData = new FormData();
    formData.append("file", file);
    setError(null);
    startTransition(async () => {
      try {
        const result = await applyEmployeeImportAction(formData);
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

  return (
    <div className="space-y-6">
      <section className="card min-w-0 p-5 sm:p-6" aria-labelledby="employee-import-file-title">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 id="employee-import-file-title" className="text-lg font-semibold text-slate-700">Berkas sumber</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
              Pilih satu berkas .xlsx. Sistem akan memvalidasi seluruh baris sebelum perubahan diterapkan.
            </p>
          </div>
          <span className="crm-badge is-neutral shrink-0">HRD Manage</span>
        </div>
        <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="min-w-0">
            <label className="label" htmlFor="employee-import-file">Berkas Excel</label>
            <input
              id="employee-import-file"
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
        <section className="card min-w-0 p-5 sm:p-6" aria-labelledby="employee-import-preview-title">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 id="employee-import-preview-title" className="text-lg font-semibold text-slate-700">Pratinjau impor</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                {plan.ok ? "Berkas lolos pemeriksaan dan siap diterapkan." : "Berkas masih memiliki masalah dan belum dapat diterapkan."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="crm-badge is-approved">Buat {plan.willCreate}</span>
              <span className="crm-badge is-pending">Lengkapi {plan.willComplete}</span>
              <span className="crm-badge is-neutral">Lewati {plan.willSkip}</span>
              {plan.blankRows > 0 && <span className="crm-badge is-neutral">Kosong {plan.blankRows}</span>}
            </div>
          </div>

          {plan.issues.length > 0 && (
            <div className="mt-5 rounded-lg border border-rose-100 bg-rose-50 p-4" role="alert">
              <h3 className="text-sm font-semibold text-rose-900">Perlu diperbaiki sebelum impor</h3>
              <ul className="mt-2 space-y-1 text-xs leading-relaxed text-rose-800">
                {plan.issues.map((issue: RowIssue, index) => (
                  <li key={`${issue.rowNumber}-${issue.column}-${index}`}>
                    Baris {issue.rowNumber} · {issue.column}: {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 overflow-x-auto rounded-lg border border-slate-100">
            <table className="min-w-[760px] w-full">
              <thead className="bg-slate-50/70">
                <tr>
                  <th className="th">Baris</th>
                  <th className="th">Nama lengkap</th>
                  <th className="th">NIK</th>
                  <th className="th">Aksi</th>
                  <th className="th">Alasan</th>
                  <th className="th">Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {plan.rows.map((row) => (
                  <tr key={row.rowNumber}>
                    <td className="td whitespace-nowrap">{row.rowNumber}</td>
                    <td className="td max-w-[220px] break-words">{row.fullName || "—"}</td>
                    <td className="td whitespace-nowrap">{row.employeeNo || "Akan diterbitkan"}</td>
                    <td className="td align-top">
                      <span className={`crm-badge ${IMPORT_ACTION_META[row.action].className} whitespace-nowrap`}>
                        {IMPORT_ACTION_META[row.action].label}
                      </span>
                    </td>
                    <td className="td max-w-[280px] break-words">
                      {row.reason || (row.action === "LENGKAPI" ? "Data diri akan dilengkapi." : "—")}
                    </td>
                    <td className="td max-w-[320px] break-words">
                      {row.notes.length > 0 ? (
                        <ul className="space-y-1">
                          {row.notes.map((note, index) => (
                            <li key={`${row.rowNumber}-note-${index}`} className="break-words">{note}</li>
                          ))}
                        </ul>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex min-w-0 flex-col gap-3 rounded-lg border border-slate-100 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 text-xs leading-relaxed text-slate-600">
              Penerapan membaca ulang berkas asli. Satu masalah akan menahan seluruh impor.
            </p>
            <button type="button" className="btn-primary shrink-0 justify-center" onClick={apply} disabled={!plan.ok || !file || isPending}>
              {isPending ? "Menerapkan…" : "Terapkan impor"}
            </button>
          </div>
        </section>
      )}

      {outcome && (
        <section className="card min-w-0 p-5 sm:p-6" aria-labelledby="employee-import-result-title">
          <h2 id="employee-import-result-title" className="text-lg font-semibold text-slate-700">Impor selesai</h2>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs leading-relaxed text-slate-500" role="status">
            <span>{outcome.created.length} dibuat</span>
            <span>{outcome.completed.length} dilengkapi</span>
            <span>{outcome.skipped} dilewati karena sudah terdaftar</span>
          </div>
          {outcome.created.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-100">
              <table className="min-w-[520px] w-full">
                <thead className="bg-slate-50/70">
                  <tr>
                    <th className="th">Baris</th>
                    <th className="th">NIK terbit</th>
                    <th className="th">Nama</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {outcome.created.map((row) => (
                    <tr key={`${row.rowNumber}-${row.employeeNo}`}>
                      <td className="td whitespace-nowrap">{row.rowNumber}</td>
                      <td className="td whitespace-nowrap font-semibold">{row.employeeNo}</td>
                      <td className="td">{row.fullName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {outcome.completed.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-100">
              <table className="min-w-[680px] w-full">
                <thead className="bg-slate-50/70">
                  <tr>
                    <th className="th">NIK</th>
                    <th className="th">Nama</th>
                    <th className="th">Data dilengkapi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {outcome.completed.map((row) => (
                    <tr key={row.employeeNo}>
                      <td className="td whitespace-nowrap font-semibold">{row.employeeNo}</td>
                      <td className="td max-w-[220px] break-words">{row.fullName}</td>
                      <td className="td max-w-[420px] break-words">
                        <ul className="space-y-1">
                          {row.fields.map((field, index) => (
                            <li key={`${row.employeeNo}-field-${index}`} className="break-words">{field}</li>
                          ))}
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
