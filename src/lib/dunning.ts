import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { isOutwardBlocked, outwardBlocked } from "@/lib/outward-guard";
import { notifyPermission } from "@/lib/notify";
import { PERMISSIONS, SUSPENSION_REASONS } from "@/lib/constants";
import type { CurrentUser } from "@/lib/rbac";

// ── Isolir & Dunning Engine (DESIGN-PHASE-8 §4, gap G3/G8) ──────
// Aturan yang ditegakkan DI SINI, bukan di UI:
//  - Isolir TIDAK PERNAH dieksekusi langsung dari UI ke router. Alur:
//    evaluasi kebijakan → ServiceSuspension tercatat → NetworkAccessJob
//    diantrikan → worker mengeksekusi → hasil tercatat. Router mati =
//    job FAILED dan TERLIHAT (first-class, bukan log tersembunyi).
//  - Isolir/pemulihan adalah event bercatat; status Subscription mengikuti
//    event, bukan diedit lepas.
//  - Keputusan §11.4: kebijakan mendukung dua ambang — hari lewat tempo
//    DAN jumlah invoice tertunggak — mana yang lebih dulu tercapai.
//  - Tanggal isolir per langganan (BillingProfile.isolirDay) menjadi
//    gerbang: evaluasi hanya mengisolir pada/tanggal setelahnya.
//  - Pemulihan otomatis saat pembayaran ter-posting dan tidak ada lagi
//    tunggakan lewat tempo (dipanggil dari engine payment).
//
// Adapter MikroTik live menunggu kredensial (§11.7) — executor default
// menggagalkan job dengan pesan jelas; worker menerima executor kustom.

type Result<T = undefined> =
  | { ok: true; id: string; data?: T }
  | { ok: false; error: string };

function isValidCode(list: readonly (readonly [string, string])[], code: string): boolean {
  return list.some(([c]) => c === code);
}

// ── Kebijakan dunning ───────────────────────────────────────────

export function parseOffsets(csv: string): number[] | null {
  const parts = csv.split(",").map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return [];
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isInteger(n) || n < -60 || n > 60)) return null;
  return nums;
}

export async function saveDunningPolicy(
  user: CurrentUser,
  data: {
    id?: string;
    name: string;
    graceDays: number;
    reminderOffsets: string;
    isolateAfterDays?: number | null;
    maxUnpaidInvoices?: number | null;
    isActive?: boolean;
  }
): Promise<Result> {
  if (!data.name?.trim()) return { ok: false, error: "Nama kebijakan wajib diisi." };
  if (!Number.isInteger(data.graceDays) || data.graceDays < 0 || data.graceDays > 60) {
    return { ok: false, error: "Masa tenggang harus 0–60 hari." };
  }
  if (parseOffsets(data.reminderOffsets) === null) {
    return { ok: false, error: 'Offset pengingat harus daftar angka, mis. "-3,0,3".' };
  }
  const days = data.isolateAfterDays ?? null;
  const count = data.maxUnpaidInvoices ?? null;
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 365)) {
    return { ok: false, error: "Ambang hari lewat tempo harus 1–365." };
  }
  if (count !== null && (!Number.isInteger(count) || count < 1 || count > 24)) {
    return { ok: false, error: "Ambang jumlah tunggakan harus 1–24." };
  }
  if (days === null && count === null) {
    return { ok: false, error: "Isi minimal satu ambang isolir (hari atau jumlah tunggakan) — §11.4." };
  }
  const payload = {
    name: data.name,
    graceDays: data.graceDays,
    reminderOffsets: data.reminderOffsets,
    isolateAfterDays: days,
    maxUnpaidInvoices: count,
    isActive: data.isActive ?? true,
  };
  const policy = data.id
    ? await db.dunningPolicy.update({ where: { id: data.id }, data: payload })
    : await db.dunningPolicy.create({ data: payload });
  await logAudit({
    userId: user.id,
    action: data.id ? "DUNNING_POLICY_UPDATE" : "DUNNING_POLICY_CREATE",
    module: "billing",
    entityType: "DunningPolicy",
    entityId: policy.id,
    description: `Kebijakan dunning "${data.name}": tenggang ${data.graceDays} hari, ambang ${days ?? "-"} hari / ${count ?? "-"} invoice`,
  });
  return { ok: true, id: policy.id };
}

// ── Antrian job router (§4) ─────────────────────────────────────

async function queueAccessJob(
  subscriptionId: string | null,
  routerId: string | null,
  action: string,
  payload: Record<string, unknown>
): Promise<string> {
  const job = await db.networkAccessJob.create({
    data: {
      subscriptionId,
      routerId,
      action,
      payload: JSON.stringify(payload),
      // Tanpa router = tidak bisa dieksekusi — SKIPPED tapi tetap tercatat.
      status: routerId ? "QUEUED" : "SKIPPED",
      lastError: routerId ? null : "Langganan belum ditautkan ke router — atur di data teknis langganan.",
    },
  });
  return job.id;
}

export type JobExecutor = (job: {
  id: string;
  action: string;
  routerId: string | null;
  payload: string;
}) => Promise<{ ok: true } | { ok: false; error: string }>;

// Executor default: adapter MikroTik live belum tersambung (§11.7).
const defaultExecutor: JobExecutor = async () => ({
  ok: false,
  error: "Adapter MikroTik belum tersambung — menunggu kredensial router (§11.7).",
});

export async function runQueuedJobs(
  user: CurrentUser | null,
  executor: JobExecutor = defaultExecutor,
  limit = 20
): Promise<Result<{ success: number; failed: number }>> {
  // Mode baca-saja — sebelum job diambil, supaya tidak ada job yang berpindah
  // ke RUNNING lalu FAILED cuma karena antriannya sempat dijalankan.
  if (isOutwardBlocked()) return outwardBlocked("network.access");
  const jobs = await db.networkAccessJob.findMany({
    where: { status: "QUEUED" },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  let success = 0;
  let failed = 0;
  for (const job of jobs) {
    await db.networkAccessJob.update({ where: { id: job.id }, data: { status: "RUNNING" } });
    let outcome: Awaited<ReturnType<JobExecutor>>;
    try {
      outcome = await executor(job);
    } catch (e) {
      outcome = { ok: false, error: e instanceof Error ? e.message : "Executor error" };
    }
    await db.networkAccessJob.update({
      where: { id: job.id },
      data: outcome.ok
        ? { status: "SUCCESS", executedAt: new Date(), lastError: null, attempts: job.attempts + 1 }
        : { status: "FAILED", lastError: outcome.error, attempts: job.attempts + 1 },
    });
    outcome.ok ? success++ : failed++;
  }
  if (jobs.length > 0) {
    await logAudit({
      userId: user?.id ?? null,
      action: "NET_JOB_RUN",
      module: "noc",
      entityType: "NetworkAccessJob",
      description: `Menjalankan antrian router: ${success} sukses, ${failed} gagal`,
    });
  }
  return { ok: true, id: "run", data: { success, failed } };
}

export async function retryJob(user: CurrentUser, jobId: string): Promise<Result> {
  const job = await db.networkAccessJob.findUnique({ where: { id: jobId } });
  if (!job) return { ok: false, error: "Job tidak ditemukan." };
  if (job.status !== "FAILED") return { ok: false, error: "Hanya job gagal yang bisa diulang." };
  await db.networkAccessJob.update({ where: { id: jobId }, data: { status: "QUEUED", lastError: null } });
  await logAudit({
    userId: user.id,
    action: "NET_JOB_RETRY",
    module: "noc",
    entityType: "NetworkAccessJob",
    entityId: jobId,
    description: `Mengulang job ${job.action} (percobaan ke-${job.attempts + 1})`,
  });
  return { ok: true, id: jobId };
}

// ── Isolir & pemulihan (event bercatat) ─────────────────────────

export async function suspendSubscription(
  user: CurrentUser | null,
  data: {
    subscriptionId: string;
    reason: string;
    triggeredBy: "SYSTEM" | "USER";
    policyId?: string | null;
    unpaidInvoices?: number | null;
    unpaidAmount?: bigint | null;
    note?: string;
  }
): Promise<Result> {
  if (!isValidCode(SUSPENSION_REASONS, data.reason)) {
    return { ok: false, error: "Alasan isolir tidak dikenal." };
  }
  const sub = await db.subscription.findUnique({
    where: { id: data.subscriptionId },
    include: { customer: true },
  });
  if (!sub) return { ok: false, error: "Langganan tidak ditemukan." };
  if (sub.status !== "ACTIVE") {
    return { ok: false, error: `Hanya langganan aktif yang bisa diisolir (status: ${sub.status}).` };
  }
  if (data.triggeredBy === "USER" && !data.note?.trim()) {
    return { ok: false, error: "Isolir manual wajib disertai catatan alasan." };
  }

  const jobId = await queueAccessJob(sub.id, sub.routerId, "DISABLE", {
    pppoeUsername: sub.pppoeUsername,
    serviceNumber: sub.serviceNumber,
    reason: data.reason,
  });
  const suspension = await db.serviceSuspension.create({
    data: {
      subscriptionId: sub.id,
      reason: data.reason,
      triggeredBy: data.triggeredBy,
      policyId: data.policyId ?? null,
      unpaidInvoices: data.unpaidInvoices ?? null,
      unpaidAmount: data.unpaidAmount ?? null,
      note: data.note || null,
      suspendJobId: jobId,
      createdById: user?.id ?? null,
    },
  });
  await db.subscription.update({ where: { id: sub.id }, data: { status: "ISOLATED" } });
  await logAudit({
    userId: user?.id ?? null,
    action: "SUBSCRIPTION_SUSPEND",
    module: "billing",
    entityType: "ServiceSuspension",
    entityId: suspension.id,
    description: `Isolir ${sub.serviceNumber} (${sub.customer.name}) — ${data.reason}${data.unpaidInvoices ? `, ${data.unpaidInvoices} tunggakan` : ""}`,
    metadata: { triggeredBy: data.triggeredBy, note: data.note },
  });
  return { ok: true, id: suspension.id };
}

export async function restoreSubscription(
  user: CurrentUser | null,
  suspensionId: string,
  note?: string
): Promise<Result> {
  const suspension = await db.serviceSuspension.findUnique({
    where: { id: suspensionId },
    include: { subscription: { include: { customer: true } } },
  });
  if (!suspension) return { ok: false, error: "Catatan isolir tidak ditemukan." };
  if (suspension.restoredAt) return { ok: false, error: "Isolir ini sudah dipulihkan." };

  const sub = suspension.subscription;
  const jobId = await queueAccessJob(sub.id, sub.routerId, "ENABLE", {
    pppoeUsername: sub.pppoeUsername,
    serviceNumber: sub.serviceNumber,
  });
  await db.$transaction([
    db.serviceSuspension.update({
      where: { id: suspensionId },
      data: { restoredAt: new Date(), restoreNote: note || null, restoreJobId: jobId },
    }),
    db.subscription.update({ where: { id: sub.id }, data: { status: "ACTIVE" } }),
  ]);
  await logAudit({
    userId: user?.id ?? null,
    action: "SUBSCRIPTION_RESTORE",
    module: "billing",
    entityType: "ServiceSuspension",
    entityId: suspensionId,
    description: `Pemulihan ${sub.serviceNumber} (${sub.customer.name})${note ? ` — ${note}` : ""}`,
  });
  return { ok: true, id: suspensionId };
}

// ── Evaluasi kebijakan (G3) ─────────────────────────────────────

interface OverdueStats {
  count: number;
  amount: bigint;
  maxOverdueDays: number;
}

async function overdueStats(subscriptionId: string, graceDays: number): Promise<OverdueStats> {
  const cutoff = new Date(Date.now() - graceDays * 86400e3);
  const invoices = await db.invoice.findMany({
    where: { subscriptionId, status: { in: ["OPEN", "PARTIAL"] }, dueAt: { lt: cutoff } },
  });
  let amount = 0n;
  let maxOverdueDays = 0;
  for (const inv of invoices) {
    amount += inv.totalAmount - inv.paidAmount;
    const days = Math.floor((Date.now() - inv.dueAt.getTime()) / 86400e3);
    if (days > maxOverdueDays) maxOverdueDays = days;
  }
  return { count: invoices.length, amount, maxOverdueDays };
}

// Evaluasi seluruh langganan aktif terhadap kebijakan aktif. Idempoten:
// langganan yang sudah ISOLATED tidak dievaluasi ulang.
export async function evaluateDunning(
  user: CurrentUser | null
): Promise<Result<{ checked: number; suspended: number }>> {
  const policies = await db.dunningPolicy.findMany({ where: { isActive: true } });
  if (!policies.length) {
    return { ok: false, error: "Tidak ada kebijakan dunning aktif — buat dulu kebijakannya." };
  }
  const subs = await db.subscription.findMany({
    where: { status: "ACTIVE", billingProfile: { isNot: null } },
    include: { billingProfile: true },
  });
  const today = new Date().getDate();
  let suspended = 0;
  for (const sub of subs) {
    // Gerbang tanggal isolir per langganan (padanan isolir_date sistem lama).
    const isolirDay = sub.billingProfile!.isolirDay;
    if (isolirDay !== null && today < isolirDay) continue;

    for (const policy of policies) {
      const stats = await overdueStats(sub.id, policy.graceDays);
      const byDays =
        policy.isolateAfterDays !== null && stats.maxOverdueDays >= policy.isolateAfterDays + policy.graceDays;
      const byCount =
        policy.maxUnpaidInvoices !== null && stats.count >= policy.maxUnpaidInvoices;
      if (byDays || byCount) {
        const result = await suspendSubscription(user, {
          subscriptionId: sub.id,
          reason: "OVERDUE",
          triggeredBy: user ? "USER" : "SYSTEM",
          policyId: policy.id,
          unpaidInvoices: stats.count,
          unpaidAmount: stats.amount,
          note: `Evaluasi kebijakan "${policy.name}": ${stats.count} tunggakan, terlama ${stats.maxOverdueDays} hari lewat tempo`,
        });
        if (result.ok) suspended++;
        break; // satu kebijakan cukup — lanjut ke langganan berikutnya
      }
    }
  }
  await logAudit({
    userId: user?.id ?? null,
    action: "DUNNING_EVALUATE",
    module: "billing",
    entityType: "DunningPolicy",
    description: `Evaluasi isolir: ${subs.length} langganan diperiksa, ${suspended} diisolir`,
  });
  if (suspended > 0) {
    await notifyPermission(PERMISSIONS.DUNNING_MANAGE, {
      type: "DUNNING_SUSPENDED",
      title: `${suspended} langganan diisolir otomatis`,
      body: "Evaluasi kebijakan dunning — cek antrian job router.",
      link: "/billing/isolir",
      module: "billing",
    });
  }
  return { ok: true, id: "evaluate", data: { checked: subs.length, suspended } };
}

// Pemulihan otomatis setelah pembayaran ter-posting: bila tidak ada lagi
// tunggakan lewat tempo, isolir OVERDUE dibuka. TIDAK PERNAH melempar —
// dipanggil dari engine payment dan tidak boleh menggagalkan posting.
export async function autoRestoreAfterPayment(customerId: string): Promise<void> {
  try {
    const isolated = await db.subscription.findMany({
      where: { customerId, status: "ISOLATED" },
      include: {
        suspensions: {
          where: { restoredAt: null, reason: "OVERDUE" },
          orderBy: { suspendedAt: "desc" },
          take: 1,
        },
      },
    });
    for (const sub of isolated) {
      const suspension = sub.suspensions[0];
      if (!suspension) continue; // isolir manual (REQUEST/ABUSE) — jangan buka otomatis
      const stats = await overdueStats(sub.id, 0);
      if (stats.count === 0) {
        await restoreSubscription(null, suspension.id, "Pemulihan otomatis — tunggakan lunas");
      }
    }
  } catch (e) {
    console.error("[dunning] auto-restore gagal:", e);
  }
}

// Daftar pengingat jatuh tempo hari ini menurut offset kebijakan
// (disajikan untuk ditindaklanjuti CS — pengiriman WA menyusul Fase 15).
export async function reminderList(): Promise<
  { offset: number; invoiceId: string; invoiceNumber: string; customerName: string; dueAt: Date; outstanding: bigint }[]
> {
  const policies = await db.dunningPolicy.findMany({ where: { isActive: true } });
  const offsets = [...new Set(policies.flatMap((p) => parseOffsets(p.reminderOffsets) ?? []))];
  if (!offsets.length) return [];
  const out: Awaited<ReturnType<typeof reminderList>> = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const offset of offsets.sort((a, b) => a - b)) {
    // offset -3 = 3 hari SEBELUM jatuh tempo → dueAt = hari ini + 3.
    const target = new Date(today.getTime() - offset * 86400e3);
    const end = new Date(target.getTime() + 86400e3);
    const invoices = await db.invoice.findMany({
      where: { status: { in: ["OPEN", "PARTIAL"] }, dueAt: { gte: target, lt: end } },
      include: { customer: true },
    });
    for (const inv of invoices) {
      out.push({
        offset,
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customer.name,
        dueAt: inv.dueAt,
        outstanding: inv.totalAmount - inv.paidAmount,
      });
    }
  }
  return out;
}
