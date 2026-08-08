// Konstanta sistem — pengganti enum (Prisma+SQLite tidak mendukung enum).

export const ROLES = {
  SUPER_ADMIN: "super_admin",
  MANAGEMENT: "management",
  MARKETING: "marketing",
  SALES_MANAGER: "sales_manager",
  SALES: "sales",
  CUSTOMER_SERVICE: "customer_service",
  FINANCE: "finance",
  WAREHOUSE: "warehouse",
  OPERATIONAL_COORDINATOR: "operational_coordinator",
  TECHNICIAN: "technician",
  PROJECT_MANAGER: "project_manager",
  NOC_MANAGER: "noc_manager",
  NOC_ENGINEER: "noc_engineer",
  IT_MANAGER: "it_manager",
  DEVELOPER: "developer",
  DEVOPS_ENGINEER: "devops_engineer",
  IT_SUPPORT: "it_support",
} as const;

// Permission — format "<module>.<action>".
export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard.view",
  USERS_VIEW: "users.view",
  USERS_CREATE: "users.create",
  USERS_EDIT: "users.edit",
  ROLES_VIEW: "roles.view",
  ROLES_MANAGE: "roles.manage",
  MASTER_DATA_VIEW: "master_data.view",
  MASTER_DATA_MANAGE: "master_data.manage",
  APPROVALS_VIEW: "approvals.view",
  APPROVALS_CREATE: "approvals.create",
  APPROVALS_ACT: "approvals.act",
  APPROVALS_CONFIGURE: "approvals.configure",
  AUDIT_LOG_VIEW: "audit_log.view",
  // Phase 2 — Sales & CRM
  CAMPAIGNS_VIEW: "campaigns.view",
  CAMPAIGNS_MANAGE: "campaigns.manage",
  LEADS_VIEW: "leads.view",
  LEADS_CREATE: "leads.create",
  LEADS_EDIT: "leads.edit",
  LEADS_ASSIGN: "leads.assign",
  OPPORTUNITIES_VIEW: "opportunities.view",
  OPPORTUNITIES_MANAGE: "opportunities.manage",
  SURVEYS_VIEW: "surveys.view",
  SURVEYS_CREATE: "surveys.create",
  SURVEYS_MANAGE: "surveys.manage", // jadwalkan & tugaskan teknisi
  SURVEYS_EXECUTE: "surveys.execute", // isi hasil survey
  QUOTATIONS_VIEW: "quotations.view",
  QUOTATIONS_CREATE: "quotations.create",
  QUOTATIONS_MANAGE: "quotations.manage", // kirim/terima/tolak/revisi
  CUSTOMERS_VIEW: "customers.view",
  CUSTOMERS_CREATE: "customers.create",
  CUSTOMERS_EDIT: "customers.edit",
  SUBSCRIPTIONS_VIEW: "subscriptions.view",
  SUBSCRIPTIONS_CREATE: "subscriptions.create",
  SUBSCRIPTIONS_EDIT: "subscriptions.edit",
  SUBSCRIPTIONS_ACTIVATE: "subscriptions.activate", // TIDAK untuk Sales (rule 17)
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// Struktur organisasi: staff -> supervisor -> owner
export const USER_LEVELS = {
  STAFF: "STAFF",
  SUPERVISOR: "SUPERVISOR",
  OWNER: "OWNER",
} as const;

export type UserLevel = (typeof USER_LEVELS)[keyof typeof USER_LEVELS];

export const USER_LEVEL_LABELS: Record<string, string> = {
  STAFF: "Staff",
  SUPERVISOR: "Supervisor",
  OWNER: "Owner",
};

export const APPROVER_TYPES = {
  ROLE: "ROLE",
  SUPERVISOR: "SUPERVISOR",
  OWNER: "OWNER",
} as const;

export const APPROVAL_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
} as const;

export const APPROVAL_MODULES: {
  code: string;
  name: string;
  subtypes: string[];
  manual?: boolean; // false = hanya dibuat otomatis oleh sistem
}[] = [
  { code: "petty_cash", name: "Petty Cash", subtypes: [] },
  {
    code: "network_change",
    name: "Network Change",
    subtypes: ["standard", "normal", "major", "emergency"],
  },
  {
    code: "deployment",
    name: "Deployment",
    subtypes: ["staging", "production_minor", "production_major"],
  },
  {
    code: "quotation_discount",
    name: "Diskon Quotation",
    subtypes: [],
    manual: false,
  },
  { code: "general", name: "Umum / Lainnya", subtypes: [] },
];

export const CATEGORY_TYPES = ["EXPENSE"] as const;

export const AUDIT_ACTIONS = {
  LOGIN: "LOGIN",
  LOGIN_FAILED: "LOGIN_FAILED",
  LOGOUT: "LOGOUT",
  PASSWORD_CHANGE: "PASSWORD_CHANGE",
  PASSWORD_RESET: "PASSWORD_RESET",
  USER_CREATE: "USER_CREATE",
  USER_UPDATE: "USER_UPDATE",
  USER_DEACTIVATE: "USER_DEACTIVATE",
  USER_ACTIVATE: "USER_ACTIVATE",
  USER_ROLE_CHANGE: "USER_ROLE_CHANGE",
  ROLE_PERMISSION_UPDATE: "ROLE_PERMISSION_UPDATE",
  MASTER_CREATE: "MASTER_CREATE",
  MASTER_UPDATE: "MASTER_UPDATE",
  MASTER_TOGGLE: "MASTER_TOGGLE",
  APPROVAL_SUBMIT: "APPROVAL_SUBMIT",
  APPROVAL_APPROVE: "APPROVAL_APPROVE",
  APPROVAL_REJECT: "APPROVAL_REJECT",
  APPROVAL_CANCEL: "APPROVAL_CANCEL",
} as const;

// ── Phase 2: Sales & CRM ────────────────────────────────────────

export const CUSTOMER_TYPES = [
  ["RESIDENTIAL", "Residential"],
  ["BUSINESS", "Business"],
  ["HOTEL", "Hotel"],
  ["VILLA", "Villa"],
  ["CORPORATE", "Corporate"],
  ["RESELLER", "Reseller"],
  ["GOVERNMENT", "Government"],
  ["INTERNAL", "Internal"],
] as const;

export const LEAD_SOURCES = [
  ["CAMPAIGN", "Campaign"],
  ["REFERRAL", "Referral"],
  ["WALK_IN", "Walk-in"],
  ["WEBSITE", "Website"],
  ["SOCIAL_MEDIA", "Social Media"],
  ["WHATSAPP", "WhatsApp"],
  ["PHONE", "Telepon"],
  ["OTHER", "Lainnya"],
] as const;

export const CAMPAIGN_CHANNELS = [
  "Online",
  "Social Media",
  "Offline / Brosur",
  "Door-to-door",
  "Event",
  "Referral",
  "Lainnya",
] as const;

export const CAMPAIGN_STATUSES = ["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"] as const;

export const LEAD_STATUSES = [
  "NEW",
  "ASSIGNED",
  "CONTACTED",
  "FOLLOW_UP",
  "INTERESTED",
  "SURVEY_REQUIRED",
  "QUOTATION_REQUIRED",
  "UNREACHABLE",
  "NOT_INTERESTED",
  "CONVERTED",
  "LOST",
] as const;

// Status yang membutuhkan alasan (business rule 15)
export const LEAD_STATUSES_NEED_REASON = ["NOT_INTERESTED", "LOST"] as const;

export const ACTIVITY_TYPES = [
  ["PHONE_CALL", "Telepon"],
  ["WHATSAPP", "WhatsApp"],
  ["EMAIL", "Email"],
  ["MEETING", "Meeting"],
  ["SITE_VISIT", "Kunjungan"],
  ["PRESENTATION", "Presentasi"],
  ["SURVEY_REQUEST", "Pengajuan Survey"],
  ["QUOTATION_SENT", "Quotation Terkirim"],
  ["NEGOTIATION", "Negosiasi"],
  ["CONTRACT_SIGNING", "Tanda Tangan Kontrak"],
] as const;

export const OPP_STAGES = [
  "NEW_LEAD",
  "INITIAL_CONTACT",
  "QUALIFIED",
  "SURVEY_SCHEDULED",
  "SURVEY_COMPLETED",
  "QUOTATION",
  "NEGOTIATION",
  "WAITING_DECISION",
  "WON",
  "LOST",
  "INSTALLATION_PROCESS",
  "ACTIVATED",
] as const;

export const SURVEY_STATUSES = [
  "SUBMITTED",
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;

export const FEASIBILITY = [
  ["FEASIBLE", "Feasible"],
  ["FEASIBLE_WITH_COST", "Feasible dengan Biaya Tambahan"],
  ["NOT_FEASIBLE", "Not Feasible"],
] as const;

export const QUOTATION_STATUSES = [
  "DRAFT",
  "WAITING_APPROVAL",
  "SENT",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
  "SUPERSEDED",
] as const;

export const SUBSCRIPTION_STATUSES = [
  "DRAFT",
  "WAITING_INSTALLATION",
  "ACTIVE",
  "ISOLATED",
  "SUSPENDED",
  "TERMINATED",
] as const;

// Transisi status subscription yang diizinkan
export const SUBSCRIPTION_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["WAITING_INSTALLATION", "TERMINATED"],
  WAITING_INSTALLATION: ["ACTIVE", "TERMINATED"],
  ACTIVE: ["ISOLATED", "SUSPENDED", "TERMINATED"],
  ISOLATED: ["ACTIVE", "SUSPENDED", "TERMINATED"],
  SUSPENDED: ["ACTIVE", "TERMINATED"],
  TERMINATED: [],
};

// Label ringkas untuk badge/status (fallback: kode apa adanya)
export const STATUS_LABELS: Record<string, string> = {
  NEW: "Baru",
  ASSIGNED: "Ter-assign",
  CONTACTED: "Terkontak",
  FOLLOW_UP: "Follow-up",
  INTERESTED: "Tertarik",
  SURVEY_REQUIRED: "Perlu Survey",
  QUOTATION_REQUIRED: "Perlu Quotation",
  UNREACHABLE: "Tidak Terhubungi",
  NOT_INTERESTED: "Tidak Tertarik",
  CONVERTED: "Terkonversi",
  LOST: "Lost",
  NEW_LEAD: "Lead Baru",
  INITIAL_CONTACT: "Kontak Awal",
  QUALIFIED: "Qualified",
  SURVEY_SCHEDULED: "Survey Terjadwal",
  SURVEY_COMPLETED: "Survey Selesai",
  QUOTATION: "Quotation",
  NEGOTIATION: "Negosiasi",
  WAITING_DECISION: "Menunggu Keputusan",
  WON: "Won",
  INSTALLATION_PROCESS: "Proses Instalasi",
  ACTIVATED: "Aktif",
  SUBMITTED: "Diajukan",
  SCHEDULED: "Terjadwal",
  IN_PROGRESS: "Berjalan",
  COMPLETED: "Selesai",
  FEASIBLE: "Feasible",
  FEASIBLE_WITH_COST: "Feasible + Biaya",
  NOT_FEASIBLE: "Not Feasible",
  DRAFT: "Draft",
  WAITING_APPROVAL: "Menunggu Approval",
  SENT: "Terkirim",
  ACCEPTED: "Diterima",
  EXPIRED: "Kedaluwarsa",
  SUPERSEDED: "Direvisi",
  WAITING_INSTALLATION: "Menunggu Instalasi",
  ACTIVE: "Aktif",
  ISOLATED: "Isolir",
  SUSPENDED: "Suspend",
  TERMINATED: "Terminasi",
  INACTIVE: "Nonaktif",
  CANCELLED: "Dibatalkan",
  REJECTED: "Ditolak",
};

export function statusLabel(code: string | null | undefined): string {
  if (!code) return "-";
  return STATUS_LABELS[code] ?? code;
}

export function formatRupiah(amount: bigint | number | null | undefined): string {
  if (amount === null || amount === undefined) return "-";
  return "Rp" + new Intl.NumberFormat("id-ID").format(Number(amount));
}

export function formatDateTime(d: Date | null | undefined): string {
  if (!d) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Makassar",
  }).format(d);
}
