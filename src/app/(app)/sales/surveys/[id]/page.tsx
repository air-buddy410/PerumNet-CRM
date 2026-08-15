import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  PERMISSIONS,
  FEASIBILITY,
  statusLabel,
  formatDateTime,
  formatRupiah,
} from "@/lib/constants";
import { PageHeader, Flash, BackLink, Badge, EmptyState } from "@/components/ui";
import { ClientFileUploadGuard } from "@/components/client-file-upload-guard";
import {
  scheduleSurveyAction,
  completeSurveyAction,
  cancelSurveyAction,
  uploadSurveyPhotoAction,
} from "../actions";

export const metadata = { title: "Detail Survey" };

export default async function SurveyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.SURVEYS_VIEW);
  const { id } = await params;
  const sp = await searchParams;

  const [survey, technicians, attachments] = await Promise.all([
    db.survey.findUnique({
      where: { id },
      include: {
        lead: true,
        customer: true,
        package: true,
        technician: true,
        createdBy: true,
      },
    }),
    db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    db.attachment.findMany({
      where: { entityType: "Survey", entityId: id },
      include: { uploadedBy: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  if (!survey) notFound();

  const canManage = user.permissions.has(PERMISSIONS.SURVEYS_MANAGE);
  const canExecute = user.permissions.has(PERMISSIONS.SURVEYS_EXECUTE);
  const isOpen = !["COMPLETED", "CANCELLED"].includes(survey.status);

  return (
    <div className="max-w-4xl">
      <BackLink href="/sales/surveys" label="Kembali ke daftar survey" />
      <PageHeader
        title={survey.surveyNumber}
        subtitle={
          survey.lead
            ? `Lead: ${survey.lead.leadNumber} — ${survey.lead.name}`
            : survey.customer
              ? `Customer: ${survey.customer.customerNumber} — ${survey.customer.name}`
              : ""
        }
        action={<Badge value={survey.status} label={statusLabel(survey.status)} />}
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <div className="card p-6">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-slate-400">Alamat</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-sm">{survey.address}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Kontak</dt>
                <dd className="mt-0.5 text-sm">
                  {survey.contactName ?? "-"}
                  {survey.contactPhone ? ` · ${survey.contactPhone}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Paket / Bandwidth</dt>
                <dd className="mt-0.5 text-sm">
                  {survey.package?.name ?? "-"}
                  {survey.bandwidthMbps ? ` · ${survey.bandwidthMbps} Mbps` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Jadwal</dt>
                <dd className="mt-0.5 text-sm">
                  {survey.scheduledAt ? formatDateTime(survey.scheduledAt) : "Belum dijadwalkan"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Teknisi</dt>
                <dd className="mt-0.5 text-sm">{survey.technician?.name ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Diajukan</dt>
                <dd className="mt-0.5 text-sm">
                  {survey.createdBy.name} · {formatDateTime(survey.createdAt)}
                </dd>
              </div>
            </dl>
          </div>

          {survey.status === "COMPLETED" && (
            <div className="card p-6">
              <h2 className="mb-4 font-medium">Hasil Survey</h2>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Feasibility</dt>
                  <dd className="mt-0.5">
                    <Badge value={survey.feasibility ?? ""} label={statusLabel(survey.feasibility)} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Titik Jaringan Terdekat</dt>
                  <dd className="mt-0.5 text-sm">{survey.nearestNode ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Estimasi Kabel</dt>
                  <dd className="mt-0.5 text-sm">
                    {survey.estCableMeters != null ? `${survey.estCableMeters} m` : "-"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Estimasi Biaya</dt>
                  <dd className="mt-0.5 text-sm">{formatRupiah(survey.estCost)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Signal / Optical</dt>
                  <dd className="mt-0.5 text-sm">
                    {survey.signalLevel ?? "-"} / {survey.opticalPower ?? "-"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">Material</dt>
                  <dd className="mt-0.5 text-sm">{survey.estMaterials ?? "-"}</dd>
                </div>
                {survey.resultNotes && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Catatan</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap text-sm">{survey.resultNotes}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {isOpen && canExecute && (
            <div className="card p-6">
              <h2 className="mb-4 font-medium">Isi Hasil Survey</h2>
              <form action={completeSurveyAction} className="space-y-4">
                <input type="hidden" name="surveyId" value={survey.id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="nearestNode">Titik Jaringan Terdekat</label>
                    <input
                      id="nearestNode"
                      name="nearestNode"
                      className="input"
                      placeholder="mis. ODP-UTARA-03"
                      defaultValue={survey.nearestNode ?? ""}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="estCableMeters">Estimasi Kabel (meter)</label>
                    <input
                      id="estCableMeters"
                      name="estCableMeters"
                      type="number"
                      min={0}
                      className="input"
                      defaultValue={survey.estCableMeters ?? ""}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="estCost">Estimasi Biaya (Rp)</label>
                    <input
                      id="estCost"
                      name="estCost"
                      inputMode="numeric"
                      className="input"
                      defaultValue={survey.estCost != null ? String(survey.estCost) : ""}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="estMaterials">Estimasi Material</label>
                    <input
                      id="estMaterials"
                      name="estMaterials"
                      className="input"
                      placeholder="mis. drop core 150m, 2 klem"
                      defaultValue={survey.estMaterials ?? ""}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="signalLevel">Signal Level (wireless)</label>
                    <input
                      id="signalLevel"
                      name="signalLevel"
                      className="input"
                      defaultValue={survey.signalLevel ?? ""}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="opticalPower">Optical Power (fiber)</label>
                    <input
                      id="opticalPower"
                      name="opticalPower"
                      className="input"
                      placeholder="mis. -21 dBm"
                      defaultValue={survey.opticalPower ?? ""}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label" htmlFor="feasibility">Hasil Feasibility</label>
                    <select id="feasibility" name="feasibility" className="input" required defaultValue="">
                      <option value="" disabled>— pilih hasil —</option>
                      {FEASIBILITY.map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label" htmlFor="resultNotes">Catatan Hasil</label>
                    <textarea id="resultNotes" name="resultNotes" rows={2} className="input" />
                  </div>
                </div>
                <button type="submit" className="btn-primary">Simpan Hasil (Selesai)</button>
              </form>
            </div>
          )}

          <div className="card">
            <div className="border-b border-slate-100 px-5 py-4 font-medium">
              Foto & Bukti ({attachments.length})
            </div>
            {(canExecute || canManage) && isOpen !== null && (
              <ClientFileUploadGuard
                action={uploadSurveyPhotoAction}
                className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4"
              >
                <input type="hidden" name="surveyId" value={survey.id} />
                <input type="file" name="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="text-sm" required />
                <button type="submit" className="btn-secondary">Unggah</button>
                <span className="text-xs text-slate-400">JPG/PNG/WebP/PDF, maks 5MB</span>
              </ClientFileUploadGuard>
            )}
            {attachments.length === 0 ? (
              <EmptyState message="Belum ada foto/bukti." />
            ) : (
              <div className="grid gap-4 p-5 sm:grid-cols-3">
                {attachments.map((a) => (
                  <a
                    key={a.id}
                    href={`/api/files/${a.id}`}
                    target="_blank"
                    className="block"
                  >
                    {a.mimeType.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/files/${a.id}`}
                        alt={a.filename}
                        className="h-32 w-full rounded-lg border border-slate-200 object-cover"
                      />
                    ) : (
                      <div className="flex h-32 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-500">
                        {a.filename}
                      </div>
                    )}
                    <div className="mt-1 truncate text-xs text-slate-500">
                      {a.filename} · {a.uploadedBy.name}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {isOpen && canManage && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Jadwalkan & Tugaskan</h2>
              <form action={scheduleSurveyAction} className="space-y-3">
                <input type="hidden" name="surveyId" value={survey.id} />
                <div>
                  <label className="label" htmlFor="scheduledAt">Jadwal</label>
                  <input
                    id="scheduledAt"
                    name="scheduledAt"
                    type="datetime-local"
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor="technicianId">Teknisi</label>
                  <select
                    id="technicianId"
                    name="technicianId"
                    className="input"
                    defaultValue={survey.technicianId ?? ""}
                    required
                  >
                    <option value="" disabled>— pilih teknisi —</option>
                    {technicians.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="btn-primary w-full justify-center">
                  Jadwalkan
                </button>
              </form>
            </div>
          )}

          {isOpen && canManage && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Batalkan Survey</h2>
              <form action={cancelSurveyAction} className="space-y-3">
                <input type="hidden" name="surveyId" value={survey.id} />
                <textarea
                  name="reason"
                  rows={2}
                  className="input"
                  placeholder="Alasan pembatalan"
                />
                <button type="submit" className="btn-danger w-full justify-center">
                  Batalkan
                </button>
              </form>
            </div>
          )}

          {survey.lead && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-medium">Terkait</h2>
              <Link
                href={`/sales/leads/${survey.lead.id}`}
                className="text-sm text-brand-600 hover:underline"
              >
                Lead {survey.lead.leadNumber}
              </Link>
              {survey.status === "COMPLETED" && survey.feasibility !== "NOT_FEASIBLE" && (
                <Link
                  href={`/sales/quotations/new?leadId=${survey.lead.id}`}
                  className="btn-secondary mt-3 w-full justify-center"
                >
                  Buat Quotation
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
