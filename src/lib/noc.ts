import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { notifyPermission } from "@/lib/notify";
import { submitApprovalRequest } from "@/lib/approval";
import {
  PERMISSIONS,
  INCIDENT_SEVERITIES,
  MAJOR_INCIDENT_SEVERITIES,
  ALARM_SEVERITIES,
  CHANGE_TYPES,
  statusLabel,
} from "@/lib/constants";
import type { CurrentUser } from "@/lib/rbac";

// ── NOC Engine (PRD §28–35, §53) ────────────────────────────────
// Aturan yang ditegakkan DI SINI, bukan di UI:
//  - IP tidak boleh duplikat (rule 18); IP wajib tertaut perangkat/layanan
//    atau reserved dengan tujuan; IP harus berada dalam subnet-nya (§29).
//  - Incident wajib severity (rule 19) + PIC saat acknowledge; timeline
//    append-only; tidak bisa ditutup tanpa timeline, root cause, resolution,
//    dan verifikasi pemulihan (§32.4). Incident besar (P1/P2) wajib
//    preventive action (root cause review — rule 20) dan hanya bisa
//    ditutup pemegang incidents.close (§6.13).
//  - Change: rollback plan wajib kecuali STANDARD (rule 21); tidak dapat
//    dieksekusi tanpa approval (rule 22); EMERGENCY wajib post-review (rule 23).

type Result<T = undefined> =
  | { ok: true; id: string; data?: T }
  | { ok: false; error: string };

function monthPrefix(base: string): string {
  const now = new Date();
  return `${base}-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

async function nextNumber(
  base: string,
  count: (prefix: string) => Promise<number>
): Promise<string> {
  const prefix = monthPrefix(base);
  const n = await count(prefix);
  return `${prefix}-${String(n + 1).padStart(4, "0")}`;
}

// ── IPAM (PRD §29) ──────────────────────────────────────────────

const CIDR_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;
const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function ipToInt(ip: string): number | null {
  const m = ip.match(IPV4_RE);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

export function cidrContains(cidr: string, ip: string): boolean | null {
  const m = cidr.match(CIDR_RE);
  const ipInt = ipToInt(ip);
  if (!m || ipInt === null) return null;
  const prefixLen = Number(m[5]);
  if (prefixLen > 32) return null;
  const baseInt = ipToInt(`${m[1]}.${m[2]}.${m[3]}.${m[4]}`);
  if (baseInt === null) return null;
  const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

export async function createSubnet(
  user: CurrentUser,
  data: {
    cidr: string;
    name: string;
    vlan?: string;
    gateway?: string;
    purpose: string;
    ownerId?: string;
    siteId?: string;
    notes?: string;
  }
): Promise<Result> {
  const cidr = data.cidr.trim();
  const cm = cidr.match(CIDR_RE);
  // Oktet wajib 0–255 dan prefix ≤ 32 (regex saja tidak cukup).
  if (!cm || ipToInt(`${cm[1]}.${cm[2]}.${cm[3]}.${cm[4]}`) === null || Number(cm[5]) > 32) {
    return { ok: false, error: "Format CIDR tidak valid (contoh: 10.10.0.0/24)." };
  }
  if (!data.purpose?.trim()) {
    return { ok: false, error: "Subnet wajib memiliki tujuan (PRD §29)." };
  }
  const dup = await db.subnet.findUnique({ where: { cidr } });
  if (dup) return { ok: false, error: `Subnet ${cidr} sudah terdaftar.` };
  if (data.gateway && cidrContains(cidr, data.gateway.trim()) !== true) {
    return { ok: false, error: "Gateway tidak valid atau berada di luar subnet." };
  }

  const subnet = await db.subnet.create({
    data: {
      cidr,
      name: data.name,
      vlan: data.vlan || null,
      gateway: data.gateway?.trim() || null,
      purpose: data.purpose,
      ownerId: data.ownerId || null,
      siteId: data.siteId || null,
      notes: data.notes || null,
    },
  });
  await logAudit({
    userId: user.id,
    action: "SUBNET_CREATE",
    module: "noc",
    entityType: "Subnet",
    entityId: subnet.id,
    description: `Membuat subnet ${cidr} (${data.name})`,
  });
  return { ok: true, id: subnet.id };
}

export async function allocateIp(
  user: CurrentUser,
  data: {
    subnetId: string;
    address: string;
    status?: "ALLOCATED" | "RESERVED";
    deviceId?: string;
    subscriptionId?: string;
    description?: string;
  }
): Promise<Result> {
  const subnet = await db.subnet.findUnique({ where: { id: data.subnetId } });
  if (!subnet) return { ok: false, error: "Subnet tidak ditemukan." };

  const address = data.address.trim();
  if (ipToInt(address) === null) {
    return { ok: false, error: "Format IP tidak valid." };
  }
  if (cidrContains(subnet.cidr, address) === false) {
    return { ok: false, error: `IP ${address} berada di luar subnet ${subnet.cidr}.` };
  }
  const status = data.status ?? "ALLOCATED";
  // §29 rule 2: IP harus terhubung dengan perangkat atau layanan.
  if (status === "ALLOCATED" && !data.deviceId && !data.subscriptionId) {
    return {
      ok: false,
      error: "IP teralokasi wajib tertaut perangkat atau subscription (PRD §29). Gunakan Reserved bila belum.",
    };
  }
  if (status === "RESERVED" && !data.description?.trim()) {
    return { ok: false, error: "IP reserved wajib memiliki keterangan tujuan." };
  }

  // Rule 18: duplikat ditolak; IP berstatus RELEASED boleh dipakai ulang
  // (riwayat assignment tetap tercatat di audit log).
  const existing = await db.iPAddress.findUnique({ where: { address } });
  if (existing && existing.status !== "RELEASED") {
    return { ok: false, error: `IP ${address} sudah dipakai (duplikat ditolak — rule 18).` };
  }

  const payload = {
    subnetId: data.subnetId,
    status,
    assignedType: data.deviceId ? "DEVICE" : data.subscriptionId ? "SUBSCRIPTION" : "OTHER",
    deviceId: data.deviceId || null,
    subscriptionId: data.subscriptionId || null,
    description: data.description || null,
    assignedAt: new Date(),
    releasedAt: null,
    createdById: user.id,
  };
  const ip = existing
    ? await db.iPAddress.update({ where: { id: existing.id }, data: payload })
    : await db.iPAddress.create({ data: { address, ...payload } });

  await logAudit({
    userId: user.id,
    action: "IP_ALLOCATE",
    module: "noc",
    entityType: "IPAddress",
    entityId: ip.id,
    description: `${existing ? "Realokasi" : "Alokasi"} IP ${address} (${statusLabel(status)})`,
    metadata: { deviceId: data.deviceId, subscriptionId: data.subscriptionId },
  });
  return { ok: true, id: ip.id };
}

export async function releaseIp(user: CurrentUser, ipId: string): Promise<Result> {
  const ip = await db.iPAddress.findUnique({ where: { id: ipId } });
  if (!ip) return { ok: false, error: "IP tidak ditemukan." };
  if (ip.status === "RELEASED") return { ok: false, error: "IP sudah dilepas." };
  await db.iPAddress.update({
    where: { id: ipId },
    data: {
      status: "RELEASED",
      releasedAt: new Date(),
      deviceId: null,
      subscriptionId: null,
    },
  });
  await logAudit({
    userId: user.id,
    action: "IP_RELEASE",
    module: "noc",
    entityType: "IPAddress",
    entityId: ipId,
    description: `Melepas IP ${ip.address}`,
  });
  return { ok: true, id: ipId };
}

// ── Alarm (PRD §31) ─────────────────────────────────────────────

export async function createAlarm(
  user: CurrentUser,
  data: {
    severity: string;
    message: string;
    deviceId?: string;
    siteId?: string;
  }
): Promise<Result> {
  if (!ALARM_SEVERITIES.includes(data.severity as never)) {
    return { ok: false, error: "Severity alarm tidak valid." };
  }
  if (!data.message?.trim()) return { ok: false, error: "Pesan alarm wajib diisi." };

  const alarmNumber = await nextNumber("ALM", (p) =>
    db.networkAlarm.count({ where: { alarmNumber: { startsWith: p } } })
  );
  const alarm = await db.networkAlarm.create({
    data: {
      alarmNumber,
      severity: data.severity,
      message: data.message,
      deviceId: data.deviceId || null,
      siteId: data.siteId || null,
      createdById: user.id,
    },
  });
  await logAudit({
    userId: user.id,
    action: "ALARM_CREATE",
    module: "noc",
    entityType: "NetworkAlarm",
    entityId: alarm.id,
    description: `Alarm ${alarmNumber} (${statusLabel(data.severity)}): ${data.message}`,
  });
  return { ok: true, id: alarm.id };
}

export async function ackAlarm(user: CurrentUser, alarmId: string): Promise<Result> {
  const alarm = await db.networkAlarm.findUnique({ where: { id: alarmId } });
  if (!alarm) return { ok: false, error: "Alarm tidak ditemukan." };
  if (alarm.acknowledgedAt) return { ok: false, error: "Alarm sudah di-acknowledge." };
  await db.networkAlarm.update({
    where: { id: alarmId },
    data: { acknowledgedById: user.id, acknowledgedAt: new Date() },
  });
  await logAudit({
    userId: user.id,
    action: "ALARM_ACK",
    module: "noc",
    entityType: "NetworkAlarm",
    entityId: alarmId,
    description: `Acknowledge alarm ${alarm.alarmNumber}`,
  });
  return { ok: true, id: alarmId };
}

export async function clearAlarm(user: CurrentUser, alarmId: string): Promise<Result> {
  const alarm = await db.networkAlarm.findUnique({ where: { id: alarmId } });
  if (!alarm) return { ok: false, error: "Alarm tidak ditemukan." };
  if (alarm.clearedAt) return { ok: false, error: "Alarm sudah clear." };
  await db.networkAlarm.update({
    where: { id: alarmId },
    data: { clearedAt: new Date() },
  });
  await logAudit({
    userId: user.id,
    action: "ALARM_CLEAR",
    module: "noc",
    entityType: "NetworkAlarm",
    entityId: alarmId,
    description: `Clear alarm ${alarm.alarmNumber}`,
  });
  return { ok: true, id: alarmId };
}

// ── Incident (PRD §32) ──────────────────────────────────────────

export async function createIncident(
  user: CurrentUser,
  data: {
    title: string;
    type: string;
    severity: string;
    isOutage?: boolean;
    deviceId?: string;
    linkId?: string;
    siteId?: string;
    areaId?: string;
    alarmId?: string;
    workOrderId?: string;
    initialNote?: string;
  }
): Promise<Result> {
  // Rule 19: incident wajib severity.
  if (!INCIDENT_SEVERITIES.includes(data.severity as never)) {
    return { ok: false, error: "Incident wajib memiliki severity P1–P4 (business rule 19)." };
  }
  if (!data.title?.trim()) return { ok: false, error: "Judul incident wajib diisi." };

  const incidentNumber = await nextNumber("INC", (p) =>
    db.incident.count({ where: { incidentNumber: { startsWith: p } } })
  );
  const incident = await db.incident.create({
    data: {
      incidentNumber,
      title: data.title,
      type: data.type,
      severity: data.severity,
      isOutage: data.isOutage ?? false,
      deviceId: data.deviceId || null,
      linkId: data.linkId || null,
      siteId: data.siteId || null,
      areaId: data.areaId || null,
      workOrderId: data.workOrderId || null,
      createdById: user.id,
      updates: {
        create: {
          note: data.initialNote?.trim() || `Incident dibuat (${statusLabel(data.severity)})`,
          status: "DETECTED",
          byUserId: user.id,
        },
      },
    },
  });
  if (data.alarmId) {
    await db.networkAlarm.update({
      where: { id: data.alarmId },
      data: { incidentId: incident.id },
    });
  }
  await logAudit({
    userId: user.id,
    action: "INCIDENT_CREATE",
    module: "noc",
    entityType: "Incident",
    entityId: incident.id,
    description: `Membuat ${incidentNumber} [${data.severity}] ${data.title}`,
  });
  if (MAJOR_INCIDENT_SEVERITIES.includes(data.severity as never)) {
    // §50: incident besar — tim NOC harus tahu segera.
    await notifyPermission(
      PERMISSIONS.INCIDENTS_MANAGE,
      {
        type: "INCIDENT_MAJOR",
        title: `Incident ${data.severity}: ${data.title}`,
        body: `${incidentNumber}${data.isOutage ? " — OUTAGE" : ""}`,
        link: `/noc/incidents/${incident.id}`,
        module: "noc",
      },
      user.id
    );
  }
  return { ok: true, id: incident.id };
}

export async function ackIncident(user: CurrentUser, incidentId: string): Promise<Result> {
  const incident = await db.incident.findUnique({ where: { id: incidentId } });
  if (!incident) return { ok: false, error: "Incident tidak ditemukan." };
  if (incident.status !== "DETECTED") {
    return { ok: false, error: "Incident sudah di-acknowledge." };
  }
  await db.incident.update({
    where: { id: incidentId },
    data: {
      status: "ACKNOWLEDGED",
      acknowledgedAt: new Date(),
      picId: incident.picId ?? user.id, // incident wajib PIC
      updates: {
        create: { note: `Acknowledged oleh ${user.name} — menjadi PIC`, status: "ACKNOWLEDGED", byUserId: user.id },
      },
    },
  });
  await logAudit({
    userId: user.id,
    action: "INCIDENT_ACK",
    module: "noc",
    entityType: "Incident",
    entityId: incidentId,
    description: `Acknowledge ${incident.incidentNumber}`,
  });
  return { ok: true, id: incidentId };
}

export async function addIncidentUpdate(
  user: CurrentUser,
  incidentId: string,
  note: string,
  newStatus?: "INVESTIGATING" | "MITIGATING"
): Promise<Result> {
  const incident = await db.incident.findUnique({ where: { id: incidentId } });
  if (!incident) return { ok: false, error: "Incident tidak ditemukan." };
  if (["RESOLVED", "CLOSED"].includes(incident.status)) {
    return { ok: false, error: "Incident sudah selesai — timeline terkunci." };
  }
  if (!note?.trim()) return { ok: false, error: "Catatan update wajib diisi." };
  if (incident.status === "DETECTED") {
    return { ok: false, error: "Acknowledge incident terlebih dahulu." };
  }
  await db.incident.update({
    where: { id: incidentId },
    data: {
      status: newStatus ?? incident.status,
      updates: { create: { note, status: newStatus ?? incident.status, byUserId: user.id } },
    },
  });
  await logAudit({
    userId: user.id,
    action: "INCIDENT_UPDATE",
    module: "noc",
    entityType: "Incident",
    entityId: incidentId,
    description: `Update ${incident.incidentNumber}${newStatus ? ` → ${statusLabel(newStatus)}` : ""}`,
  });
  return { ok: true, id: incidentId };
}

export async function setImpactedSubscriptions(
  user: CurrentUser,
  incidentId: string,
  subscriptionIds: string[]
): Promise<Result> {
  const incident = await db.incident.findUnique({ where: { id: incidentId } });
  if (!incident) return { ok: false, error: "Incident tidak ditemukan." };
  if (incident.status === "CLOSED") return { ok: false, error: "Incident sudah ditutup." };
  await db.$transaction([
    db.incidentSubscription.deleteMany({ where: { incidentId } }),
    db.incidentSubscription.createMany({
      data: subscriptionIds.map((subscriptionId) => ({ incidentId, subscriptionId })),
    }),
  ]);
  await logAudit({
    userId: user.id,
    action: "INCIDENT_IMPACT_SET",
    module: "noc",
    entityType: "Incident",
    entityId: incidentId,
    description: `${incident.incidentNumber}: ${subscriptionIds.length} pelanggan terdampak ditandai`,
  });
  return { ok: true, id: incidentId };
}

export async function resolveIncident(
  user: CurrentUser,
  incidentId: string,
  resolution: string,
  recoveryNote: string
): Promise<Result> {
  const incident = await db.incident.findUnique({ where: { id: incidentId } });
  if (!incident) return { ok: false, error: "Incident tidak ditemukan." };
  if (!["ACKNOWLEDGED", "INVESTIGATING", "MITIGATING"].includes(incident.status)) {
    return { ok: false, error: "Incident tidak dalam status penanganan." };
  }
  if (!resolution?.trim()) return { ok: false, error: "Resolusi wajib diisi (§32.4)." };
  if (!recoveryNote?.trim()) {
    return { ok: false, error: "Verifikasi pemulihan layanan wajib diisi (§32.4)." };
  }
  await db.incident.update({
    where: { id: incidentId },
    data: {
      status: "RESOLVED",
      resolvedAt: new Date(),
      resolution,
      recoveryNote,
      updates: {
        create: { note: `Pulih — ${resolution} | Verifikasi: ${recoveryNote}`, status: "RESOLVED", byUserId: user.id },
      },
    },
  });
  await logAudit({
    userId: user.id,
    action: "INCIDENT_RESOLVE",
    module: "noc",
    entityType: "Incident",
    entityId: incidentId,
    description: `Resolve ${incident.incidentNumber}`,
  });
  if (incident.isOutage && incident.isPublic) {
    // §33/§50: outage yang dipublikasikan pulih — CS/Sales/Management tahu.
    await notifyPermission(
      PERMISSIONS.OUTAGES_VIEW,
      {
        type: "OUTAGE_RESOLVED",
        title: `Gangguan pulih: ${incident.title}`,
        body: `${incident.incidentNumber} — ${resolution}`,
        link: "/outages",
        module: "noc",
      },
      user.id
    );
  }
  return { ok: true, id: incidentId };
}

export async function closeIncident(
  user: CurrentUser,
  incidentId: string,
  rootCause: string,
  preventiveAction?: string
): Promise<Result> {
  const incident = await db.incident.findUnique({
    where: { id: incidentId },
    include: { _count: { select: { updates: true } } },
  });
  if (!incident) return { ok: false, error: "Incident tidak ditemukan." };
  if (incident.status !== "RESOLVED") {
    return { ok: false, error: "Incident harus resolved (recovery terverifikasi) sebelum ditutup." };
  }
  if (!rootCause?.trim()) {
    return { ok: false, error: "Root cause wajib diisi sebelum penutupan (§32.4)." };
  }
  if (incident._count.updates === 0) {
    return { ok: false, error: "Incident tanpa timeline tidak dapat ditutup (§32.4)." };
  }
  const isMajor = MAJOR_INCIDENT_SEVERITIES.includes(incident.severity as never);
  if (isMajor) {
    // Rule 20 + §6.13: incident besar wajib root cause review & ditutup manager.
    if (!user.permissions.has(PERMISSIONS.INCIDENTS_CLOSE)) {
      return {
        ok: false,
        error: `Incident ${incident.severity} hanya dapat ditutup NOC Manager setelah verifikasi (§6.13).`,
      };
    }
    if (!preventiveAction?.trim()) {
      return {
        ok: false,
        error: "Incident besar wajib memiliki preventive action (root cause review — rule 20).",
      };
    }
  }
  await db.incident.update({
    where: { id: incidentId },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
      rootCause,
      preventiveAction: preventiveAction?.trim() || incident.preventiveAction,
      updates: {
        create: { note: `Ditutup — root cause: ${rootCause}`, status: "CLOSED", byUserId: user.id },
      },
    },
  });
  await logAudit({
    userId: user.id,
    action: "INCIDENT_CLOSE",
    module: "noc",
    entityType: "Incident",
    entityId: incidentId,
    description: `Menutup ${incident.incidentNumber} [${incident.severity}]`,
  });
  return { ok: true, id: incidentId };
}

// ── Maintenance (PRD §34) ───────────────────────────────────────

export async function createMaintenance(
  user: CurrentUser,
  data: {
    title: string;
    type: string;
    siteId?: string;
    deviceId?: string;
    purpose: string;
    risk: string;
    scheduledStart: Date;
    scheduledEnd: Date;
    estDowntimeMin?: number;
    picId: string;
  }
): Promise<Result> {
  if (!data.purpose?.trim() || !data.risk?.trim()) {
    return { ok: false, error: "Tujuan dan risiko maintenance wajib diisi (PRD §34)." };
  }
  if (data.scheduledEnd <= data.scheduledStart) {
    return { ok: false, error: "Jadwal selesai harus setelah jadwal mulai." };
  }
  const maintNumber = await nextNumber("MNT", (p) =>
    db.networkMaintenance.count({ where: { maintNumber: { startsWith: p } } })
  );
  const maint = await db.networkMaintenance.create({
    data: {
      maintNumber,
      title: data.title,
      type: data.type,
      siteId: data.siteId || null,
      deviceId: data.deviceId || null,
      purpose: data.purpose,
      risk: data.risk,
      scheduledStart: data.scheduledStart,
      scheduledEnd: data.scheduledEnd,
      estDowntimeMin: data.estDowntimeMin ?? null,
      picId: data.picId,
      createdById: user.id,
    },
  });
  await logAudit({
    userId: user.id,
    action: "MAINT_CREATE",
    module: "noc",
    entityType: "NetworkMaintenance",
    entityId: maint.id,
    description: `Membuat maintenance ${maintNumber}: ${data.title}`,
  });
  return { ok: true, id: maint.id };
}

export async function submitMaintenance(user: CurrentUser, maintId: string): Promise<Result> {
  const maint = await db.networkMaintenance.findUnique({ where: { id: maintId } });
  if (!maint) return { ok: false, error: "Maintenance tidak ditemukan." };
  if (maint.status !== "DRAFT") return { ok: false, error: "Hanya draft yang bisa diajukan." };

  const approval = await submitApprovalRequest({
    user,
    module: "network_maintenance",
    title: `Maintenance ${maint.maintNumber}: ${maint.title}`,
    description: `${maint.purpose} | Risiko: ${maint.risk}`,
    entityType: "NetworkMaintenance",
    entityId: maint.id,
  });
  if (!approval.ok) return approval;

  await db.networkMaintenance.update({
    where: { id: maintId },
    data: { status: "WAITING_APPROVAL", approvalRequestId: approval.id },
  });
  await logAudit({
    userId: user.id,
    action: "MAINT_SUBMIT",
    module: "noc",
    entityType: "NetworkMaintenance",
    entityId: maintId,
    description: `Mengajukan maintenance ${maint.maintNumber}`,
  });
  return { ok: true, id: maintId };
}

async function approvalApproved(approvalRequestId: string | null): Promise<boolean> {
  if (!approvalRequestId) return false;
  const approval = await db.approvalRequest.findUnique({ where: { id: approvalRequestId } });
  return approval?.status === "APPROVED";
}

export async function startMaintenance(user: CurrentUser, maintId: string): Promise<Result> {
  const maint = await db.networkMaintenance.findUnique({ where: { id: maintId } });
  if (!maint) return { ok: false, error: "Maintenance tidak ditemukan." };
  if (maint.status !== "WAITING_APPROVAL") {
    return { ok: false, error: "Maintenance tidak dalam antrian pelaksanaan." };
  }
  if (!(await approvalApproved(maint.approvalRequestId))) {
    return { ok: false, error: "Maintenance belum disetujui — tidak dapat dimulai." };
  }
  await db.networkMaintenance.update({
    where: { id: maintId },
    data: { status: "IN_PROGRESS" },
  });
  await logAudit({
    userId: user.id,
    action: "MAINT_START",
    module: "noc",
    entityType: "NetworkMaintenance",
    entityId: maintId,
    description: `Memulai maintenance ${maint.maintNumber}`,
  });
  return { ok: true, id: maintId };
}

export async function completeMaintenance(
  user: CurrentUser,
  maintId: string,
  result: string
): Promise<Result> {
  const maint = await db.networkMaintenance.findUnique({ where: { id: maintId } });
  if (!maint) return { ok: false, error: "Maintenance tidak ditemukan." };
  if (maint.status !== "IN_PROGRESS") {
    return { ok: false, error: "Maintenance belum dimulai." };
  }
  if (!result?.trim()) return { ok: false, error: "Hasil maintenance wajib diisi." };
  await db.networkMaintenance.update({
    where: { id: maintId },
    data: { status: "COMPLETED", result },
  });
  await logAudit({
    userId: user.id,
    action: "MAINT_COMPLETE",
    module: "noc",
    entityType: "NetworkMaintenance",
    entityId: maintId,
    description: `Menyelesaikan maintenance ${maint.maintNumber}`,
  });
  return { ok: true, id: maintId };
}

export async function cancelMaintenance(
  user: CurrentUser,
  maintId: string,
  reason: string
): Promise<Result> {
  if (!reason?.trim()) return { ok: false, error: "Alasan pembatalan wajib diisi." };
  const maint = await db.networkMaintenance.findUnique({ where: { id: maintId } });
  if (!maint) return { ok: false, error: "Maintenance tidak ditemukan." };
  if (["COMPLETED", "CANCELLED"].includes(maint.status)) {
    return { ok: false, error: "Maintenance sudah final." };
  }
  await db.networkMaintenance.update({
    where: { id: maintId },
    data: { status: "CANCELLED", result: `[Dibatalkan] ${reason}` },
  });
  await logAudit({
    userId: user.id,
    action: "MAINT_CANCEL",
    module: "noc",
    entityType: "NetworkMaintenance",
    entityId: maintId,
    description: `Membatalkan maintenance ${maint.maintNumber}`,
    metadata: { reason },
  });
  return { ok: true, id: maintId };
}

// ── Change Management (PRD §35) ─────────────────────────────────

export async function createChange(
  user: CurrentUser,
  data: {
    title: string;
    changeType: string;
    reason: string;
    impactedDevices?: string;
    impactedServices?: string;
    risk: string;
    implementationPlan: string;
    testPlan?: string;
    rollbackPlan?: string;
    windowStart?: Date | null;
    windowEnd?: Date | null;
    picId: string;
  }
): Promise<Result> {
  if (!CHANGE_TYPES.includes(data.changeType as never)) {
    return { ok: false, error: "Jenis change tidak dikenal." };
  }
  if (!data.reason?.trim() || !data.risk?.trim() || !data.implementationPlan?.trim()) {
    return { ok: false, error: "Alasan, risiko, dan implementation plan wajib diisi (§35)." };
  }
  // Rule 21: rollback plan wajib (kecuali STANDARD yang bersifat rutin pra-setuju).
  if (data.changeType !== "STANDARD" && !data.rollbackPlan?.trim()) {
    return {
      ok: false,
      error: `Change ${statusLabel(data.changeType)} wajib memiliki rollback plan (business rule 21).`,
    };
  }
  const changeNumber = await nextNumber("CHG", (p) =>
    db.changeRequest.count({ where: { changeNumber: { startsWith: p } } })
  );
  const change = await db.changeRequest.create({
    data: {
      changeNumber,
      title: data.title,
      changeType: data.changeType,
      reason: data.reason,
      impactedDevices: data.impactedDevices || null,
      impactedServices: data.impactedServices || null,
      risk: data.risk,
      implementationPlan: data.implementationPlan,
      testPlan: data.testPlan || null,
      rollbackPlan: data.rollbackPlan || null,
      windowStart: data.windowStart ?? null,
      windowEnd: data.windowEnd ?? null,
      picId: data.picId,
      createdById: user.id,
    },
  });
  await logAudit({
    userId: user.id,
    action: "CHANGE_CREATE",
    module: "noc",
    entityType: "ChangeRequest",
    entityId: change.id,
    description: `Membuat change ${changeNumber} (${statusLabel(data.changeType)}): ${data.title}`,
  });
  return { ok: true, id: change.id };
}

export async function submitChange(user: CurrentUser, changeId: string): Promise<Result> {
  const change = await db.changeRequest.findUnique({ where: { id: changeId } });
  if (!change) return { ok: false, error: "Change tidak ditemukan." };
  if (change.status !== "DRAFT") return { ok: false, error: "Hanya draft yang bisa diajukan." };

  const approval = await submitApprovalRequest({
    user,
    module: "network_change",
    subtype: change.changeType.toLowerCase(),
    title: `${change.changeNumber} (${statusLabel(change.changeType)}): ${change.title}`,
    description: `${change.reason} | Risiko: ${change.risk}`,
    entityType: "ChangeRequest",
    entityId: change.id,
  });
  if (!approval.ok) return approval;

  await db.changeRequest.update({
    where: { id: changeId },
    data: { status: "WAITING_APPROVAL", approvalRequestId: approval.id },
  });
  await logAudit({
    userId: user.id,
    action: "CHANGE_SUBMIT",
    module: "noc",
    entityType: "ChangeRequest",
    entityId: changeId,
    description: `Mengajukan change ${change.changeNumber}`,
  });
  return { ok: true, id: changeId };
}

export async function implementChange(
  user: CurrentUser,
  changeId: string,
  result: string,
  success: boolean
): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.CHANGES_IMPLEMENT)) {
    return { ok: false, error: "Anda tidak memiliki izin mengeksekusi change." };
  }
  const change = await db.changeRequest.findUnique({ where: { id: changeId } });
  if (!change) return { ok: false, error: "Change tidak ditemukan." };
  // Rule 22: change tidak dapat dilaksanakan tanpa approval.
  if (change.status !== "WAITING_APPROVAL" || !(await approvalApproved(change.approvalRequestId))) {
    return {
      ok: false,
      error: "Change belum disetujui — tidak dapat dilaksanakan (business rule 22).",
    };
  }
  if (!result?.trim()) return { ok: false, error: "Hasil pelaksanaan wajib dicatat (§35)." };

  // Rule 23: emergency wajib post-review setelah implementasi.
  const nextStatus =
    change.changeType === "EMERGENCY" ? "PENDING_REVIEW" : success ? "COMPLETED" : "FAILED";
  await db.changeRequest.update({
    where: { id: changeId },
    data: {
      status: nextStatus,
      result: `${success ? "[Berhasil]" : "[Gagal — rollback dijalankan]"} ${result}`,
      implementedAt: new Date(),
      executedById: user.id,
    },
  });
  await logAudit({
    userId: user.id,
    action: "CHANGE_IMPLEMENT",
    module: "noc",
    entityType: "ChangeRequest",
    entityId: changeId,
    description: `Eksekusi ${change.changeNumber}: ${success ? "berhasil" : "gagal"}${nextStatus === "PENDING_REVIEW" ? " (menunggu post-review)" : ""}`,
  });
  return { ok: true, id: changeId };
}

export async function postReviewChange(
  user: CurrentUser,
  changeId: string,
  note: string,
  finalSuccess: boolean
): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.CHANGES_REVIEW)) {
    return { ok: false, error: "Post-review hanya oleh NOC Manager." };
  }
  const change = await db.changeRequest.findUnique({ where: { id: changeId } });
  if (!change) return { ok: false, error: "Change tidak ditemukan." };
  if (change.status !== "PENDING_REVIEW") {
    return { ok: false, error: "Change tidak sedang menunggu post-review." };
  }
  if (!note?.trim()) return { ok: false, error: "Catatan post-review wajib diisi (rule 23)." };
  if (change.executedById === user.id) {
    return { ok: false, error: "Post-review tidak boleh oleh eksekutor change (segregation of duties)." };
  }
  await db.changeRequest.update({
    where: { id: changeId },
    data: {
      status: finalSuccess ? "COMPLETED" : "FAILED",
      postReviewNote: note,
      postReviewedById: user.id,
      postReviewedAt: new Date(),
    },
  });
  await logAudit({
    userId: user.id,
    action: "CHANGE_POST_REVIEW",
    module: "noc",
    entityType: "ChangeRequest",
    entityId: changeId,
    description: `Post-review ${change.changeNumber}: ${finalSuccess ? "diterima" : "dinyatakan gagal"}`,
  });
  return { ok: true, id: changeId };
}

export async function cancelChange(
  user: CurrentUser,
  changeId: string,
  reason: string
): Promise<Result> {
  if (!reason?.trim()) return { ok: false, error: "Alasan pembatalan wajib diisi." };
  const change = await db.changeRequest.findUnique({ where: { id: changeId } });
  if (!change) return { ok: false, error: "Change tidak ditemukan." };
  if (!["DRAFT", "WAITING_APPROVAL"].includes(change.status)) {
    return { ok: false, error: "Change yang sudah dilaksanakan tidak bisa dibatalkan." };
  }
  await db.changeRequest.update({
    where: { id: changeId },
    data: { status: "CANCELLED", result: `[Dibatalkan] ${reason}` },
  });
  await logAudit({
    userId: user.id,
    action: "CHANGE_CANCEL",
    module: "noc",
    entityType: "ChangeRequest",
    entityId: changeId,
    description: `Membatalkan change ${change.changeNumber}`,
    metadata: { reason },
  });
  return { ok: true, id: changeId };
}
