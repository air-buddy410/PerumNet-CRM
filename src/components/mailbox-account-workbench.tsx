"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui";
import { USER_LEVEL_LABELS } from "@/lib/constants";
import type { AccountCandidate, CandidateList, NewAccountInput } from "@/lib/account-provision-service";
import { createAccountsAction, listAccountCandidatesAction } from "@/app/(app)/it/mailserver/actions";

type CandidateDraft = {
  selected: boolean;
  name: string;
  username: string;
  level: string;
  divisionId: string;
  employeeId: string;
  roleIds: string[];
};

function initialDraft(candidate: AccountCandidate): CandidateDraft {
  return {
    selected: candidate.suggestedSelected,
    name: candidate.suggestedName,
    username: candidate.username,
    level: "",
    divisionId: candidate.suggestedDivisionId ?? "",
    employeeId: candidate.employee?.id ?? "",
    roleIds: [],
  };
}

export function MailboxAccountWorkbench() {
  const [data, setData] = useState<CandidateList | null>(null);
  const [drafts, setDrafts] = useState<Record<string, CandidateDraft>>({});
  const [created, setCreated] = useState<{ email: string; username: string; linkedEmployeeNo: string | null }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function loadCandidates() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await listAccountCandidatesAction();
        if (!result.ok) {
          setData(null);
          setError(result.error);
          return;
        }
        setData(result.data);
        setDrafts(Object.fromEntries(result.data.candidates.map((candidate) => [candidate.email, initialDraft(candidate)])));
      } catch {
        setData(null);
        setError("Daftar mailbox belum dapat dibaca. Coba muat ulang halaman.");
      }
    });
  }

  useEffect(() => {
    loadCandidates();
    // Hanya dijalankan saat halaman pertama kali dibuka.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedCount = useMemo(
    () => Object.values(drafts).filter((draft) => draft.selected).length,
    [drafts],
  );

  function updateDraft(email: string, patch: Partial<CandidateDraft>) {
    setDrafts((current) => ({ ...current, [email]: { ...current[email], ...patch } }));
  }

  function toggleRole(email: string, roleId: string) {
    const draft = drafts[email];
    if (!draft) return;
    const roleIds = draft.roleIds.includes(roleId)
      ? draft.roleIds.filter((id) => id !== roleId)
      : [...draft.roleIds, roleId];
    updateDraft(email, { roleIds });
  }

  function createSelected() {
    if (!data) return;
    const inputs: NewAccountInput[] = data.candidates
      .filter((candidate) => drafts[candidate.email]?.selected)
      .map((candidate) => {
        const draft = drafts[candidate.email];
        return {
          email: candidate.email,
          name: draft.name,
          username: draft.username,
          level: draft.level,
          divisionId: draft.divisionId || null,
          roleIds: draft.roleIds,
          employeeId: draft.employeeId || null,
        };
      });

    if (!inputs.length) {
      setError("Centang setidaknya satu mailbox.");
      return;
    }
    const incomplete = inputs.find((input) => !input.level || input.roleIds.length === 0);
    if (incomplete) {
      setError(`${incomplete.email}: pilih level dan minimal satu role sebelum membuat akun.`);
      return;
    }

    setError(null);
    setCreated([]);
    startTransition(async () => {
      try {
        const result = await createAccountsAction(inputs);
        if (result.ok) {
          setCreated(result.data.created);
          setData((current) => current ? {
            ...current,
            candidates: current.candidates.filter((candidate) => !inputs.some((input) => input.email === candidate.email)),
          } : current);
        } else {
          setError(result.error);
        }
      } catch {
        setError("Akun belum dapat dibuat. Periksa kembali pilihan lalu coba lagi.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="card min-w-0 p-5 sm:p-6" aria-labelledby="mailbox-account-overview-title">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 id="mailbox-account-overview-title" className="text-lg font-semibold text-slate-700">Kandidat akun dari mailbox</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
              Mailbox hanya menjadi usulan. IT tetap menentukan siapa yang dibuat, level, divisi, dan role-nya.
            </p>
          </div>
          {data && (
            <div className="flex flex-wrap gap-2">
              <span className="crm-badge is-neutral">Sudah punya akun {data.alreadyHaveAccount}</span>
              <span className="crm-badge is-pending">Dipilih {selectedCount}</span>
            </div>
          )}
        </div>
        <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
          Password tidak ditampilkan dan tidak dikirim ke browser. Akun dibuat dengan kredensial acak sesuai aturan server.
        </div>
        {error && <div className="crm-flash is-error mt-4" role="alert">{error}</div>}
        {!data && !error && <p className="mt-5 text-sm text-slate-500">Memuat daftar mailbox…</p>}
        {!data && error && (
          <button type="button" className="btn-secondary mt-4" onClick={loadCandidates} disabled={isPending}>
            Coba lagi
          </button>
        )}
      </section>

      {data && data.candidates.length === 0 && (
        <section className="card p-6">
          <p className="text-sm text-slate-500">Semua mailbox yang terlihat sudah memiliki akun CRM atau belum ada kandidat baru.</p>
        </section>
      )}

      {data && data.candidates.length > 0 && (
        <section className="card min-w-0 p-5 sm:p-6" aria-labelledby="mailbox-account-list-title">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 id="mailbox-account-list-title" className="text-lg font-semibold text-slate-700">Tinjau kandidat</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">Alamat fungsi tetap ditampilkan dan tidak otomatis disembunyikan.</p>
            </div>
            <button type="button" className="btn-primary shrink-0 justify-center" onClick={createSelected} disabled={selectedCount === 0 || isPending}>
              {isPending ? "Membuat akun…" : `Buat ${selectedCount} akun`}
            </button>
          </div>

          <div className="mt-5 grid min-w-0 gap-4">
            {data.candidates.map((candidate) => {
              const draft = drafts[candidate.email] ?? initialDraft(candidate);
              return (
                <article key={candidate.email} className={`min-w-0 rounded-lg border p-4 ${draft.selected ? "border-[#9bd8d0] bg-[#f7fcfb]" : "border-slate-100 bg-slate-50/50"}`}>
                  <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 shrink-0 accent-[#04a99f]"
                        checked={draft.selected}
                        onChange={(event) => updateDraft(candidate.email, { selected: event.target.checked })}
                        aria-label={`Pilih ${candidate.email}`}
                      />
                      <div className="min-w-0">
                        <p className="break-all text-sm font-semibold text-slate-700">{candidate.email}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {candidate.employee ? `Pegawai cocok: ${candidate.employee.fullName} (${candidate.employee.employeeNo})` : "Tidak ada pegawai yang cocok persis"}
                        </p>
                        {candidate.sharedReason && (
                          <p className="mt-2 break-words text-xs text-amber-700">Alamat fungsi: {candidate.sharedReason}</p>
                        )}
                      </div>
                    </div>
                    <Badge value={candidate.likelyShared ? "WARNING" : "ACTIVE"} label={candidate.likelyShared ? "Perlu tinjauan" : "Usulan personal"} />
                  </div>

                  <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="min-w-0">
                      <label className="label" htmlFor={`account-name-${candidate.email}`}>Nama</label>
                      <input id={`account-name-${candidate.email}`} className="input" value={draft.name} onChange={(event) => updateDraft(candidate.email, { name: event.target.value })} disabled={!draft.selected || isPending} />
                    </div>
                    <div className="min-w-0">
                      <label className="label" htmlFor={`account-username-${candidate.email}`}>Username</label>
                      <input id={`account-username-${candidate.email}`} className="input" value={draft.username} onChange={(event) => updateDraft(candidate.email, { username: event.target.value })} disabled={!draft.selected || isPending} />
                    </div>
                    <div className="min-w-0">
                      <label className="label" htmlFor={`account-level-${candidate.email}`}>Level</label>
                      <select id={`account-level-${candidate.email}`} className="input" value={draft.level} onChange={(event) => updateDraft(candidate.email, { level: event.target.value })} disabled={!draft.selected || isPending}>
                        <option value="">Pilih level</option>
                        {Object.entries(USER_LEVEL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                    <div className="min-w-0">
                      <label className="label" htmlFor={`account-division-${candidate.email}`}>Divisi</label>
                      <select id={`account-division-${candidate.email}`} className="input" value={draft.divisionId} onChange={(event) => updateDraft(candidate.email, { divisionId: event.target.value })} disabled={!draft.selected || isPending}>
                        <option value="">Tanpa divisi</option>
                        {data.divisions.map((division) => <option key={division.id} value={division.id}>{division.name} ({division.code})</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="min-w-0">
                      <label className="label" htmlFor={`account-employee-${candidate.email}`}>Pegawai terkait</label>
                      <select id={`account-employee-${candidate.email}`} className="input" value={draft.employeeId} onChange={(event) => updateDraft(candidate.email, { employeeId: event.target.value })} disabled={!draft.selected || isPending}>
                        <option value="">Tidak ditautkan</option>
                        {candidate.employee && <option value={candidate.employee.id}>{candidate.employee.fullName} · {candidate.employee.employeeNo}</option>}
                      </select>
                    </div>
                    <fieldset className="min-w-0">
                      <legend className="label">Role (wajib pilih)</legend>
                      <div className="flex min-w-0 flex-wrap gap-2">
                        {data.roles.map((role) => (
                          <label key={role.id} className={`recovery-choice ${draft.roleIds.includes(role.id) ? "is-selected" : ""}`}>
                            <input type="checkbox" checked={draft.roleIds.includes(role.id)} onChange={() => toggleRole(candidate.email, role.id)} disabled={!draft.selected || isPending} />
                            <span>{role.name}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {created.length > 0 && (
        <section className="card min-w-0 p-5 sm:p-6" aria-labelledby="mailbox-account-result-title">
          <h2 id="mailbox-account-result-title" className="text-lg font-semibold text-slate-700">Akun berhasil dibuat</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            {created.map((account) => (
              <li key={account.email} className="min-w-0 break-words rounded-lg border border-emerald-100 bg-emerald-50 p-3">
                <strong>{account.email}</strong> · @{account.username}
                {account.linkedEmployeeNo ? ` · pegawai ${account.linkedEmployeeNo}` : " · belum ditautkan ke pegawai"}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
