"use client";

import { useMemo, useState, type FormEvent } from "react";

type FormAction = (formData: FormData) => Promise<void>;

export type InspectionChecklistItem = readonly [string, string];

export function RecoveryInspectionForm({
  action,
  recoveryId,
  itemId,
  checklist,
  decisions,
  statusLabel,
  origin,
}: {
  action: FormAction;
  recoveryId: string;
  itemId: string;
  checklist: ReadonlyArray<InspectionChecklistItem>;
  decisions: readonly string[];
  statusLabel: (value: string) => string;
  origin?: "portal" | "backoffice";
}) {
  const [answers, setAnswers] = useState<Record<string, "on" | "off">>({});
  const [decision, setDecision] = useState("LAYAK_DIGUNAKAN");
  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);
  const complete = answeredCount === checklist.length;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!complete) event.preventDefault();
  }

  return (
    <form action={action} onSubmit={handleSubmit} className="mt-3 space-y-4">
      <input type="hidden" name="recoveryId" value={recoveryId} />
      <input type="hidden" name="itemId" value={itemId} />
      {origin && <input type="hidden" name="origin" value={origin} />}
      <div className="grid gap-3 sm:grid-cols-2">
        {checklist.map(([key, label]) => {
          const value = answers[key];
          return (
            <fieldset key={key} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
              <legend className="mb-2 text-sm font-medium text-slate-700">{label}</legend>
              <div className="flex flex-wrap gap-2">
                {(["on", "off"] as const).map((answer) => (
                  <label key={answer} className={`recovery-choice ${value === answer ? "is-selected" : ""}`}>
                    <input
                      type="radio"
                      name={`chk_${key}`}
                      value={answer}
                      checked={value === answer}
                      onChange={() => setAnswers((current) => ({ ...current, [key]: answer }))}
                      required
                    />
                    <span>{answer === "on" ? "Ya" : "Tidak"}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>
      <p className="text-xs text-slate-500" role="status">
        {complete ? "Semua butir sudah dijawab." : `Jawab semua butir terlebih dahulu (${answeredCount}/${checklist.length}).`}
      </p>
      <select name="decision" className="input" value={decision} onChange={(event) => setDecision(event.target.value)}>
        {decisions.map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}
      </select>
      <textarea name="note" rows={2} className="input" placeholder="Catatan inspeksi (wajib)" required />
      <p className="text-xs text-slate-500">
        Hanya keputusan <strong>Layak Digunakan</strong> yang mengembalikan barang ke stok tersedia, dan selalu sebagai barang SECOND.
      </p>
      <button type="submit" className="btn-primary w-full justify-center" disabled={!complete}>
        Simpan keputusan
      </button>
    </form>
  );
}
