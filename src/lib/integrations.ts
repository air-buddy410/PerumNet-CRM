import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { notifyPermission } from "@/lib/notify";
import {
  PERMISSIONS,
  ALARM_SEVERITIES,
  INTEGRATION_CATEGORIES,
  INTEGRATION_PROVIDERS,
  INTEGRATION_AUTH_TYPES,
} from "@/lib/constants";
import type { CurrentUser } from "@/lib/rbac";

// ── Integration Adapter Layer (PRD §30, §31, §56) ───────────────
// Registry integrasi eksternal + webhook inbound monitoring.
//  - Secret TIDAK pernah disimpan: credentialRef = NAMA env var (NFR §57,
//    rule 31). Validasi menolak nilai yang tampak seperti secret.
//  - Webhook masuk diautentikasi dengan token per-integrasi.
//  - Alert monitoring → alarm otomatis; duplikat dikelompokkan
//    (anti alarm-flooding §31); alert RESOLVED meng-clear alarm.

type Result<T = undefined> =
  | { ok: true; id: string; data?: T }
  | { ok: false; error: string };

const ENV_VAR_RE = /^[A-Z][A-Z0-9_]*$/;

function isValidCode(list: readonly (readonly [string, string])[], code: string): boolean {
  return list.some(([c]) => c === code);
}

export async function saveIntegration(
  user: CurrentUser,
  data: {
    id?: string;
    code: string;
    name: string;
    category: string;
    provider: string;
    baseUrl?: string;
    authType?: string;
    credentialRef?: string;
    isEnabled?: boolean;
    notes?: string;
  }
): Promise<Result> {
  const code = data.code.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(code)) {
    return { ok: false, error: "Kode integrasi: huruf kecil/angka/strip, 2–31 karakter." };
  }
  if (!isValidCode(INTEGRATION_CATEGORIES, data.category)) {
    return { ok: false, error: "Kategori integrasi tidak dikenal." };
  }
  if (!isValidCode(INTEGRATION_PROVIDERS, data.provider)) {
    return { ok: false, error: "Provider integrasi tidak dikenal." };
  }
  const authType = data.authType ?? "NONE";
  if (!INTEGRATION_AUTH_TYPES.includes(authType as never)) {
    return { ok: false, error: "Jenis autentikasi tidak valid." };
  }
  // Rule 31 / NFR: kolom ini hanya boleh berisi NAMA env var, bukan secret.
  const credentialRef = data.credentialRef?.trim() || null;
  if (credentialRef && !ENV_VAR_RE.test(credentialRef)) {
    return {
      ok: false,
      error:
        "Credential ref harus berupa NAMA environment variable (huruf besar/angka/underscore, mis. MIKROTIK_API_KEY) — jangan tempel secret di sini.",
    };
  }
  if (authType !== "NONE" && !credentialRef) {
    return { ok: false, error: "Autentikasi selain None memerlukan credential ref (nama env var)." };
  }
  const dup = await db.integration.findFirst({
    where: { code, ...(data.id ? { id: { not: data.id } } : {}) },
  });
  if (dup) return { ok: false, error: `Kode "${code}" sudah dipakai integrasi lain.` };

  const payload = {
    code,
    name: data.name,
    category: data.category,
    provider: data.provider,
    baseUrl: data.baseUrl?.trim() || null,
    authType,
    credentialRef,
    isEnabled: data.isEnabled ?? false,
    notes: data.notes || null,
  };
  const integration = data.id
    ? await db.integration.update({ where: { id: data.id }, data: payload })
    : await db.integration.create({
        data: { ...payload, webhookToken: randomBytes(24).toString("hex") },
      });
  await logAudit({
    userId: user.id,
    action: data.id ? "INTEGRATION_UPDATE" : "INTEGRATION_CREATE",
    module: "integrations",
    entityType: "Integration",
    entityId: integration.id,
    description: `${data.id ? "Mengubah" : "Mendaftarkan"} integrasi ${code} (${data.provider})`,
  });
  return { ok: true, id: integration.id };
}

export async function regenerateWebhookToken(user: CurrentUser, id: string): Promise<Result> {
  const integration = await db.integration.findUnique({ where: { id } });
  if (!integration) return { ok: false, error: "Integrasi tidak ditemukan." };
  await db.integration.update({
    where: { id },
    data: { webhookToken: randomBytes(24).toString("hex") },
  });
  await logAudit({
    userId: user.id,
    action: "INTEGRATION_TOKEN_ROTATE",
    module: "integrations",
    entityType: "Integration",
    entityId: id,
    description: `Rotasi webhook token integrasi ${integration.code}`,
  });
  return { ok: true, id };
}

// ── Inbound monitoring webhook (§30–31) ─────────────────────────

// Payload generik yang dipetakan dari Zabbix/LibreNMS/Prometheus/MikroTik dll.
export interface MonitoringAlert {
  status?: string; // FIRING (default) | RESOLVED
  severity?: string; // dipetakan ke ALARM_SEVERITIES, default WARNING
  message?: string;
  deviceHostname?: string; // dicocokkan ke NetworkDevice.hostname
  siteCode?: string; // dicocokkan ke NetworkSite.siteCode
  dedupKey?: string; // default: kombinasi integrasi+device+message
}

async function logEvent(
  integrationId: string,
  status: "OK" | "REJECTED" | "ERROR",
  detail: string,
  payload?: unknown
): Promise<void> {
  try {
    await db.integrationEvent.create({
      data: {
        integrationId,
        direction: "IN",
        eventType: "MONITORING_ALERT",
        payload: payload ? JSON.stringify(payload).slice(0, 2000) : null,
        status,
        detail,
      },
    });
    await db.integration.update({
      where: { id: integrationId },
      data: { lastEventAt: new Date() },
    });
  } catch (e) {
    console.error("[integrations] gagal mencatat event:", e);
  }
}

const SEVERITY_ALIASES: Record<string, string> = {
  DISASTER: "CRITICAL",
  HIGH: "MAJOR",
  AVERAGE: "MINOR",
  MODERATE: "MINOR",
  LOW: "WARNING",
  INFO: "INFORMATIONAL",
  OK: "INFORMATIONAL",
};

function mapSeverity(raw: string | undefined): string {
  const s = (raw ?? "").toUpperCase();
  if (ALARM_SEVERITIES.includes(s as never)) return s;
  return SEVERITY_ALIASES[s] ?? "WARNING";
}

async function nextAlarmNumber(): Promise<string> {
  const now = new Date();
  const prefix = `ALM-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const n = await db.networkAlarm.count({ where: { alarmNumber: { startsWith: prefix } } });
  return `${prefix}-${String(n + 1).padStart(4, "0")}`;
}

export async function ingestMonitoringAlert(
  integrationCode: string,
  token: string | null,
  alert: MonitoringAlert
): Promise<Result<{ action: string; alarmNumber?: string; count?: number }>> {
  const integration = await db.integration.findUnique({
    where: { code: integrationCode.toLowerCase() },
  });
  if (!integration) return { ok: false, error: "Integrasi tidak ditemukan." };
  if (!token || token !== integration.webhookToken) {
    await logEvent(integration.id, "REJECTED", "Token webhook salah");
    return { ok: false, error: "Token webhook tidak valid." };
  }
  if (!integration.isEnabled) {
    await logEvent(integration.id, "REJECTED", "Integrasi nonaktif");
    return { ok: false, error: "Integrasi sedang dinonaktifkan." };
  }
  const message = alert.message?.trim();
  if (!message) {
    await logEvent(integration.id, "REJECTED", "Payload tanpa message", alert);
    return { ok: false, error: "Field message wajib diisi." };
  }

  // Pencocokan TIDAK MEMBEDAKAN BESAR-KECIL HURUF, dan itu bukan kelonggaran
  // yang manis-manis saja.
  //
  // Sebelumnya hostname dikecilkan lalu dicari persis. Perangkat di CRM
  // didaftarkan apa adanya — `PRM_NAGABASUKIH_D` — jadi pencarian huruf kecil
  // TIDAK PERNAH menemukannya. Alarmnya tetap terbit, hanya tanpa perangkat dan
  // tanpa site, sehingga pertanyaan yang paling penting saat jaringan bermasalah
  // — "pelanggan mana yang terdampak" — dijawab kosong. Tidak ada galat, tidak
  // ada yang curiga.
  //
  // Nama perangkat datang dari sistem lain (LibreNMS memakai sysName, yang di
  // RouterOS otomatis huruf kecil). Menuntut keduanya sama persis berarti
  // menaruh syarat yang tak terlihat di antara dua sistem yang tidak saling
  // mengetahui aturan penamaan masing-masing.
  const device = alert.deviceHostname
    ? await db.networkDevice.findFirst({
        where: { hostname: { equals: alert.deviceHostname.trim(), mode: "insensitive" } },
      })
    : null;
  const site = alert.siteCode
    ? await db.networkSite.findFirst({
        where: { siteCode: { equals: alert.siteCode.trim(), mode: "insensitive" } },
      })
    : null;
  const dedupKey =
    alert.dedupKey?.trim() ||
    `${integration.code}|${device?.hostname ?? alert.deviceHostname ?? "-"}|${message}`;
  const status = (alert.status ?? "FIRING").toUpperCase();

  // RESOLVED → auto-clear alarm aktif yang cocok.
  if (status === "RESOLVED") {
    const active = await db.networkAlarm.findFirst({
      where: { dedupKey, clearedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!active) {
      await logEvent(integration.id, "OK", `RESOLVED tanpa alarm aktif (${dedupKey})`, alert);
      return { ok: true, id: integration.id, data: { action: "NO_ACTIVE_ALARM" } };
    }
    await db.networkAlarm.update({
      where: { id: active.id },
      data: { clearedAt: new Date() },
    });
    await logEvent(integration.id, "OK", `Alarm ${active.alarmNumber} auto-clear`, alert);
    await logAudit({
      userId: null,
      action: "ALARM_AUTO_CLEAR",
      module: "noc",
      entityType: "NetworkAlarm",
      entityId: active.id,
      description: `Alarm ${active.alarmNumber} pulih via integrasi ${integration.code}`,
    });
    return { ok: true, id: active.id, data: { action: "CLEARED", alarmNumber: active.alarmNumber } };
  }

  // FIRING duplikat → kelompokkan (§31 anti alarm-flooding).
  const existing = await db.networkAlarm.findFirst({
    where: { dedupKey, clearedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    const updated = await db.networkAlarm.update({
      where: { id: existing.id },
      data: { count: existing.count + 1, lastSeenAt: new Date() },
    });
    await logEvent(integration.id, "OK", `Duplikat dikelompokkan → ${existing.alarmNumber} (x${updated.count})`, alert);
    return {
      ok: true,
      id: existing.id,
      data: { action: "DEDUPED", alarmNumber: existing.alarmNumber, count: updated.count },
    };
  }

  const severity = mapSeverity(alert.severity);
  const alarmNumber = await nextAlarmNumber();
  const alarm = await db.networkAlarm.create({
    data: {
      alarmNumber,
      severity,
      source: integration.code,
      deviceId: device?.id ?? null,
      siteId: site?.id ?? null,
      message,
      dedupKey,
      lastSeenAt: new Date(),
    },
  });
  await logEvent(integration.id, "OK", `Alarm ${alarmNumber} dibuat (${severity})`, alert);
  await logAudit({
    userId: null,
    action: "ALARM_AUTO_CREATE",
    module: "noc",
    entityType: "NetworkAlarm",
    entityId: alarm.id,
    description: `Alarm otomatis ${alarmNumber} [${severity}] dari ${integration.code}: ${message}`,
  });
  if (["CRITICAL", "MAJOR"].includes(severity)) {
    await notifyPermission(PERMISSIONS.ALARMS_MANAGE, {
      type: "ALARM_CRITICAL",
      title: `Alarm ${severity}: ${message}`,
      body: `${alarmNumber} dari ${integration.name}${device ? ` · ${device.hostname}` : ""}`,
      link: "/noc/alarms",
      module: "noc",
    });
  }
  return { ok: true, id: alarm.id, data: { action: "CREATED", alarmNumber } };
}

// ── Outage communication (§33) ──────────────────────────────────

export async function setOutageCommunication(
  user: CurrentUser,
  incidentId: string,
  data: { isPublic: boolean; publicNote?: string; publicEta?: Date | null }
): Promise<Result> {
  const incident = await db.incident.findUnique({ where: { id: incidentId } });
  if (!incident) return { ok: false, error: "Incident tidak ditemukan." };
  if (!incident.isOutage) {
    return { ok: false, error: "Komunikasi publik hanya untuk incident bertipe outage." };
  }
  if (data.isPublic && !data.publicNote?.trim()) {
    return { ok: false, error: "Catatan publik wajib diisi sebelum dipublikasikan (§33)." };
  }
  await db.incident.update({
    where: { id: incidentId },
    data: {
      isPublic: data.isPublic,
      publicNote: data.publicNote?.trim() || null,
      // undefined = pertahankan ETA lama; Date = ganti.
      publicEta: data.publicEta !== undefined ? data.publicEta : incident.publicEta,
      publicUpdatedAt: new Date(),
    },
  });
  await logAudit({
    userId: user.id,
    action: "OUTAGE_COMM_UPDATE",
    module: "noc",
    entityType: "Incident",
    entityId: incidentId,
    description: `${data.isPublic ? "Mempublikasikan" : "Menarik"} info outage ${incident.incidentNumber}`,
  });
  if (data.isPublic) {
    await notifyPermission(
      PERMISSIONS.OUTAGES_VIEW,
      {
        type: "OUTAGE_PUBLIC",
        title: `Info gangguan: ${incident.title}`,
        body: data.publicNote,
        link: "/outages",
        module: "noc",
      },
      user.id
    );
  }
  return { ok: true, id: incidentId };
}

// Data untuk halaman /outages — HANYA incident yang disetujui publik (§33).
export async function listPublicOutages() {
  const since = new Date(Date.now() - 7 * 86400e3);
  return db.incident.findMany({
    where: {
      isOutage: true,
      isPublic: true,
      OR: [{ status: { notIn: ["CLOSED"] } }, { resolvedAt: { gte: since } }],
    },
    include: {
      area: true,
      site: true,
      _count: { select: { impacted: true } },
    },
    orderBy: [{ resolvedAt: "asc" }, { detectedAt: "desc" }],
  });
}
