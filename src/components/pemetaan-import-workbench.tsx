"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import type { HasilAksi } from "@/app/(app)/noc/pemetaan/actions";
import {
  applyPemetaanAction,
  previewPemetaanAction,
} from "@/app/(app)/noc/pemetaan/actions";
import {
  clientFileSizeError,
  MAX_CLIENT_UPLOAD_BYTES,
} from "@/components/client-file-upload-guard";

type PemetaanResult = Extract<HasilAksi, { ok: true }>["data"];
type DecisionStatus = PemetaanResult["baris"][number]["status"];
type DecisionKind = PemetaanResult["baris"][number]["jenis"];

const STATUS_META: Record<DecisionStatus, { label: string; className: string }> = {
  SIAP: { label: "Siap diterapkan", className: "is-approved" },
  LEWAT: { label: "Sudah sesuai", className: "is-neutral" },
  TOLAK: { label: "Ditolak", className: "is-rejected" },
};

const KIND_LABELS: Record<DecisionKind, string> = {
  TAUT: "Tautan PPPoE",
  ABAIKAN: "Abaikan username",
  PORT: "Port ODP",
  KAPASITAS: "Kapasitas ODP",
};

function StatusBadge({ status }: { status: DecisionStatus }) {
  const meta = STATUS_META[status];
  return <span className={`crm-badge ${meta.className} whitespace-nowrap`}>{meta.label}</span>;
}

function DecisionTable({ result }: { result: PemetaanResult }) {
  if (result.baris.length === 0) {
    return (
      <div className="crm-empty-state" role="status">
        Tidak ada keputusan yang dapat ditampilkan dari berkas ini.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-100">
      <table className="min-w-[900px] w-full">
        <thead className="bg-slate-50/70">
          <tr>
            <th className="th">Jenis</th>
            <th className="th">Kunci keputusan</th>
            <th className="th">Status</th>
            <th className="th">Keterangan</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {result.baris.map((row, index) => (
            <tr key={`${row.jenis}-${row.kunci}-${index}`}>
              <td className="td align-top whitespace-nowrap">{KIND_LABELS[row.jenis]}</td>
              <td className="td max-w-[340px] break-words font-mono text-xs">{row.kunci}</td>
              <td className="td align-top"><StatusBadge status={row.status} /></td>
              <td className="td max-w-[460px] break-words">{row.pesan}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultSummary({ result, outcome = false }: { result: PemetaanResult; outcome?: boolean }) {
  return (
    <div className="flex min-w-0 flex-wrap gap-2" role="status" aria-live="polite">
      <span className="crm-badge is-approved">{outcome ? "Diproses" : "Siap"} {result.ringkas.siap}</span>
      <span className="crm-badge is-neutral">Sudah sesuai {result.ringkas.lewat}</span>
      <span className="crm-badge is-rejected">Ditolak {result.ringkas.tolak}</span>
      <span className="crm-badge is-neutral">Sengaja dikosongkan {result.dilewati}</span>
    </div>
  );
}

export function PemetaanImportWorkbench() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PemetaanResult | null>(null);
  const [outcome, setOutcome] = useState<PemetaanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [hasApplied, setHasApplied] = useState(false);

  function resetResults() {
    setPreview(null);
    setOutcome(null);
    setHasApplied(false);
    setError(null);
  }

  function validateFile(selected: File | null) {
    if (!selected) return "Pilih berkas Excel terlebih dahulu.";
    const sizeError = clientFileSizeError(
      selected,
      MAX_CLIENT_UPLOAD_BYTES,
      "Ukuran berkas maksimal 5 MB.",
    );
    if (sizeError) return sizeError;
    if (!/\.xlsx$/i.test(selected.name)) {
      return "Berkas harus .xlsx. Format .xls lama tidak didukung — simpan ulang sebagai .xlsx.";
    }
    return "";
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    resetResults();
    setError(validateFile(selected) || null);
  }

  function previewFile() {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    setError(null);
    setOutcome(null);
    setHasApplied(false);
    startTransition(async () => {
      try {
        const result = await previewPemetaanAction(formData);
        if (result.ok) {
          setPreview(result.data);
        } else {
          setPreview(null);
          setError(result.error);
        }
      } catch {
        setPreview(null);
        setError("Pratinjau tidak dapat diproses. Periksa berkas lalu coba lagi.");
      }
    });
  }

  function applyFile() {
    if (!file || !preview || preview.ringkas.siap === 0 || hasApplied) return;

    const formData = new FormData();
    formData.append("file", file);
    setError(null);
    startTransition(async () => {
      try {
        const result = await applyPemetaanAction(formData);
        if (result.ok) {
          setOutcome(result.data);
          setHasApplied(true);
        } else {
          setError(result.error);
        }
      } catch {
        setError("Penerapan tidak dapat diselesaikan. Tidak ada perubahan yang diasumsikan berhasil.");
      }
    });
  }

  const canApply = Boolean(file && preview && preview.ringkas.siap > 0 && !hasApplied && !isPending);

  return (
    <div className="space-y-6">
      <section className="card min-w-0 p-5 sm:p-6" aria-labelledby="pemetaan-file-title">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 id="pemetaan-file-title" className="text-lg font-semibold text-slate-700">Berkas sumber</h2>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">
              Unggah workbook keputusan pemetaan yang sudah diisi tim. Sistem akan memeriksa semua keputusan sebelum perubahan jaringan diterapkan.
            </p>
          </div>
          <span className="crm-badge is-neutral shrink-0">FTTH Manage</span>
        </div>

        <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="min-w-0">
            <label className="label" htmlFor="pemetaan-import-file">Berkas Excel</label>
            <input
              id="pemetaan-import-file"
              name="file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleFileChange}
              className="block min-w-0 max-w-full text-xs text-slate-500"
              disabled={isPending}
            />
            <p className="mt-2 truncate text-[11px] text-slate-400" title={file?.name ?? "Belum ada berkas"}>
              {file?.name ?? "Belum ada berkas dipilih"}
            </p>
            <p className="mt-1 text-[11px] text-slate-400">Format .xlsx, maksimal 5 MB.</p>
          </div>
          <button type="button" className="btn-primary justify-center whitespace-nowrap" onClick={previewFile} disabled={!file || isPending}>
            {isPending ? "Memproses…" : "Pratinjau"}
          </button>
        </div>

        {error && <div className="crm-flash is-error mt-4" role="alert" aria-live="polite">{error}</div>}
      </section>

      {preview && (
        <section className="card min-w-0 p-5 sm:p-6" aria-labelledby="pemetaan-preview-title">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 id="pemetaan-preview-title" className="text-lg font-semibold text-slate-700">Pratinjau keputusan</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Semua baris tetap ditampilkan. Keputusan yang ditolak atau bermasalah tidak disembunyikan.
              </p>
            </div>
            <ResultSummary result={preview} />
          </div>

          {preview.masalah.length > 0 && (
            <div className="mt-5 rounded-lg border border-rose-100 bg-rose-50 p-4" role="alert">
              <h3 className="text-sm font-semibold text-rose-900">Masalah pembacaan berkas</h3>
              <p className="mt-1 text-xs leading-relaxed text-rose-800">
                Baris berikut tidak dapat dipahami dan tidak akan diterapkan.
              </p>
              <ul className="mt-3 space-y-2 text-xs leading-relaxed text-rose-800">
                {preview.masalah.map((issue, index) => (
                  <li key={`${issue.lembar}-${issue.baris}-${index}`} className="break-words">
                    <span className="font-semibold">{issue.lembar}, baris {issue.baris}:</span> {issue.pesan}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5">
            <DecisionTable result={preview} />
          </div>

          <div className="mt-5 flex min-w-0 flex-col gap-3 rounded-lg border border-slate-100 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 text-xs leading-relaxed text-slate-600">
              Berkas asli akan diunggah ulang saat penerapan. Hanya baris SIAP yang diproses; LEWAT dan TOLAK tidak diubah.
            </p>
            <button type="button" className="btn-primary shrink-0 justify-center" onClick={applyFile} disabled={!canApply}>
              {isPending ? "Menerapkan…" : preview.ringkas.siap > 0 ? "Terapkan yang siap" : "Tidak ada yang siap"}
            </button>
          </div>
        </section>
      )}

      {outcome && (
        <section className="card min-w-0 p-5 sm:p-6" aria-labelledby="pemetaan-result-title">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 id="pemetaan-result-title" className="text-lg font-semibold text-slate-700">Hasil penerapan</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Keputusan SIAP sudah diproses. Baris LEWAT, TOLAK, dan masalah pembacaan tetap tidak disentuh.
              </p>
            </div>
            <ResultSummary result={outcome} outcome />
          </div>
          {outcome.masalah.length > 0 && (
            <div className="mt-5 rounded-lg border border-amber-100 bg-amber-50 p-4" role="status">
              <p className="text-xs leading-relaxed text-amber-900">
                {outcome.masalah.length} masalah pembacaan tetap perlu diperbaiki pada workbook sumber.
              </p>
            </div>
          )}
          <div className="mt-5">
            <DecisionTable result={outcome} />
          </div>
        </section>
      )}
    </div>
  );
}
