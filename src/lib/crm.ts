import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { submitApprovalRequest } from "@/lib/approval";
import {
  LEAD_STATUSES,
  LEAD_STATUSES_NEED_REASON,
  OPP_STAGES,
  SUBSCRIPTION_TRANSITIONS,
  PERMISSIONS,
  statusLabel,
} from "@/lib/constants";
import type { CurrentUser } from "@/lib/rbac";

// ── Business rules Phase 2 yang ditegakkan di service layer ─────
//  - Lead tidak bisa maju status tanpa Sales owner (rule 14).
//  - Status Lost / Not Interested wajib alasan (rule 15).
//  - Quotation accepted immutable; revisi = versi baru (rule 16, PRD §11).
//  - Diskon quotation > 0 wajib approval sebelum dikirim.
//  - Konversi lead → customer hanya jika ada quotation ACCEPTED (PRD §11).
//  - Sales tidak dapat mengaktifkan subscription (rule 17) — permission
//    subscriptions.activate diperiksa DI SINI, bukan hanya di UI.

type Result<T = undefined> =
  | { ok: true; id: string; data?: T }
  | { ok: false; error: string };

async function nextNumber(prefix: string, count: number): Promise<string> {
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}

function monthPrefix(base: string): string {
  const now = new Date();
  return `${base}-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ── Lead ────────────────────────────────────────────────────────

export async function createLead(
  user: CurrentUser,
  data: {
    name: string;
    phone: string;
    company?: string;
    email?: string;
    address?: string;
    customerType: string;
    source: string;
    campaignId?: string;
    interestPackageId?: string;
    estBandwidthMbps?: number;
    salesOwnerId?: string;
    notes?: string;
  }
): Promise<Result> {
  const prefix = monthPrefix("LD");
  const count = await db.lead.count({
    where: { leadNumber: { startsWith: prefix } },
  });
  const lead = await db.lead.create({
    data: {
      ...data,
      leadNumber: await nextNumber(prefix, count),
      status: data.salesOwnerId ? "ASSIGNED" : "NEW",
      createdById: user.id,
    },
  });
  await logAudit({
    userId: user.id,
    action: "LEAD_CREATE",
    module: "leads",
    entityType: "Lead",
    entityId: lead.id,
    description: `Membuat lead ${lead.leadNumber} (${lead.name})`,
  });
  return { ok: true, id: lead.id };
}

export async function assignLead(
  user: CurrentUser,
  leadId: string,
  salesOwnerId: string
): Promise<Result> {
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) return { ok: false, error: "Lead tidak ditemukan." };
  if (["CONVERTED", "LOST"].includes(lead.status)) {
    return { ok: false, error: "Lead sudah final dan tidak dapat di-assign ulang." };
  }
  const owner = await db.user.findUnique({ where: { id: salesOwnerId } });
  if (!owner || !owner.isActive) {
    return { ok: false, error: "Sales owner tidak valid." };
  }
  await db.lead.update({
    where: { id: leadId },
    data: {
      salesOwnerId,
      status: lead.status === "NEW" ? "ASSIGNED" : lead.status,
    },
  });
  await logAudit({
    userId: user.id,
    action: "LEAD_ASSIGN",
    module: "leads",
    entityType: "Lead",
    entityId: leadId,
    description: `Assign lead ${lead.leadNumber} ke ${owner.name}`,
    metadata: { before: lead.salesOwnerId, after: salesOwnerId },
  });
  return { ok: true, id: leadId };
}

export async function changeLeadStatus(
  user: CurrentUser,
  leadId: string,
  status: string,
  reason?: string
): Promise<Result> {
  if (!LEAD_STATUSES.includes(status as (typeof LEAD_STATUSES)[number])) {
    return { ok: false, error: "Status tidak dikenal." };
  }
  if (status === "CONVERTED") {
    return { ok: false, error: "Gunakan aksi Konversi untuk mengubah lead menjadi customer." };
  }
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) return { ok: false, error: "Lead tidak ditemukan." };
  if (lead.status === "CONVERTED") {
    return { ok: false, error: "Lead sudah terkonversi dan tidak dapat diubah." };
  }
  // Rule 14: tidak ada progres tanpa Sales owner
  if (!lead.salesOwnerId && !["NEW", "LOST", "NOT_INTERESTED"].includes(status)) {
    return { ok: false, error: "Lead belum memiliki Sales owner. Assign terlebih dahulu." };
  }
  // Rule 15: lost / not interested wajib alasan
  if (
    LEAD_STATUSES_NEED_REASON.includes(status as (typeof LEAD_STATUSES_NEED_REASON)[number]) &&
    !reason?.trim()
  ) {
    return { ok: false, error: `Status ${statusLabel(status)} wajib disertai alasan.` };
  }
  await db.lead.update({
    where: { id: leadId },
    data: {
      status,
      notes: reason
        ? `${lead.notes ? lead.notes + "\n" : ""}[${statusLabel(status)}] ${reason}`
        : lead.notes,
    },
  });
  if (["LOST", "NOT_INTERESTED"].includes(status)) {
    const opp = await db.opportunity.findUnique({ where: { leadId } });
    if (opp && !["WON", "LOST"].includes(opp.stage)) {
      await db.opportunity.update({
        where: { id: opp.id },
        data: { stage: "LOST", lostReason: reason, lostAt: new Date() },
      });
    }
  }
  await logAudit({
    userId: user.id,
    action: "LEAD_STATUS_CHANGE",
    module: "leads",
    entityType: "Lead",
    entityId: leadId,
    description: `Lead ${lead.leadNumber}: ${statusLabel(lead.status)} → ${statusLabel(status)}`,
    metadata: { reason },
  });
  return { ok: true, id: leadId };
}

export async function logLeadActivity(
  user: CurrentUser,
  leadId: string,
  data: { type: string; note: string; nextFollowUpAt?: Date | null }
): Promise<Result> {
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) return { ok: false, error: "Lead tidak ditemukan." };
  const activity = await db.leadActivity.create({
    data: {
      leadId,
      type: data.type,
      note: data.note,
      nextFollowUpAt: data.nextFollowUpAt ?? null,
      doneById: user.id,
    },
  });
  if (data.nextFollowUpAt !== undefined) {
    await db.lead.update({
      where: { id: leadId },
      data: { nextFollowUpAt: data.nextFollowUpAt },
    });
  }
  return { ok: true, id: activity.id };
}

// ── Opportunity / Pipeline ──────────────────────────────────────

export async function ensureOpportunity(
  user: CurrentUser,
  leadId: string,
  estMonthlyValue?: bigint
): Promise<Result> {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    include: { opportunity: true, interestPackage: true },
  });
  if (!lead) return { ok: false, error: "Lead tidak ditemukan." };
  if (lead.opportunity) return { ok: true, id: lead.opportunity.id };
  if (!lead.salesOwnerId) {
    return { ok: false, error: "Lead belum memiliki Sales owner." };
  }
  const prefix = monthPrefix("OPP");
  const count = await db.opportunity.count({
    where: { oppNumber: { startsWith: prefix } },
  });
  const opp = await db.opportunity.create({
    data: {
      oppNumber: await nextNumber(prefix, count),
      leadId,
      estMonthlyValue: estMonthlyValue ?? lead.interestPackage?.monthlyPrice ?? null,
      createdById: user.id,
    },
  });
  await logAudit({
    userId: user.id,
    action: "OPP_CREATE",
    module: "opportunities",
    entityType: "Opportunity",
    entityId: opp.id,
    description: `Membuat opportunity ${opp.oppNumber} dari lead ${lead.leadNumber}`,
  });
  return { ok: true, id: opp.id };
}

export async function moveOpportunityStage(
  user: CurrentUser,
  oppId: string,
  stage: string,
  lostReason?: string
): Promise<Result> {
  if (!OPP_STAGES.includes(stage as (typeof OPP_STAGES)[number])) {
    return { ok: false, error: "Stage tidak dikenal." };
  }
  const opp = await db.opportunity.findUnique({
    where: { id: oppId },
    include: { lead: true },
  });
  if (!opp) return { ok: false, error: "Opportunity tidak ditemukan." };
  if (["WON", "LOST"].includes(opp.stage) && !["INSTALLATION_PROCESS", "ACTIVATED"].includes(stage)) {
    if (opp.stage === "LOST") {
      return { ok: false, error: "Opportunity sudah Lost." };
    }
  }
  if (stage === "LOST" && !lostReason?.trim()) {
    return { ok: false, error: "Stage Lost wajib disertai alasan (business rule 15)." };
  }
  if (stage === "WON") {
    const accepted = await db.quotation.findFirst({
      where: { leadId: opp.leadId, status: "ACCEPTED" },
    });
    if (!accepted) {
      return {
        ok: false,
        error: "Stage Won memerlukan quotation berstatus Accepted (PRD §11).",
      };
    }
  }
  await db.opportunity.update({
    where: { id: oppId },
    data: {
      stage,
      lostReason: stage === "LOST" ? lostReason : opp.lostReason,
      lostAt: stage === "LOST" ? new Date() : opp.lostAt,
      wonAt: stage === "WON" && !opp.wonAt ? new Date() : opp.wonAt,
    },
  });
  if (stage === "LOST") {
    await changeLeadStatus(user, opp.leadId, "LOST", lostReason);
  }
  await logAudit({
    userId: user.id,
    action: "OPP_STAGE_CHANGE",
    module: "opportunities",
    entityType: "Opportunity",
    entityId: oppId,
    description: `Opportunity ${opp.oppNumber}: ${statusLabel(opp.stage)} → ${statusLabel(stage)}`,
    metadata: { lostReason },
  });
  return { ok: true, id: oppId };
}

// ── Survey ──────────────────────────────────────────────────────

export async function createSurvey(
  user: CurrentUser,
  data: {
    leadId?: string;
    customerId?: string;
    address: string;
    contactName?: string;
    contactPhone?: string;
    packageId?: string;
    bandwidthMbps?: number;
  }
): Promise<Result> {
  if (!data.leadId && !data.customerId) {
    return { ok: false, error: "Survey harus terhubung ke lead atau customer." };
  }
  const prefix = monthPrefix("SVY");
  const count = await db.survey.count({
    where: { surveyNumber: { startsWith: prefix } },
  });
  const survey = await db.survey.create({
    data: {
      ...data,
      surveyNumber: await nextNumber(prefix, count),
      createdById: user.id,
    },
  });
  if (data.leadId) {
    await changeLeadStatus(user, data.leadId, "SURVEY_REQUIRED");
  }
  await logAudit({
    userId: user.id,
    action: "SURVEY_CREATE",
    module: "surveys",
    entityType: "Survey",
    entityId: survey.id,
    description: `Mengajukan survey ${survey.surveyNumber}`,
  });
  return { ok: true, id: survey.id };
}

export async function scheduleSurvey(
  user: CurrentUser,
  surveyId: string,
  scheduledAt: Date,
  technicianId: string
): Promise<Result> {
  const survey = await db.survey.findUnique({ where: { id: surveyId } });
  if (!survey) return { ok: false, error: "Survey tidak ditemukan." };
  if (["COMPLETED", "CANCELLED"].includes(survey.status)) {
    return { ok: false, error: "Survey sudah selesai/batal." };
  }
  await db.survey.update({
    where: { id: surveyId },
    data: { scheduledAt, technicianId, status: "SCHEDULED" },
  });
  await logAudit({
    userId: user.id,
    action: "SURVEY_SCHEDULE",
    module: "surveys",
    entityType: "Survey",
    entityId: surveyId,
    description: `Menjadwalkan survey ${survey.surveyNumber}`,
  });
  return { ok: true, id: surveyId };
}

export async function completeSurvey(
  user: CurrentUser,
  surveyId: string,
  data: {
    nearestNode?: string;
    estCableMeters?: number;
    estMaterials?: string;
    estCost?: bigint;
    signalLevel?: string;
    opticalPower?: string;
    feasibility: string;
    resultNotes?: string;
  }
): Promise<Result> {
  const survey = await db.survey.findUnique({ where: { id: surveyId } });
  if (!survey) return { ok: false, error: "Survey tidak ditemukan." };
  if (["COMPLETED", "CANCELLED"].includes(survey.status)) {
    return { ok: false, error: "Survey sudah selesai/batal." };
  }
  await db.survey.update({
    where: { id: surveyId },
    data: { ...data, status: "COMPLETED" },
  });
  if (survey.leadId) {
    await changeLeadStatus(user, survey.leadId, "QUOTATION_REQUIRED");
    const opp = await db.opportunity.findUnique({ where: { leadId: survey.leadId } });
    if (opp && ["NEW_LEAD", "INITIAL_CONTACT", "QUALIFIED", "SURVEY_SCHEDULED"].includes(opp.stage)) {
      await db.opportunity.update({
        where: { id: opp.id },
        data: { stage: "SURVEY_COMPLETED" },
      });
    }
  }
  await logAudit({
    userId: user.id,
    action: "SURVEY_COMPLETE",
    module: "surveys",
    entityType: "Survey",
    entityId: surveyId,
    description: `Menyelesaikan survey ${survey.surveyNumber} (${statusLabel(data.feasibility)})`,
  });
  return { ok: true, id: surveyId };
}

export async function cancelSurvey(
  user: CurrentUser,
  surveyId: string,
  reason?: string
): Promise<Result> {
  const survey = await db.survey.findUnique({ where: { id: surveyId } });
  if (!survey) return { ok: false, error: "Survey tidak ditemukan." };
  if (["COMPLETED", "CANCELLED"].includes(survey.status)) {
    return { ok: false, error: "Survey sudah selesai/batal." };
  }
  await db.survey.update({
    where: { id: surveyId },
    data: {
      status: "CANCELLED",
      resultNotes: reason
        ? `${survey.resultNotes ? survey.resultNotes + "\n" : ""}[Dibatalkan] ${reason}`
        : survey.resultNotes,
    },
  });
  await logAudit({
    userId: user.id,
    action: "SURVEY_CANCEL",
    module: "surveys",
    entityType: "Survey",
    entityId: surveyId,
    description: `Membatalkan survey ${survey.surveyNumber}`,
    metadata: { reason },
  });
  return { ok: true, id: surveyId };
}

// ── Quotation (versioned; accepted = immutable) ─────────────────

const QUOTATION_EDITABLE = ["DRAFT"];

export interface QuotationInput {
  packageId: string;
  monthlyPrice?: bigint;
  installationFee?: bigint;
  deviceFee?: bigint;
  networkBuildFee?: bigint;
  discount?: bigint;
  taxPercent?: number;
  contractMonths?: number;
  validUntil?: Date | null;
  notes?: string;
}

export async function createQuotation(
  user: CurrentUser,
  leadId: string,
  input: QuotationInput
): Promise<Result> {
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) return { ok: false, error: "Lead tidak ditemukan." };
  if (!lead.salesOwnerId) {
    return { ok: false, error: "Lead belum memiliki Sales owner." };
  }
  const pkg = await db.package.findUnique({ where: { id: input.packageId } });
  if (!pkg) return { ok: false, error: "Paket tidak ditemukan." };

  const prefix = monthPrefix("QUO");
  const count = await db.quotation.count({
    where: { quotationNumber: { startsWith: prefix }, version: 1 },
  });
  const quotation = await db.quotation.create({
    data: {
      quotationNumber: await nextNumber(prefix, count),
      leadId,
      packageId: pkg.id,
      monthlyPrice: input.monthlyPrice ?? pkg.monthlyPrice,
      installationFee: input.installationFee ?? pkg.installationFee,
      deviceFee: input.deviceFee ?? BigInt(0),
      networkBuildFee: input.networkBuildFee ?? BigInt(0),
      discount: input.discount ?? BigInt(0),
      taxPercent: input.taxPercent ?? 11,
      contractMonths: input.contractMonths ?? 12,
      validUntil: input.validUntil ?? null,
      notes: input.notes,
      createdById: user.id,
    },
  });
  await logAudit({
    userId: user.id,
    action: "QUOTATION_CREATE",
    module: "quotations",
    entityType: "Quotation",
    entityId: quotation.id,
    description: `Membuat quotation ${quotation.quotationNumber} v1 untuk lead ${lead.leadNumber}`,
  });
  return { ok: true, id: quotation.id };
}

export async function updateQuotation(
  user: CurrentUser,
  quotationId: string,
  input: QuotationInput
): Promise<Result> {
  const q = await db.quotation.findUnique({ where: { id: quotationId } });
  if (!q) return { ok: false, error: "Quotation tidak ditemukan." };
  if (!QUOTATION_EDITABLE.includes(q.status)) {
    return {
      ok: false,
      error: "Hanya quotation berstatus Draft yang dapat diedit. Gunakan Revisi untuk membuat versi baru.",
    };
  }
  await db.quotation.update({
    where: { id: quotationId },
    data: {
      packageId: input.packageId,
      monthlyPrice: input.monthlyPrice ?? q.monthlyPrice,
      installationFee: input.installationFee ?? q.installationFee,
      deviceFee: input.deviceFee ?? q.deviceFee,
      networkBuildFee: input.networkBuildFee ?? q.networkBuildFee,
      discount: input.discount ?? q.discount,
      taxPercent: input.taxPercent ?? q.taxPercent,
      contractMonths: input.contractMonths ?? q.contractMonths,
      validUntil: input.validUntil !== undefined ? input.validUntil : q.validUntil,
      notes: input.notes ?? q.notes,
    },
  });
  await logAudit({
    userId: user.id,
    action: "QUOTATION_UPDATE",
    module: "quotations",
    entityType: "Quotation",
    entityId: quotationId,
    description: `Mengubah draft quotation ${q.quotationNumber} v${q.version}`,
  });
  return { ok: true, id: quotationId };
}

// Kirim quotation. Diskon > 0 wajib approval (module quotation_discount).
export async function sendQuotation(
  user: CurrentUser,
  quotationId: string
): Promise<Result<{ message: string }>> {
  const q = await db.quotation.findUnique({
    where: { id: quotationId },
    include: { lead: true },
  });
  if (!q) return { ok: false, error: "Quotation tidak ditemukan." };
  if (!["DRAFT", "WAITING_APPROVAL"].includes(q.status)) {
    return { ok: false, error: "Quotation tidak dalam status yang bisa dikirim." };
  }

  if (q.discount > BigInt(0)) {
    const requests = await db.approvalRequest.findMany({
      where: { entityType: "Quotation", entityId: q.id },
      orderBy: { createdAt: "desc" },
    });
    const latest = requests[0];
    if (!latest || latest.status === "REJECTED" || latest.status === "CANCELLED") {
      const res = await submitApprovalRequest({
        user,
        module: "quotation_discount",
        title: `Diskon ${q.quotationNumber} v${q.version} — ${q.lead.name}`,
        description: `Diskon Rp${q.discount} pada quotation ${q.quotationNumber} v${q.version}`,
        amount: q.discount,
        entityType: "Quotation",
        entityId: q.id,
      });
      if (!res.ok) return res;
      await db.quotation.update({
        where: { id: q.id },
        data: { status: "WAITING_APPROVAL" },
      });
      return {
        ok: true,
        id: q.id,
        data: { message: "Diskon memerlukan approval. Request approval telah dibuat." },
      };
    }
    if (latest.status === "PENDING") {
      return { ok: false, error: "Approval diskon masih menunggu keputusan." };
    }
    // APPROVED → lanjut kirim
  }

  await db.quotation.update({ where: { id: q.id }, data: { status: "SENT" } });
  const opp = await db.opportunity.findUnique({ where: { leadId: q.leadId } });
  if (opp && !["WON", "LOST"].includes(opp.stage)) {
    await db.opportunity.update({ where: { id: opp.id }, data: { stage: "QUOTATION" } });
  }
  await logAudit({
    userId: user.id,
    action: "QUOTATION_SEND",
    module: "quotations",
    entityType: "Quotation",
    entityId: q.id,
    description: `Mengirim quotation ${q.quotationNumber} v${q.version}`,
  });
  return { ok: true, id: q.id, data: { message: "Quotation ditandai terkirim." } };
}

export async function decideQuotation(
  user: CurrentUser,
  quotationId: string,
  decision: "ACCEPTED" | "REJECTED"
): Promise<Result> {
  const q = await db.quotation.findUnique({ where: { id: quotationId } });
  if (!q) return { ok: false, error: "Quotation tidak ditemukan." };
  if (q.status !== "SENT") {
    return { ok: false, error: "Hanya quotation Terkirim yang bisa diterima/ditolak." };
  }
  await db.quotation.update({
    where: { id: quotationId },
    data: {
      status: decision,
      acceptedAt: decision === "ACCEPTED" ? new Date() : null,
    },
  });
  if (decision === "ACCEPTED") {
    const opp = await db.opportunity.findUnique({ where: { leadId: q.leadId } });
    if (opp && !["WON", "LOST"].includes(opp.stage)) {
      await db.opportunity.update({
        where: { id: opp.id },
        data: { stage: "WAITING_DECISION" },
      });
    }
  }
  await logAudit({
    userId: user.id,
    action: decision === "ACCEPTED" ? "QUOTATION_ACCEPT" : "QUOTATION_REJECT",
    module: "quotations",
    entityType: "Quotation",
    entityId: quotationId,
    description: `Quotation ${q.quotationNumber} v${q.version} ${statusLabel(decision)}`,
  });
  return { ok: true, id: quotationId };
}

// Revisi: buat versi baru; versi lama → SUPERSEDED. Accepted tidak bisa direvisi.
export async function reviseQuotation(
  user: CurrentUser,
  quotationId: string
): Promise<Result> {
  const q = await db.quotation.findUnique({ where: { id: quotationId } });
  if (!q) return { ok: false, error: "Quotation tidak ditemukan." };
  if (q.status === "ACCEPTED") {
    return {
      ok: false,
      error: "Quotation accepted tidak dapat direvisi (rule 16). Buat quotation baru.",
    };
  }
  if (q.status === "SUPERSEDED") {
    return { ok: false, error: "Versi ini sudah direvisi. Revisi dari versi terbaru." };
  }
  const maxVersion = await db.quotation.aggregate({
    where: { quotationNumber: q.quotationNumber },
    _max: { version: true },
  });
  const newVersion = (maxVersion._max.version ?? q.version) + 1;
  const copy = await db.quotation.create({
    data: {
      quotationNumber: q.quotationNumber,
      version: newVersion,
      leadId: q.leadId,
      packageId: q.packageId,
      monthlyPrice: q.monthlyPrice,
      installationFee: q.installationFee,
      deviceFee: q.deviceFee,
      networkBuildFee: q.networkBuildFee,
      discount: q.discount,
      taxPercent: q.taxPercent,
      contractMonths: q.contractMonths,
      validUntil: q.validUntil,
      notes: q.notes,
      createdById: user.id,
    },
  });
  await db.quotation.update({
    where: { id: quotationId },
    data: { status: "SUPERSEDED" },
  });
  await logAudit({
    userId: user.id,
    action: "QUOTATION_REVISE",
    module: "quotations",
    entityType: "Quotation",
    entityId: copy.id,
    description: `Revisi quotation ${q.quotationNumber}: v${q.version} → v${newVersion}`,
  });
  return { ok: true, id: copy.id };
}

// ── Konversi Lead → Customer (+ Subscription draft) ─────────────

export async function convertLead(
  user: CurrentUser,
  leadId: string
): Promise<Result> {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    include: { customer: true },
  });
  if (!lead) return { ok: false, error: "Lead tidak ditemukan." };
  if (lead.customer) return { ok: false, error: "Lead sudah terkonversi." };
  if (!lead.salesOwnerId) {
    return { ok: false, error: "Lead belum memiliki Sales owner." };
  }
  const accepted = await db.quotation.findFirst({
    where: { leadId, status: "ACCEPTED" },
    orderBy: { acceptedAt: "desc" },
    include: { package: true },
  });
  if (!accepted) {
    return {
      ok: false,
      error: "Konversi memerlukan quotation berstatus Accepted (PRD §11).",
    };
  }
  if (!lead.address) {
    return { ok: false, error: "Alamat lead wajib diisi sebelum konversi." };
  }

  const custCount = await db.customer.count();
  const customer = await db.customer.create({
    data: {
      customerNumber: `CST-${String(custCount + 1).padStart(5, "0")}`,
      name: lead.name,
      company: lead.company,
      phone: lead.phone,
      email: lead.email,
      address: lead.address,
      latitude: lead.latitude,
      longitude: lead.longitude,
      customerType: lead.customerType,
      salesOwnerId: lead.salesOwnerId,
      source: lead.source,
      leadId: lead.id,
      createdById: user.id,
    },
  });
  const svcCount = await db.subscription.count();
  await db.subscription.create({
    data: {
      serviceNumber: `SVC-${String(svcCount + 1).padStart(5, "0")}`,
      customerId: customer.id,
      packageId: accepted.packageId,
      monthlyPrice: accepted.monthlyPrice,
      downloadMbps: accepted.package.downloadMbps,
      uploadMbps: accepted.package.uploadMbps,
      contractMonths: accepted.contractMonths,
      quotationId: accepted.id,
      createdById: user.id,
    },
  });
  await db.lead.update({ where: { id: leadId }, data: { status: "CONVERTED" } });
  const opp = await db.opportunity.findUnique({ where: { leadId } });
  if (opp) {
    await db.opportunity.update({
      where: { id: opp.id },
      data: { stage: "WON", wonAt: opp.wonAt ?? new Date() },
    });
  }
  await logAudit({
    userId: user.id,
    action: "LEAD_CONVERT",
    module: "leads",
    entityType: "Customer",
    entityId: customer.id,
    description: `Konversi lead ${lead.leadNumber} → customer ${customer.customerNumber} + subscription draft`,
  });
  return { ok: true, id: customer.id };
}

// ── Subscription ────────────────────────────────────────────────

export async function createSubscription(
  user: CurrentUser,
  customerId: string,
  data: {
    packageId: string;
    monthlyPrice?: bigint;
    contractMonths?: number;
    popNode?: string;
    vlan?: string;
    pppoeUsername?: string;
    ipAddress?: string;
    notes?: string;
  }
): Promise<Result> {
  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer) return { ok: false, error: "Customer tidak ditemukan." };
  const pkg = await db.package.findUnique({ where: { id: data.packageId } });
  if (!pkg) return { ok: false, error: "Paket tidak ditemukan." };
  const svcCount = await db.subscription.count();
  const sub = await db.subscription.create({
    data: {
      serviceNumber: `SVC-${String(svcCount + 1).padStart(5, "0")}`,
      customerId,
      packageId: pkg.id,
      monthlyPrice: data.monthlyPrice ?? pkg.monthlyPrice,
      downloadMbps: pkg.downloadMbps,
      uploadMbps: pkg.uploadMbps,
      contractMonths: data.contractMonths,
      popNode: data.popNode,
      vlan: data.vlan,
      pppoeUsername: data.pppoeUsername || null,
      ipAddress: data.ipAddress,
      notes: data.notes,
      createdById: user.id,
    },
  });
  await logAudit({
    userId: user.id,
    action: "SUBSCRIPTION_CREATE",
    module: "subscriptions",
    entityType: "Subscription",
    entityId: sub.id,
    description: `Membuat subscription ${sub.serviceNumber} untuk ${customer.customerNumber}`,
  });
  return { ok: true, id: sub.id };
}

export async function changeSubscriptionStatus(
  user: CurrentUser,
  subscriptionId: string,
  status: string
): Promise<Result> {
  const sub = await db.subscription.findUnique({
    where: { id: subscriptionId },
    include: { customer: true },
  });
  if (!sub) return { ok: false, error: "Subscription tidak ditemukan." };

  const allowed = SUBSCRIPTION_TRANSITIONS[sub.status] ?? [];
  if (!allowed.includes(status)) {
    return {
      ok: false,
      error: `Transisi ${statusLabel(sub.status)} → ${statusLabel(status)} tidak diizinkan.`,
    };
  }
  // Rule 17: aktivasi layanan bukan oleh Sales — dicek di service layer.
  if (status === "ACTIVE" && !user.permissions.has(PERMISSIONS.SUBSCRIPTIONS_ACTIVATE)) {
    return {
      ok: false,
      error: "Anda tidak memiliki izin mengaktifkan layanan (business rule 17).",
    };
  }
  await db.subscription.update({
    where: { id: subscriptionId },
    data: {
      status,
      activatedAt: status === "ACTIVE" && !sub.activatedAt ? new Date() : sub.activatedAt,
      terminatedAt: status === "TERMINATED" ? new Date() : sub.terminatedAt,
    },
  });
  await logAudit({
    userId: user.id,
    action: "SUBSCRIPTION_STATUS_CHANGE",
    module: "subscriptions",
    entityType: "Subscription",
    entityId: subscriptionId,
    description: `Subscription ${sub.serviceNumber} (${sub.customer.name}): ${statusLabel(sub.status)} → ${statusLabel(status)}`,
  });
  return { ok: true, id: subscriptionId };
}
