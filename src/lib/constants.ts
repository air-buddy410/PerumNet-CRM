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
  NOC: "noc", // Fase 22: noc_manager + noc_engineer dilebur jadi satu
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
  /// Fase 66 — melihat NIK, telepon, email, dan tanggal lahir TANPA samaran.
  /// Tanpa izin ini pelanggan tetap terbaca, hanya data pribadinya tersamar.
  CUSTOMERS_PII_VIEW: "customers.pii_view",
  SUBSCRIPTIONS_VIEW: "subscriptions.view",
  SUBSCRIPTIONS_CREATE: "subscriptions.create",
  SUBSCRIPTIONS_EDIT: "subscriptions.edit",
  SUBSCRIPTIONS_ACTIVATE: "subscriptions.activate", // TIDAK untuk Sales (rule 17)
  // Phase 3 — Inventory & Operational
  INVENTORY_VIEW: "inventory.view",
  ITEMS_MANAGE: "items.manage", // item & warehouse master
  STOCK_CREATE: "stock.create", // buat draft transaksi
  STOCK_POST: "stock.post", // posting transaksi (mengubah saldo)
  STOCK_REVERSE: "stock.reverse",
  STOCK_RECEIVE: "stock.receive", // menerima transfer antar gudang (Fase 17)
  SLOT_APPROVE: "slot.approve", // perpindahan alokasi di atas ambang (Fase 20)
  // Fase 28 — terminasi pelanggan & recovery perangkat (PRD §12)
  TERMINATION_CREATE: "termination.create",
  TERMINATION_VIEW: "termination.view",
  TERMINATION_APPROVE: "termination.approve",
  TERMINATION_CANCEL: "termination.cancel",
  RECOVERY_ASSIGN: "device_recovery.assign",
  RECOVERY_PICKUP: "device_recovery.pickup",
  RECOVERY_RECEIVE: "device_recovery.receive",
  RECOVERY_INSPECT: "device_recovery.inspect",
  RECOVERY_DISPOSE: "device_recovery.dispose",
  RECOVERY_ESCALATE: "device_recovery.escalate",
  DEVICE_OWNERSHIP_MANAGE: "devices.ownership", // koreksi kepemilikan, ber-audit
  DEVICES_WRITEOFF: "devices.writeoff", // ajukan & finalisasi lost/damaged
  CUSTODY_VIEW: "custody.view",
  WORK_ORDERS_VIEW: "work_orders.view",
  WORK_ORDERS_CREATE: "work_orders.create",
  WORK_ORDERS_ASSIGN: "work_orders.assign",
  WORK_ORDERS_EXECUTE: "work_orders.execute", // teknisi
  WORK_ORDERS_CLOSE: "work_orders.close", // koordinator
  OPNAME_MANAGE: "opname.manage",
  // Phase 4 — Finance & Project
  FINANCE_VIEW: "finance.view",
  CASH_CREATE: "cash.create", // buat draft pengajuan kas (semua divisi)
  CASH_POST: "cash.post", // posting (mengubah saldo) — Finance
  CASH_REVERSE: "cash.reverse",
  CASH_MANAGE: "cash.manage", // top-up, transfer, master cashbook
  CLOSINGS_MANAGE: "closings.manage",
  PROJECTS_VIEW: "projects.view",
  PROJECTS_MANAGE: "projects.manage",
  PROJECTS_CLOSE: "projects.close",
  // Phase 5 — NOC
  NOC_VIEW: "noc.view",
  NOC_MAP_VIEW: "noc_map.view", // peta jaringan + titik pelanggan (Fase 23)
  NET_INVENTORY_MANAGE: "net_inventory.manage", // site, device, link
  IPAM_MANAGE: "ipam.manage",
  ALARMS_MANAGE: "alarms.manage",
  INCIDENTS_CREATE: "incidents.create",
  INCIDENTS_MANAGE: "incidents.manage", // update/ack/resolve + tutup P3/P4
  INCIDENTS_CLOSE: "incidents.close", // tutup incident besar P1/P2 (NOC Manager)
  MAINTENANCE_MANAGE: "maintenance.manage",
  CHANGES_CREATE: "changes.create",
  CHANGES_IMPLEMENT: "changes.implement", // eksekusi change yang disetujui
  CHANGES_REVIEW: "changes.review", // post-review emergency (NOC Manager)
  // Phase 6 — IT/DevOps
  IT_VIEW: "it.view",
  IT_INVENTORY_MANAGE: "it_inventory.manage", // server & application inventory
  IT_TICKETS_CREATE: "it_tickets.create", // semua staff boleh buat tiket
  IT_TICKETS_MANAGE: "it_tickets.manage", // assign, status, resolve, close
  ACCESS_REQUEST: "access.request", // semua staff boleh minta akses
  ACCESS_MANAGE: "access.manage", // grant, revoke, offboarding
  DEPLOYMENTS_CREATE: "deployments.create",
  DEPLOYMENTS_EXECUTE: "deployments.execute",
  BACKUPS_MANAGE: "backups.manage",
  IT_ASSETS_MANAGE: "it_assets.manage", // domain, SSL, license, subscription
  // Phase 7 — Integrasi
  INTEGRATIONS_MANAGE: "integrations.manage", // registry integrasi & webhook
  OUTAGES_VIEW: "outages.view", // status gangguan yang disetujui (§33)
  // Phase 8 — Billing & Invoice
  BILLING_VIEW: "billing.view",
  BILLING_MANAGE: "billing.manage", // addon, billing profile
  INVOICES_CREATE: "invoices.create", // invoice manual & invoice run
  INVOICES_POST: "invoices.post", // posting run, void invoice
  // Phase 9 — Payment & Merchant/Kolektor
  MERCHANTS_MANAGE: "merchants.manage",
  PAYMENTS_CREATE: "payments.create", // catat pembayaran & bundle gateway
  PAYMENTS_POST: "payments.post", // posting pembayaran (mengubah piutang)
  PAYMENTS_REVERSE: "payments.reverse",
  // Phase 10 — Isolir & Dunning
  DUNNING_MANAGE: "dunning.manage", // kebijakan, evaluasi, isolir/restore
  // Phase 11 — General Ledger
  GL_VIEW: "gl.view", // laporan & jurnal
  GL_MANAGE: "gl.manage", // CoA & posting rules
  GL_POST: "gl.post", // jurnal manual & reversal
  // Phase 12 — Helpdesk Pelanggan
  CTICKETS_VIEW: "ctickets.view",
  CTICKETS_CREATE: "ctickets.create",
  CTICKETS_MANAGE: "ctickets.manage", // assign, kategori, workflow, close
  // Phase 13 — FTTH Port Management
  FTTH_MANAGE: "ftth.manage", // OLT, PON, ODP, alokasi port
  // Phase 14 — HRD & Absensi
  HRD_VIEW: "hrd.view", // data karyawan, rekap, jadwal
  HRD_MANAGE: "hrd.manage", // master karyawan, shift, lokasi, jadwal
  ATTENDANCE_SELF: "attendance.self", // absen mandiri + ajukan izin/lembur
  // Phase 15 — Kanal Pelanggan
  CHANNELS_VIEW: "channels.view",
  CHANNELS_MANAGE: "channels.manage", // template, blast, pengumuman, antrian
  // Phase 47 — Arsip terpadu
  ARCHIVE_VIEW: "archive.view", // melihat isi arsip lintas modul
  ARCHIVE_RESTORE: "archive.restore", // memulihkan baris yang diarsipkan
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
  {
    code: "stock_opname",
    name: "Adjustment Stock Opname",
    subtypes: [],
    manual: false,
  },
  {
    code: "device_writeoff",
    name: "Write-off Perangkat",
    subtypes: [],
    manual: false,
  },
  {
    code: "network_maintenance",
    name: "Network Maintenance",
    subtypes: [],
    manual: false,
  },
  {
    code: "access_request",
    name: "Access Request Production",
    subtypes: ["production"],
    manual: false,
  },
  {
    code: "leave_request",
    name: "Izin / Cuti Karyawan",
    subtypes: [],
    manual: false,
  },
  {
    code: "overtime_request",
    name: "Lembur Karyawan",
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

// ── Phase 3: Inventory & Operational ────────────────────────────

export const TRACKING_TYPES = [
  ["SERIALIZED", "Serialized (per unit, wajib SN)"],
  ["BULK", "Bulk (kuantitas)"],
] as const;

/// Fase 28 — kepemilikan perangkat. Hanya COMPANY yang boleh masuk recovery.
export const DEVICE_OWNERSHIPS = [
  ["COMPANY", "Milik PERUMNET"],
  ["CUSTOMER", "Milik Pelanggan"],
] as const;

/// Kondisi perangkat. SECOND dipakai untuk perangkat hasil penarikan yang
/// dinyatakan layak — PRD §13.8: hasil layak TIDAK PERNAH kembali jadi NEW.
export const DEVICE_CONDITIONS = [
  ["GOOD", "Baik"],
  ["SECOND", "Layak pakai ulang"],
  ["DAMAGED", "Rusak"],
] as const;

// ── Fase 29–32: terminasi & recovery ────────────────────────────

export const TERMINATION_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "EFFECTIVE",
  "REJECTED",
  "CANCELLED",
] as const;

/// Status terminasi yang sudah selesai — tidak boleh diubah lagi.
export const TERMINATION_FINAL_STATUSES = ["EFFECTIVE", "REJECTED", "CANCELLED"] as const;

export const TERMINATION_REASONS = [
  ["CUSTOMER_REQUEST", "Permintaan pelanggan"],
  ["NON_PAYMENT", "Tunggakan"],
  ["RELOCATION", "Pindah alamat"],
  ["FRAUD", "Pelanggaran / fraud"],
  ["OTHER", "Lainnya"],
] as const;

export const RECOVERY_STATUSES = [
  "OPEN",
  "ASSIGNED",
  "IN_PROGRESS",
  "PARTIAL",
  "RECOVERED",
  "INSPECTION",
  "COMPLETED",
  "CLOSED_UNRECOVERED",
] as const;

export const RECOVERY_ITEM_STATUSES = [
  "RECOVERY_PENDING",
  "PICKED_UP",
  "RECEIVED",
  "INSPECTED",
  "NOT_RETURNED",
] as const;

export const RECOVERY_ATTEMPT_RESULTS = [
  ["BERHASIL", "Berhasil"],
  ["TIDAK_DI_TEMPAT", "Pelanggan tidak di tempat"],
  ["DITOLAK", "Ditolak pelanggan"],
  ["GAGAL_LAIN", "Gagal — sebab lain"],
] as const;

/// Keputusan akhir per perangkat (PRD §13.8). Hanya LAYAK_DIGUNAKAN yang
/// mengembalikan barang ke stok tersedia, dan selalu sebagai SECOND.
export const RECOVERY_DECISIONS = [
  ["LAYAK_DIGUNAKAN", "Layak digunakan"],
  ["PERLU_PERBAIKAN", "Perlu perbaikan"],
  ["RUSAK", "Rusak"],
  ["SCRAP", "Scrap"],
  ["TIDAK_KEMBALI", "Tidak kembali"],
] as const;

/// Keputusan yang boleh keluar dari inspeksi gudang. TIDAK_KEMBALI TIDAK ada
/// di sini — perangkat yang tidak pernah sampai gudang mustahil diinspeksi,
/// dan jalurnya lewat eskalasi SLA, bukan lewat form inspeksi.
export const INSPECTION_DECISIONS = [
  "LAYAK_DIGUNAKAN",
  "PERLU_PERBAIKAN",
  "RUSAK",
  "SCRAP",
] as const;

/// Butir checklist inspeksi (PRD §13.7). Disimpan sebagai data supaya butir
/// bisa bertambah tanpa migrasi.
export const INSPECTION_CHECKLIST = [
  ["casing", "Fisik / casing utuh"],
  ["boot", "Menyala & boot normal"],
  ["reset", "Berhasil factory reset"],
  ["lan", "Port LAN berfungsi"],
  ["wifi", "WiFi berfungsi"],
  ["optical", "Level optik normal"],
  ["accessories", "Adaptor & aksesori lengkap"],
] as const;


export const ITEM_UNITS = ["pcs", "meter", "roll", "box", "set"] as const;

export const TX_TYPES = {
  GOODS_RECEIPT: "GOODS_RECEIPT",
  STOCK_ISSUE: "STOCK_ISSUE",
  STOCK_RETURN: "STOCK_RETURN",
  STOCK_TRANSFER: "STOCK_TRANSFER",
  STOCK_ADJUSTMENT: "STOCK_ADJUSTMENT",
} as const;

export const TX_TYPE_LABELS: Record<string, string> = {
  GOODS_RECEIPT: "Penerimaan Barang",
  STOCK_ISSUE: "Pengeluaran ke Teknisi",
  STOCK_RETURN: "Pengembalian Barang",
  STOCK_TRANSFER: "Transfer Antar Gudang",
  STOCK_ADJUSTMENT: "Penyesuaian (Opname)",
};

export const TX_PREFIX: Record<string, string> = {
  GOODS_RECEIPT: "GR",
  STOCK_ISSUE: "ISS",
  STOCK_RETURN: "RET",
  STOCK_TRANSFER: "TRF",
  STOCK_ADJUSTMENT: "ADJ",
};

/// Pengelompokan tingkat kedua di atas kategori, mengikuti kebutuhan FTTH.
export const MATERIAL_TYPES = [
  "Cable",
  "Connector",
  "Network Device",
  "Passive Device",
  "Power",
  "Consumable",
  "Tools",
  "Other",
] as const;

export const DEVICE_STATUSES = [
  "AVAILABLE",
  "IN_TRANSIT", // Fase 17: dikirim antar gudang, belum diterima
  // Fase 28 — alur terminasi & recovery. RETURN_IN_TRANSIT sengaja DIBEDAKAN
  // dari IN_TRANSIT: yang satu perpindahan antar gudang, yang satu penarikan
  // dari pelanggan. Menyatukannya akan mengaburkan laporan keduanya.
  "RECOVERY_PENDING", // terminasi disetujui, menunggu ditarik teknisi
  "RETURN_IN_TRANSIT", // sudah ditarik, belum sampai gudang
  "QUARANTINED", // diterima gudang, belum lulus inspeksi
  "RMA", // perlu perbaikan — tidak tersedia untuk WO
  "IN_CUSTODY",
  "INSTALLED",
  "UNDER_INSPECTION",
  "DAMAGED",
  "LOST",
  "SCRAPPED",
] as const;

export const WO_TYPES = [
  ["NEW_INSTALLATION", "Instalasi Baru"],
  ["TROUBLESHOOTING", "Troubleshooting"],
  ["DEVICE_REPLACEMENT", "Penggantian Perangkat"],
  ["DEVICE_RETRIEVAL", "Penarikan Perangkat"],
  ["MAINTENANCE", "Maintenance"],
] as const;

export const WO_STATUSES = [
  "OPEN",
  "ASSIGNED",
  "IN_PROGRESS",
  "COMPLETED",
  "CLOSED",
  "CANCELLED",
] as const;

// Custody dianggap overdue setelah N hari (PRD §17) — konfigurasi awal.
export const CUSTODY_OVERDUE_DAYS = 7;

// ── Phase 4: Finance & Project ──────────────────────────────────

export const CASH_TX_TYPES = {
  TOP_UP: "TOP_UP",
  EXPENSE: "EXPENSE",
  REIMBURSEMENT: "REIMBURSEMENT",
  CASH_ADVANCE: "CASH_ADVANCE",
  ADVANCE_SETTLEMENT: "ADVANCE_SETTLEMENT",
  CASH_TRANSFER: "CASH_TRANSFER",
} as const;

export const CASH_TX_LABELS: Record<string, string> = {
  TOP_UP: "Top-up Kas",
  EXPENSE: "Pengeluaran Langsung",
  REIMBURSEMENT: "Reimbursement",
  CASH_ADVANCE: "Cash Advance",
  ADVANCE_SETTLEMENT: "Settlement Advance",
  CASH_TRANSFER: "Transfer Antar Kas",
};

export const CASH_TX_PREFIX: Record<string, string> = {
  TOP_UP: "CSH",
  EXPENSE: "EXP",
  REIMBURSEMENT: "RBM",
  CASH_ADVANCE: "ADV",
  ADVANCE_SETTLEMENT: "STL",
  CASH_TRANSFER: "CTF",
};

// Tipe yang wajib melewati approval matrix petty_cash sebelum posting.
export const CASH_TYPES_NEED_APPROVAL = [
  "EXPENSE",
  "REIMBURSEMENT",
  "CASH_ADVANCE",
] as const;

// Tipe yang wajib memiliki bukti (attachment) sebelum diajukan/diposting.
export const CASH_TYPES_NEED_EVIDENCE = ["EXPENSE", "REIMBURSEMENT"] as const;

export const PROJECT_STATUSES = ["OPEN", "CLOSED", "CANCELLED"] as const;

// ── Phase 5: NOC ────────────────────────────────────────────────

export const SITE_TYPES = [
  ["HEAD_OFFICE", "Head Office"],
  ["DATA_CENTER", "Data Center"],
  ["POP", "POP"],
  ["MINI_POP", "Mini POP"],
  ["TOWER", "Tower"],
  ["ODC", "ODC"],
  ["ODP", "ODP"],
  ["RELAY", "Relay Site"],
  ["COLOCATION", "Colocation"],
] as const;

export const NET_DEVICE_TYPES = [
  ["ROUTER", "Router"],
  ["CORE_ROUTER", "Core Router"],
  ["DIST_SWITCH", "Distribution Switch"],
  ["ACCESS_SWITCH", "Access Switch"],
  ["OLT", "OLT"],
  ["ONT", "ONU / ONT"],
  ["WIRELESS_BACKHAUL", "Wireless Backhaul"],
  ["ACCESS_POINT", "Access Point"],
  ["FIREWALL", "Firewall"],
  ["SERVER", "Server"],
  ["UPS", "UPS"],
  ["OTHER", "Lainnya"],
] as const;

export const LINK_MEDIA = ["FIBER", "WIRELESS", "LEASED_LINE", "VPN"] as const;
export const CRITICALITY = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export const ALARM_SEVERITIES = [
  "INFORMATIONAL",
  "WARNING",
  "MINOR",
  "MAJOR",
  "CRITICAL",
] as const;

export const INCIDENT_TYPES = [
  ["DEVICE_DOWN", "Device Down"],
  ["LINK_DOWN", "Link Down"],
  ["HIGH_LATENCY", "High Latency"],
  ["PACKET_LOSS", "Packet Loss"],
  ["POWER_OUTAGE", "Power Outage"],
  ["FIBER_CUT", "Fiber Cut"],
  ["WIRELESS_INTERFERENCE", "Wireless Interference"],
  ["UPSTREAM_OUTAGE", "Upstream Provider Outage"],
  ["CORE_ISSUE", "Core Network Issue"],
  ["AUTH_FAILURE", "Authentication Failure"],
  ["DNS_ISSUE", "DNS Issue"],
  ["SECURITY", "DDoS / Security"],
  ["OTHER", "Lainnya"],
] as const;

export const INCIDENT_SEVERITIES = ["P1", "P2", "P3", "P4"] as const;
// Incident besar — wajib root cause review & hanya ditutup NOC Manager.
export const MAJOR_INCIDENT_SEVERITIES = ["P1", "P2"] as const;

export const INCIDENT_STATUSES = [
  "DETECTED",
  "ACKNOWLEDGED",
  "INVESTIGATING",
  "MITIGATING",
  "RESOLVED",
  "CLOSED",
] as const;

export const MAINTENANCE_TYPES = [
  ["PREVENTIVE", "Preventive"],
  ["CORRECTIVE", "Corrective"],
  ["EMERGENCY", "Emergency"],
  ["FIRMWARE_UPGRADE", "Firmware Upgrade"],
  ["FIBER", "Fiber Maintenance"],
  ["POWER", "Power Maintenance"],
  ["TOWER", "Tower Maintenance"],
  ["CAPACITY", "Capacity Upgrade"],
  ["SECURITY", "Security Hardening"],
] as const;

export const CHANGE_TYPES = ["STANDARD", "NORMAL", "MAJOR", "EMERGENCY"] as const;

// ── Phase 6: IT/DevOps ──────────────────────────────────────────

export const ENVIRONMENTS = [
  "DEVELOPMENT",
  "TESTING",
  "STAGING",
  "PRODUCTION",
  "DR",
] as const;

// Environment yang boleh menjadi target deployment (DR tidak di-deploy langsung)
export const DEPLOY_ENVIRONMENTS = [
  "DEVELOPMENT",
  "TESTING",
  "STAGING",
  "PRODUCTION",
] as const;

// Deployment ke env ini wajib melalui approval matrix (§48)
export const DEPLOY_ENVS_NEED_APPROVAL = ["STAGING", "PRODUCTION"] as const;

export const IT_TICKET_TYPES = [
  ["LAPTOP_ISSUE", "Laptop Issue"],
  ["ACCOUNT_REQUEST", "Account Request"],
  ["PASSWORD_RESET", "Password Reset"],
  ["EMAIL_ISSUE", "Email Issue"],
  ["PRINTER_ISSUE", "Printer Issue"],
  ["SOFTWARE_INSTALL", "Software Installation"],
  ["ACCESS_REQUEST", "Access Request"],
  ["VPN_ISSUE", "VPN Issue"],
  ["APP_BUG", "Application Bug"],
  ["SERVER_ISSUE", "Server Issue"],
  ["SECURITY_INCIDENT", "Security Incident"],
  ["ONBOARDING", "New Employee Onboarding"],
  ["OFFBOARDING", "Employee Offboarding"],
] as const;

export const IT_TICKET_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export const IT_TICKET_STATUSES = [
  "NEW",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_USER",
  "WAITING_VENDOR",
  "RESOLVED",
  "CLOSED",
] as const;

export const ACCESS_TYPES = [
  ["SERVER", "Server"],
  ["DATABASE", "Database"],
  ["REPOSITORY", "Repository"],
  ["CLOUD", "Cloud"],
  ["NETWORK_DEVICE", "Network Device"],
  ["CRM", "CRM"],
  ["MONITORING", "Monitoring"],
  ["EMAIL", "Email"],
  ["VPN", "VPN"],
  ["DOMAIN", "Domain"],
  ["BILLING", "Billing"],
] as const;

export const BACKUP_TYPES = [
  ["DATABASE", "Database Backup"],
  ["FILE", "File Backup"],
  ["CONFIGURATION", "Configuration Backup"],
  ["VM_SNAPSHOT", "VM Snapshot"],
  ["NETWORK_CONFIG", "Network Configuration Backup"],
  ["OFFSITE", "Offsite Backup"],
] as const;

export const IT_ASSET_TYPES = [
  ["DOMAIN", "Domain"],
  ["SSL_CERT", "SSL Certificate"],
  ["CLOUD_SUBSCRIPTION", "Cloud Subscription"],
  ["VPS", "VPS"],
  ["SOFTWARE_LICENSE", "Software License"],
  ["MONITORING_LICENSE", "Monitoring License"],
  ["EMAIL_SERVICE", "Email Service"],
  ["API_SUBSCRIPTION", "API Subscription"],
] as const;

// ── Phase 7: Integrasi ──────────────────────────────────────────

export const INTEGRATION_CATEGORIES = [
  ["NETWORK", "Jaringan & Monitoring"],
  ["CRM_CUSTOMER", "CRM & Pelanggan"],
  ["ITOPS", "IT/DevOps"],
  ["FINANCE", "Finance"],
] as const;

export const INTEGRATION_PROVIDERS = [
  ["MIKROTIK", "MikroTik"],
  ["RADIUS", "RADIUS"],
  ["RUIJIE", "Ruijie"],
  ["UNIFI", "UniFi"],
  ["ZABBIX", "Zabbix"],
  ["LIBRENMS", "LibreNMS"],
  ["THE_DUDE", "The Dude"],
  ["PROMETHEUS", "Prometheus"],
  ["GRAFANA", "Grafana"],
  ["BILLING", "Billing"],
  ["PAYMENT_GATEWAY", "Payment Gateway"],
  ["WHATSAPP", "WhatsApp Gateway"],
  ["EMAIL", "Email/SMTP"],
  ["MAILCOW", "mailcow (mailserver)"],
  ["AUTHENTIK", "Authentik (penyedia identitas)"],
  ["GITHUB", "GitHub"],
  ["GITLAB", "GitLab"],
  ["SENTRY", "Sentry"],
  ["UPTIME", "Uptime Monitoring"],
  ["ACCOUNTING", "Accounting"],
  ["OTHER", "Lainnya"],
] as const;

export const INTEGRATION_AUTH_TYPES = ["NONE", "API_KEY", "BASIC", "TOKEN"] as const;

// ── Phase 8: Billing & Invoice ──────────────────────────────────

export const INVOICE_TYPES = [
  ["MONTHLY", "Tagihan Bulanan"],
  ["INSTALLATION", "Biaya Instalasi"],
  ["ADDON", "Add-on"],
  ["ADJUSTMENT", "Penyesuaian"],
  ["MANUAL", "Manual"],
] as const;

export const INVOICE_STATUSES = [
  "DRAFT",
  "OPEN",
  "PARTIAL",
  "PAID",
  "VOID",
  "WRITTEN_OFF",
] as const;

export const INVOICE_RUN_STATUSES = ["DRAFT", "PREVIEW", "POSTED", "CANCELLED"] as const;

export const INVOICE_LINE_KINDS = [
  ["PACKAGE", "Paket Internet"],
  ["ADDON", "Add-on"],
  ["INSTALLATION", "Instalasi"],
  ["DISCOUNT", "Diskon"],
  ["ADJUSTMENT", "Penyesuaian"],
] as const;

// ── Phase 9: Payment & Merchant ─────────────────────────────────

export const PAYMENT_METHODS = [
  ["CASH", "Tunai"],
  ["TRANSFER", "Transfer Bank"],
  ["GATEWAY", "Payment Gateway"],
] as const;

export const GATEWAY_PROVIDERS = [
  ["WINPAY", "Winpay"],
  ["DUITKU", "Duitku"],
  ["TRIPAY", "Tripay"],
  ["OTHER", "Lainnya"],
] as const;

export const GATEWAY_TX_STATUSES = [
  "PENDING",
  "PAID",
  "EXPIRED",
  "CANCELLED",
  "FAILED",
] as const;

// ── Phase 15: Kanal Pelanggan ───────────────────────────────────

// Preferensi notifikasi pelanggan (meniru sistem lama: None|WA|Email|App).
export const CUSTOMER_CHANNELS = [
  ["NONE", "Tidak menerima"],
  ["WHATSAPP", "WhatsApp"],
  ["EMAIL", "Email"],
  ["APP", "Aplikasi Pelanggan"],
] as const;

// Kanal yang bisa dikirimi pesan (NONE bukan kanal kirim).
export const MESSAGE_CHANNELS = [
  ["WHATSAPP", "WhatsApp"],
  ["EMAIL", "Email"],
  ["APP", "Aplikasi Pelanggan"],
] as const;

export const OUTBOUND_STATUSES = ["QUEUED", "SENDING", "SENT", "FAILED", "SKIPPED"] as const;

// ── Phase 14: HRD & Absensi ─────────────────────────────────────

export const EMPLOYEE_TYPES = [
  ["FULL_TIME", "Karyawan Tetap"],
  ["PART_TIME", "Paruh Waktu"],
  ["CONTRACT", "Kontrak"],
  ["PROBATION", "Masa Percobaan"],
] as const;

/// Jenis kepegawaian yang mensyaratkan masa kontrak. Dipakai bersama oleh
/// validasi (contractRejection) dan UI (kapan blok tanggal ditampilkan),
/// supaya keduanya tidak bisa berbeda pendapat.
export const CONTRACTED_EMPLOYEE_TYPES = ["CONTRACT"] as const;

// Fase 41 — pola kerja. Dibedakan dari ada/tidaknya ShiftSchedule: pekerja
// non-shift pun sesekali bisa dijadwalkan, jadi jadwal bukan penanda yang sah.
export const WORK_PATTERNS = [
  ["NON_SHIFT", "Non-Shift"],
  ["SHIFT", "Shift"],
] as const;

// Fase 41 — jenjang jabatan. BUKAN User.level: yang itu hierarki persetujuan.
//
// Fase 52 — SUPERVISOR dan CEO ditambahkan. Catatan asli di sini menulis nilai
// lain "ditambah saat memang dibutuhkan"; berkas HRD yang pertama memang
// memakai keempatnya. Menyeragamkannya menjadi dua akan meratakan struktur
// jenjang PerumNet — Supervisor dan Leader tak lagi bisa dibedakan, dan itu
// tidak bisa dikembalikan setelah datanya masuk.
//
// Urutannya urutan TAMPIL, bukan peringkat: tidak ada satu pun kode yang
// membandingkan nilai ini. Kewenangan tetap dari User.level dan peran.
export const JOB_LEVELS = [
  ["STAFF", "Staff"],
  ["LEADER", "Leader"],
  ["SUPERVISOR", "Supervisor"],
  ["CEO", "CEO"],
] as const;

// Fase 59 — data diri yang dicocokkan HRD dengan dokumen.
//
// Urutannya urutan JENJANG, bukan sekadar tampilan — dan itu satu-satunya
// tempat urutan ini berarti. Tidak ada kode yang membandingkannya.
export const EDUCATION_LEVELS = [
  ["SD", "SD / sederajat"],
  ["SMP", "SMP / sederajat"],
  ["SMA", "SMA / SMK / sederajat"],
  ["D1", "D1"],
  ["D2", "D2"],
  ["D3", "D3"],
  ["D4", "D4 / Sarjana Terapan"],
  ["S1", "S1"],
  ["S2", "S2"],
  ["S3", "S3"],
] as const;

// DATA KESEHATAN. Tidak pernah ikut ke halaman verifikasi kartu publik, daftar
// pegawai, maupun ekspor umum — tempatnya hanya detail pegawai (hrd.view) dan
// profil orangnya sendiri.
//
// "Tidak diketahui" ADA dengan sengaja: memaksa memilih golongan darah membuat
// orang menebak, dan golongan darah yang salah lebih berbahaya daripada yang
// kosong.
export const BLOOD_TYPES = [
  ["A_POS", "A+"],
  ["A_NEG", "A−"],
  ["B_POS", "B+"],
  ["B_NEG", "B−"],
  ["AB_POS", "AB+"],
  ["AB_NEG", "AB−"],
  ["O_POS", "O+"],
  ["O_NEG", "O−"],
  ["UNKNOWN", "Tidak diketahui"],
] as const;

export const DAY_TYPES = [
  ["WORK", "Kerja"],
  ["OFF", "Libur"],
  ["HOLIDAY", "Hari Besar"],
] as const;

export const ATTENDANCE_STATUSES = ["PRESENT", "LATE", "ABSENT", "LEAVE", "SICK", "HOLIDAY"] as const;

export const LEAVE_TYPES = [
  ["ANNUAL", "Cuti Tahunan"],
  ["SICK", "Sakit"],
  ["OTHER", "Izin Lainnya"],
] as const;

// ── Phase 13: FTTH Port Management ──────────────────────────────

export const OLT_VENDORS = [
  ["ZTE", "ZTE"],
  ["HUAWEI", "Huawei"],
  ["CDATA", "C-Data"],
  ["HSGQ", "HSGQ"],
  ["FIBERHOME", "Fiberhome"],
  ["VSOL", "VSOL"],
  ["HIOSO", "HIOSO"],
  ["OTHER", "Lainnya"],
] as const;

export const ODP_PORT_STATUSES = ["FREE", "USED", "RESERVED", "DAMAGED"] as const;

// ── Phase 12: Helpdesk Pelanggan ────────────────────────────────

export const CTICKET_STATUSES = ["OPEN", "IN_PROGRESS", "PENDING", "SOLVED", "CLOSED"] as const;
export const CTICKET_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

// ── Phase 11: General Ledger ────────────────────────────────────

// Kategori akun (§3.3 sistem lama) + sisi normal saldonya.
export const ACCOUNT_CATEGORIES = [
  ["KAS_BANK", "Kas & Bank", "DEBIT"],
  ["PIUTANG", "Piutang", "DEBIT"],
  ["PERSEDIAAN", "Persediaan", "DEBIT"],
  ["AKTIVA_LANCAR_LAIN", "Aktiva Lancar Lainnya", "DEBIT"],
  ["AKTIVA_TETAP", "Aktiva Tetap", "DEBIT"],
  ["DEPRESIASI", "Depresiasi & Amortisasi", "CREDIT"],
  ["AKTIVA_LAIN", "Aktiva Lainnya", "DEBIT"],
  ["HUTANG", "Hutang", "CREDIT"],
  ["KEWAJIBAN_LANCAR_LAIN", "Kewajiban Lancar Lainnya", "CREDIT"],
  ["KEWAJIBAN_JK_PANJANG", "Kewajiban Jangka Panjang", "CREDIT"],
  ["EKUITAS", "Ekuitas", "CREDIT"],
  ["PENDAPATAN", "Pendapatan", "CREDIT"],
  ["PENDAPATAN_LAIN", "Pendapatan Lainnya", "CREDIT"],
  ["BEBAN", "Beban", "DEBIT"],
] as const;

// Kelompok neraca vs laba rugi (untuk laporan).
export const BALANCE_SHEET_ASSET_CATS = [
  "KAS_BANK", "PIUTANG", "PERSEDIAAN", "AKTIVA_LANCAR_LAIN",
  "AKTIVA_TETAP", "DEPRESIASI", "AKTIVA_LAIN",
] as const;
export const BALANCE_SHEET_LIABILITY_CATS = [
  "HUTANG", "KEWAJIBAN_LANCAR_LAIN", "KEWAJIBAN_JK_PANJANG",
] as const;
export const INCOME_CATS = ["PENDAPATAN", "PENDAPATAN_LAIN"] as const;
export const EXPENSE_CATS = ["BEBAN"] as const;

export const POSTING_EVENTS = [
  ["INVOICE_POSTED", "Invoice terbit (Piutang → Pendapatan)"],
  ["INVOICE_TAX", "PPN Keluaran invoice"],
  ["PAYMENT_RECEIVED", "Pembayaran diterima (Kas → Piutang)"],
  ["COLLECTOR_FEE", "Komisi kolektor diakui (Beban Fee → Hutang Fee)"],
  ["GATEWAY_FEE", "Biaya payment gateway"],
] as const;

// ── Phase 10: Isolir & Dunning ──────────────────────────────────

export const SUSPENSION_REASONS = [
  ["OVERDUE", "Tunggakan"],
  ["REQUEST", "Permintaan Pelanggan"],
  ["ABUSE", "Penyalahgunaan"],
  ["MAINTENANCE", "Maintenance"],
] as const;

export const ACCESS_JOB_ACTIONS = ["ENABLE", "DISABLE", "CREATE", "UPDATE", "DELETE", "SYNC"] as const;

export const ACCESS_JOB_STATUSES = ["QUEUED", "RUNNING", "SUCCESS", "FAILED", "SKIPPED"] as const;

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
  // Phase 3
  POSTED: "Posted",
  REVERSED: "Di-reverse",
  AVAILABLE: "Tersedia",
  IN_CUSTODY: "Dibawa Teknisi",
  INSTALLED: "Terpasang",
  UNDER_INSPECTION: "Inspeksi Write-off",
  DAMAGED: "Rusak",
  SCRAPPED: "Scrap",
  // Fase 17 — transfer antar gudang
  IN_TRANSIT: "Dalam Perjalanan",
  // Fase 29–32 — terminasi & recovery
  EFFECTIVE: "Berlaku",
  RECOVERED: "Tertarik Penuh",
  INSPECTION: "Inspeksi Gudang",
  CLOSED_UNRECOVERED: "Ditutup — Tidak Kembali",
  PICKED_UP: "Diambil Teknisi",
  RECEIVED: "Diterima Gudang",
  INSPECTED: "Sudah Diinspeksi",
  NOT_RETURNED: "Tidak Kembali",
  LAYAK_DIGUNAKAN: "Layak Digunakan",
  PERLU_PERBAIKAN: "Perlu Perbaikan",
  RUSAK: "Rusak",
  SCRAP: "Scrap",
  TIDAK_KEMBALI: "Tidak Kembali",
  CUSTOMER_REQUEST: "Permintaan Pelanggan",
  NON_PAYMENT: "Tunggakan",
  RELOCATION: "Pindah Alamat",
  FRAUD: "Pelanggaran / Fraud",
  // Fase 28 — terminasi & recovery perangkat
  RECOVERY_PENDING: "Menunggu Penarikan",
  RETURN_IN_TRANSIT: "Perjalanan Pulang",
  QUARANTINED: "Karantina",
  RMA: "RMA ke Vendor",
  OPEN: "Terbuka",
  CLOSED: "Ditutup",
  SERIALIZED: "Serialized",
  BULK: "Bulk",
  NEW_INSTALLATION: "Instalasi Baru",
  TROUBLESHOOTING: "Troubleshooting",
  DEVICE_REPLACEMENT: "Penggantian Perangkat",
  DEVICE_RETRIEVAL: "Penarikan Perangkat",
  MAINTENANCE: "Maintenance",
  // Phase 4
  SETTLED: "Selesai Dipertanggungjawabkan",
  OUTSTANDING: "Belum Selesai",
  OVERDUE: "Jatuh Tempo",
  DAILY: "Harian",
  MONTHLY: "Bulanan",
  // Phase 5
  PLANNED: "Direncanakan",
  DEGRADED: "Menurun",
  DOWN: "Down",
  ALLOCATED: "Teralokasi",
  RELEASED: "Dilepas",
  INFORMATIONAL: "Informational",
  WARNING: "Warning",
  MINOR: "Minor",
  MAJOR: "Major",
  CRITICAL: "Critical",
  DETECTED: "Terdeteksi",
  ACKNOWLEDGED: "Di-acknowledge",
  INVESTIGATING: "Investigasi",
  MITIGATING: "Mitigasi",
  RESOLVED: "Pulih",
  PENDING_REVIEW: "Menunggu Post-Review",
  FAILED: "Gagal",
  STANDARD: "Standard",
  NORMAL: "Normal",
  EMERGENCY: "Emergency",
  P1: "P1 — Critical",
  P2: "P2 — Major",
  P3: "P3 — Minor",
  P4: "P4 — Informational",
  // Phase 6 — IT/DevOps
  DEVELOPMENT: "Development",
  TESTING: "Testing",
  STAGING: "Staging",
  PRODUCTION: "Production",
  DR: "Disaster Recovery",
  DECOMMISSIONED: "Decommissioned",
  DEPRECATED: "Deprecated",
  MONITORED: "Termonitor",
  UNMONITORED: "Tidak Termonitor",
  URGENT: "Urgent",
  WAITING_USER: "Menunggu User",
  WAITING_VENDOR: "Menunggu Vendor",
  GRANTED: "Diberikan",
  REVOKED: "Dicabut",
  READY: "Siap Dieksekusi",
  ROLLED_BACK: "Di-rollback",
  SUCCESS: "Sukses",
  // Phase 8 — Billing
  OPEN_INVOICE: "Belum Dibayar", // alias tampilan (kode OPEN dipakai WO)
  PARTIAL: "Dibayar Sebagian",
  PAID: "Lunas",
  VOID: "Void",
  WRITTEN_OFF: "Dihapusbukukan",
  PREVIEW: "Preview",
  PENDING: "Menunggu",
  APPROVED: "Disetujui",
  // Phase 10
  QUEUED: "Antri",
  RUNNING: "Berjalan",
  SKIPPED: "Dilewati",
  SOLVED: "Terselesaikan",
  FREE: "Kosong",
  USED: "Terpakai",
  RESERVED: "Dicadangkan",
  // Phase 14 — HRD
  PRESENT: "Hadir",
  LATE: "Terlambat",
  ABSENT: "Tanpa Keterangan",
  LEAVE: "Cuti/Izin",
  SICK: "Sakit",
  HOLIDAY: "Libur",
  WORK: "Kerja",
  OFF: "Libur",
  FULL_TIME: "Full Time",
  PART_TIME: "Part Time",
  CONTRACT: "Kontrak",
  PROBATION: "Probation",
  ANNUAL: "Cuti Tahunan",
  // Phase 15
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  APP: "Aplikasi",
  NONE: "Tidak menerima",
  SENDING: "Mengirim",
  ENABLE: "Aktifkan",
  DISABLE: "Blokir",
  SYNC: "Sinkronisasi",
  // (MONTHLY sudah ada di atas — label invoice memakai INVOICE_TYPES)
};

export function statusLabel(code: string | null | undefined): string {
  if (!code) return "-";
  return STATUS_LABELS[code] ?? code;
}

/// Beberapa kode status berarti hal berbeda tergantung modul: PARTIAL di
/// billing berarti "dibayar sebagian", di recovery berarti "sebagian
/// perangkat tertarik". STATUS_LABELS global tidak bisa memuat keduanya,
/// jadi modul recovery memakai peta sendiri lalu jatuh ke peta global.
const RECOVERY_STATUS_LABELS: Record<string, string> = {
  ASSIGNED: "Ditugaskan ke Teknisi",
  IN_PROGRESS: "Penarikan Berjalan",
  PARTIAL: "Sebagian Tertarik",
  COMPLETED: "Selesai",
};

export function recoveryStatusLabel(code: string | null | undefined): string {
  if (!code) return "-";
  return RECOVERY_STATUS_LABELS[code] ?? statusLabel(code);
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
