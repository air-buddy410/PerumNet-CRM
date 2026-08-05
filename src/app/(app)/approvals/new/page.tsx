import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { PageHeader, Flash, BackLink } from "@/components/ui";
import { submitRequestAction } from "../actions";
import { ModuleSelect } from "./module-select";

export const metadata = { title: "Ajukan Approval" };

export default async function NewApprovalPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePermission(PERMISSIONS.APPROVALS_CREATE);
  const sp = await searchParams;

  return (
    <div className="max-w-2xl">
      <BackLink href="/approvals" label="Kembali ke daftar" />
      <PageHeader
        title="Ajukan Approval Request"
        subtitle="Request akan diarahkan ke approver sesuai approval matrix (modul, subtipe, dan nilai)."
      />
      <Flash error={sp.error} />

      <form action={submitRequestAction} className="card space-y-4 p-6">
        <ModuleSelect />
        <div>
          <label className="label" htmlFor="title">
            Judul
          </label>
          <input id="title" name="title" className="input" required minLength={3} />
        </div>
        <div>
          <label className="label" htmlFor="amount">
            Nilai (Rp) — opsional
          </label>
          <input
            id="amount"
            name="amount"
            className="input"
            inputMode="numeric"
            placeholder="mis. 750000"
          />
          <p className="mt-1 text-xs text-slate-500">
            Nilai menentukan jalur approval untuk modul berbasis nominal (mis. petty cash).
          </p>
        </div>
        <div>
          <label className="label" htmlFor="description">
            Deskripsi / tujuan
          </label>
          <textarea id="description" name="description" rows={4} className="input" />
        </div>
        <button type="submit" className="btn-primary">
          Ajukan
        </button>
      </form>
    </div>
  );
}
