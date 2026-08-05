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

// Permission Phase 1 — format "<module>.<action>".
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
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const APPROVAL_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
} as const;

export const APPROVAL_MODULES = [
  { code: "petty_cash", name: "Petty Cash", subtypes: [] as string[] },
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
  { code: "general", name: "Umum / Lainnya", subtypes: [] as string[] },
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
