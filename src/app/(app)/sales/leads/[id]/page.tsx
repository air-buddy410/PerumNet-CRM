import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  LEAD_STATUSES,
  LEAD_STATUSES_NEED_REASON,
  ACTIVITY_TYPES,
  statusLabel,
  formatDateTime,
} from "@/lib/constants";
import { PageHeader, Flash, BackLink, Badge, EmptyState } from "@/components/ui";
import {
  assignLeadAction,
  changeLeadStatusAction,
  logActivityAction,
  createOpportunityAction,
  convertLeadAction,
} from "../actions";

export const metadata = { title: "Detail Lead" };

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.LEADS_VIEW);
  const { id } = await params;
  const sp = await searchParams;

  const [lead, salesUsers] = await Promise.all([
    db.lead.findUnique({
      where: { id },
      include: {
        salesOwner: true,
        createdBy: true,
        campaign: true,
        interestPackage: true,
        opportunity: true,
        customer: true,
        surveys: { orderBy: { createdAt: "desc" } },
        quotations: { orderBy: [{ quotationNumber: "asc" }, { version: "asc" }] },
        activities: {
          include: { doneBy: true },
          orderBy: { activityAt: "desc" },
        },
      },
    }),
    db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);
  if (!lead) notFound();

  const canEdit = user.permissions.has(PERMISSIONS.LEADS_EDIT);
  const canAssign = user.permissions.has(PERMISSIONS.LEADS_ASSIGN);
  const canConvert = user.permissions.has(PERMISSIONS.CUSTOMERS_CREATE);
  const canOpp = user.permissions.has(PERMISSIONS.OPPORTUNITIES_MANAGE);
  const isFinal = ["CONVERTED", "LOST"].includes(lead.status);
  const acceptedQuotation = lead.quotations.find((q) => q.status === "ACCEPTED");

  return (
    <div className="max-w-4xl">
      <BackLink href="/sales/leads" label="Kembali ke daftar lead" />
      <PageHeader
        title={`${lead.leadNumber} — ${lead.name}`}
        subtitle={[
          lead.company,
          lead.campaign ? `Campaign: ${lead.campaign.name}` : statusLabel(lead.source),
        ]
          .filter(Boolean)
          .join(" · ")}
        action={<Badge value={lead.status} label={statusLabel(lead.status)} />}
      />
      <Flash ok={sp.ok} error={sp.error} />

      {!lead.salesOwnerId && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Lead ini belum memiliki Sales owner. Status tidak dapat maju sampai owner ditentukan
          (business rule 14).
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-6">
          <div className="card p-6">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Telepon</dt>
                <dd className="mt-0.5 text-sm">{lead.phone}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Email</dt>
                <dd className="mt-0.5 text-sm">{lead.email ?? "-"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-slate-400">Alamat</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-sm">{lead.address ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Jenis Pelanggan</dt>
                <dd className="mt-0.5 text-sm">{statusLabel(lead.customerType)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Paket Diminati</dt>
                <dd className="mt-0.5 text-sm">{lead.interestPackage?.name ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Sales Owner</dt>
                <dd className="mt-0.5 text-sm">{lead.salesOwner?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Dibuat</dt>
                <dd className="mt-0.5 text-sm">
                  {lead.createdBy.name} · {formatDateTime(lead.createdAt)}
                </dd>
              </div>
              {lead.notes && (
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Catatan</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-sm">{lead.notes}</dd>
                </div>
              )}
            </dl>
          </div>

          {canEdit && !isFinal && (
            <div className="card p-6">
              <h2 className="mb-4 font-medium">Catat Aktivitas</h2>
              <form action={logActivityAction} className="space-y-3">
                <input type="hidden" name="leadId" value={lead.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="type">Jenis</label>
                    <select id="type" name="type" className="input" defaultValue="PHONE_CALL">
                      {ACTIVITY_TYPES.map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="nextFollowUpAt">Follow-up Berikutnya</label>
                    <input
                      id="nextFollowUpAt"
                      name="nextFollowUpAt"
                      type="datetime-local"
                      className="input"
                    />
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="note">Catatan</label>
                  <textarea id="note" name="note" rows={2} className="input" required />
                </div>
                <button type="submit" className="btn-primary">Simpan Aktivitas</button>
              </form>
            </div>
          )}

          <div className="card">
            <div className="border-b border-slate-100 px-5 py-4 font-medium">
              Riwayat Aktivitas ({lead.activities.length})
            </div>
            {lead.activities.length === 0 ? (
              <EmptyState message="Belum ada aktivitas tercatat." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {lead.activities.map((a) => (
                  <li key={a.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium">
                        {statusLabel(a.type) !== a.type
                          ? statusLabel(a.type)
                          : ACTIVITY_TYPES.find(([v]) => v === a.type)?.[1] ?? a.type}
                      </span>
                      <span className="text-xs text-slate-400">{formatDateTime(a.activityAt)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{a.note}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      oleh {a.doneBy.name}
                      {a.nextFollowUpAt
                        ? ` · follow-up: ${formatDateTime(a.nextFollowUpAt)}`
                        : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {canAssign && !isFinal && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Sales Owner</h2>
              <form action={assignLeadAction} className="space-y-3">
                <input type="hidden" name="leadId" value={lead.id} />
                <select
                  name="salesOwnerId"
                  className="input"
                  defaultValue={lead.salesOwnerId ?? ""}
                >
                  <option value="">— pilih —</option>
                  {salesUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
                <button type="submit" className="btn-secondary w-full justify-center">
                  Assign
                </button>
              </form>
            </div>
          )}

          {canEdit && !isFinal && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Ubah Status</h2>
              <form action={changeLeadStatusAction} className="space-y-3">
                <input type="hidden" name="leadId" value={lead.id} />
                <select name="status" className="input" defaultValue={lead.status}>
                  {LEAD_STATUSES.filter((s) => s !== "CONVERTED").map((s) => (
                    <option key={s} value={s}>{statusLabel(s)}</option>
                  ))}
                </select>
                <div>
                  <label className="label" htmlFor="reason">Alasan</label>
                  <textarea id="reason" name="reason" rows={2} className="input" />
                  <p className="mt-1 text-xs text-slate-500">
                    Wajib untuk status{" "}
                    {LEAD_STATUSES_NEED_REASON.map((s) => statusLabel(s)).join(" dan ")}.
                  </p>
                </div>
                <button type="submit" className="btn-secondary w-full justify-center">
                  Simpan Status
                </button>
              </form>
            </div>
          )}

          <div className="card p-5">
            <h2 className="mb-3 text-sm font-medium">Pipeline</h2>
            {lead.opportunity ? (
              <p className="text-sm">
                {lead.opportunity.oppNumber}
                <span className="mt-1 block">
                  <Badge
                    value={lead.opportunity.stage}
                    label={statusLabel(lead.opportunity.stage)}
                  />
                </span>
              </p>
            ) : canOpp && !isFinal ? (
              <form action={createOpportunityAction}>
                <input type="hidden" name="leadId" value={lead.id} />
                <button type="submit" className="btn-secondary w-full justify-center">
                  Buat Opportunity
                </button>
              </form>
            ) : (
              <p className="text-sm text-slate-400">Belum ada opportunity.</p>
            )}
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-sm font-medium">Konversi ke Customer</h2>
            {lead.customer ? (
              <p className="text-sm text-emerald-700">
                Sudah dikonversi ({lead.customer.customerNumber}).
              </p>
            ) : (
              <>
                <p className="mb-3 text-xs text-slate-500">
                  Memerlukan quotation berstatus Diterima (PRD §11).
                  {acceptedQuotation
                    ? ` Tersedia: ${acceptedQuotation.quotationNumber} v${acceptedQuotation.version}.`
                    : " Saat ini belum ada."}
                </p>
                {canConvert && !isFinal && (
                  <form action={convertLeadAction}>
                    <input type="hidden" name="leadId" value={lead.id} />
                    <button type="submit" className="btn-primary w-full justify-center">
                      Konversi
                    </button>
                  </form>
                )}
              </>
            )}
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-sm font-medium">Survey ({lead.surveys.length})</h2>
            {lead.surveys.length > 0 && (
              <ul className="mb-3 space-y-1">
                {lead.surveys.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link
                      href={`/sales/surveys/${s.id}`}
                      className="text-brand-600 hover:underline"
                    >
                      {s.surveyNumber}
                    </Link>
                    <Badge value={s.status} label={statusLabel(s.status)} />
                  </li>
                ))}
              </ul>
            )}
            {canEdit && !isFinal && (
              <Link
                href={`/sales/surveys/new?leadId=${lead.id}`}
                className="btn-secondary w-full justify-center"
              >
                Ajukan Survey
              </Link>
            )}
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-sm font-medium">
              Quotation ({lead.quotations.length})
            </h2>
            {lead.quotations.length > 0 && (
              <ul className="mb-3 space-y-1">
                {lead.quotations.map((q) => (
                  <li key={q.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link
                      href={`/sales/quotations/${q.id}`}
                      className="text-brand-600 hover:underline"
                    >
                      {q.quotationNumber} v{q.version}
                    </Link>
                    <Badge value={q.status} label={statusLabel(q.status)} />
                  </li>
                ))}
              </ul>
            )}
            {canEdit && !isFinal && (
              <Link
                href={`/sales/quotations/new?leadId=${lead.id}`}
                className="btn-secondary w-full justify-center"
              >
                Buat Quotation
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
