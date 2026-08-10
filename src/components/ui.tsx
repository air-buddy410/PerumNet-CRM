import Link from "next/link";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="crm-page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return (
    <div className={`crm-flash ${error ? "is-error" : "is-success"}`}>
      {error ?? ok}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: "is-pending",
  APPROVED: "is-approved",
  REJECTED: "is-rejected",
  CANCELLED: "is-neutral",
  AKTIF: "is-approved",
  NONAKTIF: "is-neutral",
  // Lead
  NEW: "is-pending",
  ASSIGNED: "is-pending",
  CONTACTED: "is-pending",
  FOLLOW_UP: "is-pending",
  INTERESTED: "is-approved",
  SURVEY_REQUIRED: "is-pending",
  QUOTATION_REQUIRED: "is-pending",
  UNREACHABLE: "is-rejected",
  NOT_INTERESTED: "is-rejected",
  CONVERTED: "is-approved",
  LOST: "is-rejected",
  // Pipeline
  NEW_LEAD: "is-pending",
  INITIAL_CONTACT: "is-pending",
  QUALIFIED: "is-approved",
  SURVEY_SCHEDULED: "is-pending",
  SURVEY_COMPLETED: "is-pending",
  QUOTATION: "is-pending",
  NEGOTIATION: "is-pending",
  WAITING_DECISION: "is-pending",
  WON: "is-approved",
  INSTALLATION_PROCESS: "is-pending",
  ACTIVATED: "is-approved",
  // Survey
  SUBMITTED: "is-pending",
  SCHEDULED: "is-pending",
  IN_PROGRESS: "is-pending",
  COMPLETED: "is-approved",
  FEASIBLE: "is-approved",
  FEASIBLE_WITH_COST: "is-pending",
  NOT_FEASIBLE: "is-rejected",
  // Quotation
  DRAFT: "is-neutral",
  WAITING_APPROVAL: "is-pending",
  SENT: "is-pending",
  ACCEPTED: "is-approved",
  EXPIRED: "is-rejected",
  SUPERSEDED: "is-neutral",
  // Subscription
  WAITING_INSTALLATION: "is-pending",
  ACTIVE: "is-approved",
  ISOLATED: "is-pending",
  SUSPENDED: "is-pending",
  TERMINATED: "is-rejected",
  INACTIVE: "is-neutral",
  // Inventory & Operational
  POSTED: "is-approved",
  REVERSED: "is-neutral",
  AVAILABLE: "is-approved",
  IN_CUSTODY: "is-pending",
  INSTALLED: "is-approved",
  UNDER_INSPECTION: "is-pending",
  DAMAGED: "is-rejected",
  SCRAPPED: "is-neutral",
  OPEN: "is-pending",
  CLOSED: "is-approved",
  SERIALIZED: "is-pending",
  BULK: "is-neutral",
  // NOC — network inventory & IPAM
  PLANNED: "is-neutral",
  DEGRADED: "is-pending",
  DOWN: "is-rejected",
  ALLOCATED: "is-approved",
  RESERVED: "is-pending",
  RELEASED: "is-neutral",
  // NOC — alarm
  INFORMATIONAL: "is-neutral",
  WARNING: "is-pending",
  MINOR: "is-pending",
  MAJOR: "is-rejected",
  CRITICAL: "is-rejected",
  ACKNOWLEDGED: "is-pending",
  CLEARED: "is-approved",
  // NOC — incident
  DETECTED: "is-rejected",
  INVESTIGATING: "is-pending",
  MITIGATING: "is-pending",
  RESOLVED: "is-approved",
  P1: "is-rejected",
  P2: "is-rejected",
  P3: "is-pending",
  P4: "is-neutral",
  // NOC — change management
  PENDING_REVIEW: "is-pending",
  FAILED: "is-rejected",
  STANDARD: "is-neutral",
  NORMAL: "is-pending",
  EMERGENCY: "is-rejected",
  // IT/DevOps — environment & inventory
  DEVELOPMENT: "is-neutral",
  TESTING: "is-neutral",
  STAGING: "is-pending",
  PRODUCTION: "is-rejected",
  DR: "is-neutral",
  DECOMMISSIONED: "is-neutral",
  DEPRECATED: "is-rejected",
  // IT/DevOps — prioritas & tiket
  LOW: "is-neutral",
  MEDIUM: "is-neutral",
  HIGH: "is-pending",
  URGENT: "is-rejected",
  WAITING_USER: "is-pending",
  WAITING_VENDOR: "is-pending",
  // IT/DevOps — akses, deployment, backup
  GRANTED: "is-approved",
  REVOKED: "is-neutral",
  READY: "is-pending",
  ROLLED_BACK: "is-rejected",
  SUCCESS: "is-approved",
  // Billing
  PARTIAL: "is-pending",
  PAID: "is-approved",
  VOID: "is-neutral",
  WRITTEN_OFF: "is-neutral",
  PREVIEW: "is-pending",
  // Isolir & antrian router
  QUEUED: "is-pending",
  RUNNING: "is-pending",
  SKIPPED: "is-neutral",
  // Helpdesk pelanggan
  SOLVED: "is-approved",
  // FTTH port
  FREE: "is-approved",
  USED: "is-pending",
  // Kanal pelanggan
  SENDING: "is-pending",
  NONE: "is-neutral",
  WHATSAPP: "is-approved",
  EMAIL: "is-pending",
  APP: "is-pending",
  // HRD & absensi
  PRESENT: "is-approved",
  LATE: "is-pending",
  ABSENT: "is-rejected",
  LEAVE: "is-neutral",
  SICK: "is-neutral",
  HOLIDAY: "is-neutral",
};

export function Badge({ value, label }: { value: string; label?: string }) {
  return (
    <span
      className={`crm-badge ${STATUS_STYLES[value] ?? "is-neutral"}`}
    >
      {label ?? value}
    </span>
  );
}

export function ActiveBadge({ isActive }: { isActive: boolean }) {
  return <Badge value={isActive ? "AKTIF" : "NONAKTIF"} label={isActive ? "Aktif" : "Nonaktif"} />;
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="crm-empty-state">{message}</div>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="crm-back-link">
      {label}
    </Link>
  );
}
