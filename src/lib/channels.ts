import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { CUSTOMER_CHANNELS, MESSAGE_CHANNELS } from "@/lib/constants";
import type { CurrentUser } from "@/lib/rbac";
import { isOutwardBlocked, outwardBlocked } from "@/lib/outward-guard";

// ── Kanal Pelanggan Engine (DESIGN-PHASE-8 §9, gap G11/G12) ─────
// Aturan yang ditegakkan DI SINI, bukan di UI:
//  - WA/email gateway adalah adapter Integration, bukan modul terpisah:
//    template pesan + antrian kirim + status + rate limit.
//  - Pesan menghormati preferensi pelanggan (NONE = tidak dikirim);
//    pelanggan tanpa kontak pada kanal itu ditolak sejak antrian.
//  - Antrian auditable & retryable seperti NetworkAccessJob (Fase 10);
//    pengirim live menunggu kredensial gateway (§11.7) — executor
//    pluggable, default menggagalkan job dengan pesan jelas.
//  - Rate limit per menjalankan antrian agar gateway tidak dibanjiri.

type Result<T = undefined> =
  | { ok: true; id: string; data?: T }
  | { ok: false; error: string };

function isValidCode(list: readonly (readonly [string, string])[], code: string): boolean {
  return list.some(([c]) => c === code);
}

// Render placeholder {{key}} dari data.
export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
}

// ── Template pesan ──────────────────────────────────────────────

export async function saveMessageTemplate(
  user: CurrentUser,
  data: {
    id?: string;
    code: string;
    name: string;
    channel: string;
    subject?: string;
    body: string;
    isActive?: boolean;
  }
): Promise<Result> {
  const code = data.code.trim().toUpperCase();
  if (!/^[A-Z0-9_]{3,40}$/.test(code)) {
    return { ok: false, error: "Kode template: huruf besar/angka/underscore, 3–40 karakter." };
  }
  if (!data.name?.trim()) return { ok: false, error: "Nama template wajib diisi." };
  if (!isValidCode(MESSAGE_CHANNELS, data.channel)) {
    return { ok: false, error: "Kanal tidak dikenal." };
  }
  if (!data.body?.trim()) return { ok: false, error: "Isi pesan wajib diisi." };
  if (data.channel === "EMAIL" && !data.subject?.trim()) {
    return { ok: false, error: "Template email wajib memiliki subjek." };
  }
  const dup = await db.messageTemplate.findFirst({
    where: { code, ...(data.id ? { id: { not: data.id } } : {}) },
  });
  if (dup) return { ok: false, error: `Kode template ${code} sudah dipakai.` };

  const payload = {
    code,
    name: data.name,
    channel: data.channel,
    subject: data.subject || null,
    body: data.body,
    isActive: data.isActive ?? true,
  };
  const tpl = data.id
    ? await db.messageTemplate.update({ where: { id: data.id }, data: payload })
    : await db.messageTemplate.create({ data: payload });
  await logAudit({
    userId: user.id,
    action: data.id ? "MSG_TEMPLATE_UPDATE" : "MSG_TEMPLATE_CREATE",
    module: "channels",
    entityType: "MessageTemplate",
    entityId: tpl.id,
    description: `${data.id ? "Mengubah" : "Membuat"} template ${code} (${data.channel})`,
  });
  return { ok: true, id: tpl.id };
}

// ── Preferensi notifikasi pelanggan ─────────────────────────────

export async function setCustomerChannel(
  user: CurrentUser,
  customerId: string,
  channel: string
): Promise<Result> {
  if (!isValidCode(CUSTOMER_CHANNELS, channel)) {
    return { ok: false, error: "Preferensi kanal tidak dikenal." };
  }
  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer) return { ok: false, error: "Pelanggan tidak ditemukan." };
  if (channel === "WHATSAPP" && !customer.phone?.trim()) {
    return { ok: false, error: "Pelanggan belum punya nomor telepon untuk WhatsApp." };
  }
  if (channel === "EMAIL" && !customer.email?.trim()) {
    return { ok: false, error: "Pelanggan belum punya alamat email." };
  }
  await db.customer.update({ where: { id: customerId }, data: { notifyChannel: channel } });
  await logAudit({
    userId: user.id,
    action: "CUSTOMER_CHANNEL_SET",
    module: "channels",
    entityType: "Customer",
    entityId: customerId,
    description: `Preferensi notifikasi ${customer.name} → ${channel}`,
  });
  return { ok: true, id: customerId };
}

// ── Antrian pesan keluar ────────────────────────────────────────

function recipientFor(
  channel: string,
  customer: { phone: string; email: string | null }
): string | null {
  if (channel === "WHATSAPP") return customer.phone?.trim() || null;
  if (channel === "EMAIL") return customer.email?.trim() || null;
  if (channel === "APP") return "app";
  return null;
}

export async function queueCustomerMessage(
  user: CurrentUser | null,
  data: {
    customerId: string;
    templateCode?: string;
    channel?: string; // null = ikut preferensi pelanggan
    vars?: Record<string, string>;
    bodyOverride?: string;
    subjectOverride?: string;
    integrationId?: string | null;
    relatedType?: string;
    relatedId?: string;
  }
): Promise<Result> {
  const customer = await db.customer.findUnique({ where: { id: data.customerId } });
  if (!customer) return { ok: false, error: "Pelanggan tidak ditemukan." };

  const channel = data.channel ?? customer.notifyChannel;
  if (channel === "NONE") {
    return { ok: false, error: `${customer.name} memilih tidak menerima notifikasi (preferensi: None).` };
  }
  if (!isValidCode(MESSAGE_CHANNELS, channel)) {
    return { ok: false, error: "Kanal tidak dikenal." };
  }
  const recipient = recipientFor(channel, customer);
  if (!recipient) {
    return { ok: false, error: `Pelanggan tidak punya kontak untuk kanal ${channel}.` };
  }

  let template = null;
  let body = data.bodyOverride ?? "";
  let subject = data.subjectOverride ?? null;
  if (data.templateCode) {
    template = await db.messageTemplate.findUnique({ where: { code: data.templateCode } });
    if (!template) return { ok: false, error: `Template ${data.templateCode} tidak ditemukan.` };
    if (!template.isActive) return { ok: false, error: `Template ${data.templateCode} nonaktif.` };
    if (template.channel !== channel) {
      return { ok: false, error: `Template ${data.templateCode} untuk kanal ${template.channel}, bukan ${channel}.` };
    }
    const vars = { nama: customer.name, nomor: customer.customerNumber, ...(data.vars ?? {}) };
    body = renderTemplate(template.body, vars);
    subject = template.subject ? renderTemplate(template.subject, vars) : null;
  }
  if (!body.trim()) return { ok: false, error: "Isi pesan kosong — pilih template atau tulis pesan." };

  const msg = await db.outboundMessage.create({
    data: {
      templateId: template?.id ?? null,
      integrationId: data.integrationId || null,
      customerId: customer.id,
      channel,
      recipient,
      subject,
      body,
      relatedType: data.relatedType ?? null,
      relatedId: data.relatedId ?? null,
      createdById: user?.id ?? null,
    },
  });
  await logAudit({
    userId: user?.id ?? null,
    action: "OUTBOUND_QUEUE",
    module: "channels",
    entityType: "OutboundMessage",
    entityId: msg.id,
    description: `Antrian pesan ${channel} ke ${customer.name}${template ? ` (${template.code})` : ""}`,
  });
  return { ok: true, id: msg.id };
}

// Blast ke banyak pelanggan sekaligus — menghormati preferensi masing-masing.
export async function queueBroadcast(
  user: CurrentUser,
  data: { templateCode: string; customerIds: string[]; vars?: Record<string, string>; integrationId?: string | null }
): Promise<Result<{ queued: number; skipped: number; reasons: string[] }>> {
  if (!data.customerIds.length) return { ok: false, error: "Pilih minimal satu pelanggan." };
  let queued = 0;
  const reasons: string[] = [];
  for (const customerId of [...new Set(data.customerIds)]) {
    const res = await queueCustomerMessage(user, {
      customerId,
      templateCode: data.templateCode,
      vars: data.vars,
      integrationId: data.integrationId,
    });
    if (res.ok) queued++;
    else if (reasons.length < 5) reasons.push(res.error);
  }
  const skipped = new Set(data.customerIds).size - queued;
  await logAudit({
    userId: user.id,
    action: "OUTBOUND_BROADCAST",
    module: "channels",
    entityType: "MessageTemplate",
    description: `Blast template ${data.templateCode}: ${queued} diantrikan, ${skipped} dilewati`,
  });
  return { ok: true, id: "broadcast", data: { queued, skipped, reasons } };
}

export type MessageSender = (msg: {
  id: string;
  channel: string;
  recipient: string;
  subject: string | null;
  body: string;
  integrationId: string | null;
}) => Promise<{ ok: true } | { ok: false; error: string }>;

// Pengirim default: adapter gateway belum tersambung (§11.7).
const defaultSender: MessageSender = async () => ({
  ok: false,
  error: "Adapter gateway belum tersambung — menunggu kredensial WhatsApp/SMTP (§11.7).",
});

// Rate limit: batasi jumlah kirim per eksekusi antrian.
export async function runOutboundQueue(
  user: CurrentUser | null,
  sender: MessageSender = defaultSender,
  rateLimit = 20
): Promise<Result<{ sent: number; failed: number }>> {
  // Mode baca-saja — paling atas, SEBELUM antrian disentuh, supaya status
  // pesan tidak ikut berubah menjadi SENDING/FAILED hanya karena dicoba.
  if (isOutwardBlocked()) return outwardBlocked("channels.send");
  if (!Number.isInteger(rateLimit) || rateLimit < 1 || rateLimit > 500) {
    return { ok: false, error: "Rate limit harus 1–500 pesan per eksekusi." };
  }
  const queue = await db.outboundMessage.findMany({
    where: { status: "QUEUED" },
    orderBy: { createdAt: "asc" },
    take: rateLimit,
  });
  let sent = 0;
  let failed = 0;
  for (const msg of queue) {
    await db.outboundMessage.update({ where: { id: msg.id }, data: { status: "SENDING" } });
    let outcome: Awaited<ReturnType<MessageSender>>;
    try {
      outcome = await sender(msg);
    } catch (e) {
      outcome = { ok: false, error: e instanceof Error ? e.message : "Sender error" };
    }
    await db.outboundMessage.update({
      where: { id: msg.id },
      data: outcome.ok
        ? { status: "SENT", sentAt: new Date(), lastError: null, attempts: msg.attempts + 1 }
        : { status: "FAILED", lastError: outcome.error, attempts: msg.attempts + 1 },
    });
    outcome.ok ? sent++ : failed++;
  }
  if (queue.length > 0) {
    await logAudit({
      userId: user?.id ?? null,
      action: "OUTBOUND_RUN",
      module: "channels",
      entityType: "OutboundMessage",
      description: `Antrian pesan dijalankan: ${sent} terkirim, ${failed} gagal (limit ${rateLimit})`,
    });
  }
  return { ok: true, id: "run", data: { sent, failed } };
}

export async function retryMessage(user: CurrentUser, messageId: string): Promise<Result> {
  const msg = await db.outboundMessage.findUnique({ where: { id: messageId } });
  if (!msg) return { ok: false, error: "Pesan tidak ditemukan." };
  if (msg.status !== "FAILED") return { ok: false, error: "Hanya pesan gagal yang bisa diulang." };
  await db.outboundMessage.update({
    where: { id: messageId },
    data: { status: "QUEUED", lastError: null },
  });
  await logAudit({
    userId: user.id,
    action: "OUTBOUND_RETRY",
    module: "channels",
    entityType: "OutboundMessage",
    entityId: messageId,
    description: `Mengulang pengiriman pesan (percobaan ke-${msg.attempts + 1})`,
  });
  return { ok: true, id: messageId };
}

// ── Pengumuman / promo (untuk portal & app pelanggan) ───────────

export async function saveAnnouncement(
  user: CurrentUser,
  data: {
    id?: string;
    title: string;
    badge?: string;
    body: string;
    startAt: Date;
    endAt?: Date | null;
    isPublished?: boolean;
  }
): Promise<Result> {
  if (!data.title?.trim()) return { ok: false, error: "Judul pengumuman wajib diisi." };
  if (!data.body?.trim()) return { ok: false, error: "Isi pengumuman wajib diisi." };
  if (Number.isNaN(data.startAt.getTime())) return { ok: false, error: "Tanggal mulai tidak valid." };
  if (data.endAt && data.endAt < data.startAt) {
    return { ok: false, error: "Tanggal selesai tidak boleh sebelum tanggal mulai." };
  }
  const payload = {
    title: data.title,
    badge: data.badge?.trim() || null,
    body: data.body,
    startAt: data.startAt,
    endAt: data.endAt ?? null,
    isPublished: data.isPublished ?? false,
  };
  const ann = data.id
    ? await db.announcement.update({ where: { id: data.id }, data: payload })
    : await db.announcement.create({ data: { ...payload, createdById: user.id } });
  await logAudit({
    userId: user.id,
    action: data.id ? "ANNOUNCEMENT_UPDATE" : "ANNOUNCEMENT_CREATE",
    module: "channels",
    entityType: "Announcement",
    entityId: ann.id,
    description: `${data.isPublished ? "Menerbitkan" : "Menyimpan"} pengumuman "${data.title}"`,
  });
  return { ok: true, id: ann.id };
}

// Pengumuman yang sedang tayang — dipakai portal/app pelanggan nanti.
export async function activeAnnouncements() {
  const now = new Date();
  return db.announcement.findMany({
    where: {
      isPublished: true,
      startAt: { lte: now },
      OR: [{ endAt: null }, { endAt: { gte: now } }],
    },
    orderBy: { startAt: "desc" },
  });
}
