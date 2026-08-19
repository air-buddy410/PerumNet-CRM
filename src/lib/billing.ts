import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { isOutwardBlocked, outwardBlocked } from "@/lib/outward-guard";
import { postInvoiceJournal, reverseInvoiceJournal } from "@/lib/gl";
import { INVOICE_TYPES, INVOICE_LINE_KINDS } from "@/lib/constants";
import { nextDocumentNumber, highestSuffix } from "@/lib/documents";
import type { CurrentUser } from "@/lib/rbac";

// ── Billing Engine (DESIGN-PHASE-8 §2, gap G1/G4/G5/G13/G23) ────
// Aturan yang ditegakkan DI SINI, bukan di UI:
//  - Generator bulanan idempoten: kunci unik (subscriptionId, period, type)
//    membuat run aman dijalankan ulang — langganan yang sudah punya invoice
//    periode itu dilewati, bukan digandakan (§2.2).
//  - Invoice DRAFT → run di-preview dulu → POSTED mengunci invoice (OPEN).
//  - Pembatalan invoice posted = VOID + alasan, TIDAK PERNAH dihapus.
//  - taxPercent di-snapshot per invoice — invoice lama tidak berubah saat
//    tarif PPN berganti (G23).
//  - Uang BigInt rupiah; PPN dibulatkan half-up.
//
// Asumsi (bisa diubah lewat keputusan PO):
//  - Langganan ACTIVE dan ISOLATED tetap ditagih; SUSPENDED/TERMINATED/DRAFT
//    tidak (isolir karena nunggak tidak menghapus kewajiban bulan berjalan).
//  - Nomor invoice format aplikasi: INV-YYYYMM-#### (keputusan §11.5).

type Result<T = undefined> =
  | { ok: true; id: string; data?: T }
  | { ok: false; error: string };

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const BILLABLE_SUB_STATUSES = ["ACTIVE", "ISOLATED"];

function isValidCode(list: readonly (readonly [string, string])[], code: string): boolean {
  return list.some(([c]) => c === code);
}

function periodBounds(period: string): { start: Date; end: Date } {
  const [y, m] = period.split("-").map(Number);
  return {
    start: new Date(y, m - 1, 1),
    end: new Date(y, m, 0, 23, 59, 59, 999),
  };
}

// PPN half-up dalam BigInt: subtotal × persen / 100 (persen 2 desimal).
export function taxOf(subtotal: bigint, taxPercent: number): bigint {
  const basisPoints = BigInt(Math.round(taxPercent * 100));
  return (subtotal * basisPoints + 5000n) / 10000n;
}

// Fase 16: pindah dari count()+1 ke DocumentSequence yang atomik.
// Pola lama membuat dua proses yang berjalan bersamaan menghasilkan nomor
// identik, lalu salah satunya gagal kena unique constraint di tengah run
// (tercatat di DECISIONS-PHASE-8.md §5). Format nomor tidak berubah.
async function nextInvoiceNumber(
  prisma: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  period?: string | null
): Promise<string> {
  const at = period
    ? new Date(Number(period.slice(0, 4)), Number(period.slice(5, 7)) - 1, 1)
    : new Date();
  return nextDocumentNumber(prisma, {
    docType: "INV",
    period: "MONTHLY",
    at,
    // Invoice yang terbit sebelum sistem sequence ada tetap dihormati.
    backfill: async (periodKey) => {
      const rows = await prisma.invoice.findMany({
        where: { invoiceNumber: { startsWith: `INV-${periodKey}-` } },
        select: { invoiceNumber: true },
      });
      return highestSuffix(rows.map((r) => r.invoiceNumber));
    },
  });
}

// ── Addon service (G13) ─────────────────────────────────────────

export async function attachAddon(
  user: CurrentUser,
  data: { subscriptionId: string; addonId: string; priceOverride?: bigint | null }
): Promise<Result> {
  const [sub, addon] = await Promise.all([
    db.subscription.findUnique({ where: { id: data.subscriptionId } }),
    db.addonService.findUnique({ where: { id: data.addonId } }),
  ]);
  if (!sub) return { ok: false, error: "Langganan tidak ditemukan." };
  if (!addon || !addon.isActive) return { ok: false, error: "Addon tidak ditemukan / nonaktif." };
  if (data.priceOverride !== undefined && data.priceOverride !== null && data.priceOverride < 0n) {
    return { ok: false, error: "Harga override tidak boleh negatif." };
  }
  const active = await db.subscriptionAddon.findFirst({
    where: { subscriptionId: data.subscriptionId, addonId: data.addonId, endedAt: null },
  });
  if (active) return { ok: false, error: `Addon ${addon.name} sudah aktif di langganan ini.` };

  const row = await db.subscriptionAddon.create({
    data: {
      subscriptionId: data.subscriptionId,
      addonId: data.addonId,
      priceOverride: data.priceOverride ?? null,
    },
  });
  await logAudit({
    userId: user.id,
    action: "ADDON_ATTACH",
    module: "billing",
    entityType: "SubscriptionAddon",
    entityId: row.id,
    description: `Menambahkan addon ${addon.name} ke ${sub.serviceNumber}`,
  });
  return { ok: true, id: row.id };
}

export async function detachAddon(user: CurrentUser, subscriptionAddonId: string): Promise<Result> {
  const row = await db.subscriptionAddon.findUnique({
    where: { id: subscriptionAddonId },
    include: { addon: true, subscription: true },
  });
  if (!row) return { ok: false, error: "Addon langganan tidak ditemukan." };
  if (row.endedAt) return { ok: false, error: "Addon sudah dihentikan." };
  await db.subscriptionAddon.update({
    where: { id: subscriptionAddonId },
    data: { endedAt: new Date() },
  });
  await logAudit({
    userId: user.id,
    action: "ADDON_DETACH",
    module: "billing",
    entityType: "SubscriptionAddon",
    entityId: subscriptionAddonId,
    description: `Menghentikan addon ${row.addon.name} dari ${row.subscription.serviceNumber}`,
  });
  return { ok: true, id: subscriptionAddonId };
}

// ── Billing profile (G23) ───────────────────────────────────────

export async function saveBillingProfile(
  user: CurrentUser,
  data: {
    subscriptionId: string;
    billingStartAt: Date;
    invoiceDay: number;
    dueDays: number;
    isolirDay?: number | null;
    taxPercent: number;
    isActive?: boolean;
  }
): Promise<Result> {
  const sub = await db.subscription.findUnique({ where: { id: data.subscriptionId } });
  if (!sub) return { ok: false, error: "Langganan tidak ditemukan." };
  if (sub.status === "TERMINATED") {
    return { ok: false, error: "Langganan sudah terminasi — tidak bisa diberi profil penagihan." };
  }
  if (!Number.isInteger(data.invoiceDay) || data.invoiceDay < 1 || data.invoiceDay > 28) {
    return { ok: false, error: "Tanggal terbit harus 1–28 (agar valid di semua bulan)." };
  }
  if (!Number.isInteger(data.dueDays) || data.dueDays < 1 || data.dueDays > 60) {
    return { ok: false, error: "Jangka jatuh tempo harus 1–60 hari." };
  }
  if (
    data.isolirDay !== undefined &&
    data.isolirDay !== null &&
    (!Number.isInteger(data.isolirDay) || data.isolirDay < 1 || data.isolirDay > 28)
  ) {
    return { ok: false, error: "Tanggal isolir harus 1–28." };
  }
  if (!Number.isFinite(data.taxPercent) || data.taxPercent < 0 || data.taxPercent > 100) {
    return { ok: false, error: "PPN harus 0–100%." };
  }
  const payload = {
    billingStartAt: data.billingStartAt,
    invoiceDay: data.invoiceDay,
    dueDays: data.dueDays,
    isolirDay: data.isolirDay ?? null,
    taxPercent: data.taxPercent,
    isActive: data.isActive ?? true,
  };
  const profile = await db.billingProfile.upsert({
    where: { subscriptionId: data.subscriptionId },
    update: payload,
    create: { subscriptionId: data.subscriptionId, ...payload },
  });
  await logAudit({
    userId: user.id,
    action: "BILLING_PROFILE_SAVE",
    module: "billing",
    entityType: "BillingProfile",
    entityId: profile.id,
    description: `Profil penagihan ${sub.serviceNumber}: terbit tgl ${data.invoiceDay}, tempo ${data.dueDays} hari, PPN ${data.taxPercent}%`,
  });
  return { ok: true, id: profile.id };
}

// ── Invoice run — batch bulanan idempoten (G4) ──────────────────

export async function createInvoiceRun(
  user: CurrentUser,
  period: string,
  scope = "ALL"
): Promise<Result> {
  if (!PERIOD_RE.test(period)) {
    return { ok: false, error: 'Format periode harus "YYYY-MM", mis. 2026-08.' };
  }
  const dup = await db.invoiceRun.findUnique({
    where: { period_scope: { period, scope } },
  });
  if (dup) {
    return { ok: false, error: `Invoice run periode ${period} sudah ada (${dup.status}).` };
  }
  const run = await db.invoiceRun.create({
    data: { period, scope, createdById: user.id },
  });
  await logAudit({
    userId: user.id,
    action: "INVOICE_RUN_CREATE",
    module: "billing",
    entityType: "InvoiceRun",
    entityId: run.id,
    description: `Membuat invoice run periode ${period}`,
  });
  return { ok: true, id: run.id };
}

// Generate/preview: buat invoice DRAFT untuk semua langganan yang layak
// tagih pada periode run. Aman dijalankan ulang (idempoten).
export async function generateInvoiceRun(
  user: CurrentUser,
  runId: string
): Promise<Result<{ created: number; skipped: number; total: string }>> {
  const run = await db.invoiceRun.findUnique({ where: { id: runId } });
  if (!run) return { ok: false, error: "Invoice run tidak ditemukan." };
  if (!["DRAFT", "PREVIEW"].includes(run.status)) {
    return { ok: false, error: "Run sudah diposting/dibatalkan — tidak bisa digenerate ulang." };
  }
  const { start, end } = periodBounds(run.period);

  const subs = await db.subscription.findMany({
    where: {
      status: { in: BILLABLE_SUB_STATUSES },
      billingProfile: { isActive: true, billingStartAt: { lte: end } },
    },
    include: {
      billingProfile: true,
      package: true,
      addons: { where: { startedAt: { lte: end }, OR: [{ endedAt: null }, { endedAt: { gte: start } }] }, include: { addon: true } },
    },
  });

  let created = 0;
  let skipped = 0;
  for (const sub of subs) {
    const profile = sub.billingProfile!;
    // Kunci idempotensi — invoice MONTHLY per langganan per periode hanya satu.
    const existing = await db.invoice.findFirst({
      where: { subscriptionId: sub.id, period: run.period, type: "MONTHLY" },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const lines: { kind: string; refId: string | null; description: string; quantity: number; unitPrice: bigint; amount: bigint }[] = [
      {
        kind: "PACKAGE",
        refId: sub.packageId,
        description: `${sub.package.name} — ${run.period}`,
        quantity: 1,
        unitPrice: sub.monthlyPrice, // harga terkunci per langganan, bukan master paket
        amount: sub.monthlyPrice,
      },
    ];
    for (const sa of sub.addons) {
      const price = sa.priceOverride ?? sa.addon.monthlyPrice;
      lines.push({
        kind: "ADDON",
        refId: sa.addonId,
        description: `${sa.addon.name} — ${run.period}`,
        quantity: 1,
        unitPrice: price,
        amount: price,
      });
    }
    const subtotal = lines.reduce((acc, l) => acc + l.amount, 0n);
    const taxAmount = taxOf(subtotal, profile.taxPercent);
    const [y, m] = run.period.split("-").map(Number);
    const issuedAt = new Date(y, m - 1, profile.invoiceDay);
    const dueAt = new Date(issuedAt.getTime() + profile.dueDays * 86400e3);

    const invoiceNumber = await nextInvoiceNumber(db, run.period);
    await db.invoice.create({
      data: {
        invoiceNumber,
        invoiceRunId: run.id,
        customerId: sub.customerId,
        subscriptionId: sub.id,
        type: "MONTHLY",
        period: run.period,
        issuedAt,
        dueAt,
        subtotal,
        taxPercent: profile.taxPercent,
        taxAmount,
        totalAmount: subtotal + taxAmount,
        createdById: user.id,
        lines: { create: lines },
      },
    });
    created++;
  }

  // Rekap ulang dari data — bukan akumulasi — agar rerun tetap akurat.
  const agg = await db.invoice.aggregate({
    where: { invoiceRunId: run.id, status: { not: "VOID" } },
    _count: true,
    _sum: { totalAmount: true },
  });
  const total = agg._sum.totalAmount ?? 0n;
  await db.invoiceRun.update({
    where: { id: runId },
    data: { status: "PREVIEW", totalCount: agg._count, totalAmount: total },
  });
  await logAudit({
    userId: user.id,
    action: "INVOICE_RUN_GENERATE",
    module: "billing",
    entityType: "InvoiceRun",
    entityId: runId,
    description: `Generate run ${run.period}: ${created} invoice baru, ${skipped} dilewati (sudah ada)`,
  });
  return { ok: true, id: runId, data: { created, skipped, total: total.toString() } };
}

export async function postInvoiceRun(user: CurrentUser, runId: string): Promise<Result> {
  // Mode baca-saja. Ini yang paling mahal kalau lolos: profil penagihan sudah
  // siap untuk 1.709 langganan (~Rp 370 juta sebulan), dan tagihan yang
  // terbit itu nyata bagi pelanggan yang masih ditagih lewat ALUS.
  if (isOutwardBlocked()) return outwardBlocked("billing.post-invoice");
  const run = await db.invoiceRun.findUnique({
    where: { id: runId },
    include: { _count: { select: { invoices: true } } },
  });
  if (!run) return { ok: false, error: "Invoice run tidak ditemukan." };
  if (run.status !== "PREVIEW") {
    return { ok: false, error: "Run harus di-preview dulu sebelum diposting." };
  }
  if (run._count.invoices === 0) {
    return { ok: false, error: "Run tidak memiliki invoice — tidak ada yang diposting." };
  }
  // Fase 11: jurnal DULU, baru terbitkan (§0.2 — tidak ada invoice terbit
  // tanpa jurnal saat GL aktif). Idempoten: retry melewati yang terjurnal.
  const draftInvoices = await db.invoice.findMany({
    where: { invoiceRunId: runId, status: "DRAFT" },
    select: { id: true, invoiceNumber: true },
  });
  for (const inv of draftInvoices) {
    const journal = await postInvoiceJournal(inv.id);
    if (!journal.ok) {
      return { ok: false, error: `Jurnal ${inv.invoiceNumber} gagal: ${journal.error} — run tetap Preview, perbaiki lalu posting ulang.` };
    }
  }
  const now = new Date();
  await db.$transaction([
    db.invoice.updateMany({
      where: { invoiceRunId: runId, status: "DRAFT" },
      data: { status: "OPEN" },
    }),
    db.invoiceRun.update({
      where: { id: runId },
      data: { status: "POSTED", postedAt: now },
    }),
  ]);
  await logAudit({
    userId: user.id,
    action: "INVOICE_RUN_POST",
    module: "billing",
    entityType: "InvoiceRun",
    entityId: runId,
    description: `Posting run ${run.period}: ${run.totalCount} invoice terbit (OPEN)`,
  });
  return { ok: true, id: runId };
}

export async function cancelInvoiceRun(
  user: CurrentUser,
  runId: string,
  reason: string
): Promise<Result> {
  if (!reason?.trim()) return { ok: false, error: "Alasan pembatalan wajib diisi." };
  const run = await db.invoiceRun.findUnique({ where: { id: runId } });
  if (!run) return { ok: false, error: "Invoice run tidak ditemukan." };
  if (!["DRAFT", "PREVIEW"].includes(run.status)) {
    return {
      ok: false,
      error: "Run yang sudah diposting tidak bisa dibatalkan — void invoice satu per satu (§2.2).",
    };
  }
  // Bila retry posting sempat menjurnal sebagian draft, balik dulu jurnalnya
  // agar buku tidak menyimpan jurnal untuk invoice yang tak pernah terbit.
  const journaled = await db.invoice.findMany({
    where: { invoiceRunId: runId, status: "DRAFT", journalEntryId: { not: null } },
    select: { id: true, invoiceNumber: true },
  });
  for (const inv of journaled) {
    const reversed = await reverseInvoiceJournal(inv.id, `Run ${run.period} dibatalkan: ${reason}`);
    if (!reversed.ok) {
      return { ok: false, error: `Gagal membalik jurnal ${inv.invoiceNumber}: ${reversed.error}` };
    }
  }
  // Invoice masih DRAFT (belum pernah terbit) — boleh dihapus bersama run-nya.
  await db.$transaction([
    db.invoiceLine.deleteMany({
      where: { invoice: { invoiceRunId: runId, status: "DRAFT" } },
    }),
    db.invoice.deleteMany({ where: { invoiceRunId: runId, status: "DRAFT" } }),
    db.invoiceRun.update({
      where: { id: runId },
      data: { status: "CANCELLED", totalCount: 0, totalAmount: 0n },
    }),
  ]);
  await logAudit({
    userId: user.id,
    action: "INVOICE_RUN_CANCEL",
    module: "billing",
    entityType: "InvoiceRun",
    entityId: runId,
    description: `Membatalkan run ${run.period} (draft dibuang)`,
    metadata: { reason },
  });
  return { ok: true, id: runId };
}

// ── Invoice manual / non-bulanan ────────────────────────────────

export async function createManualInvoice(
  user: CurrentUser,
  data: {
    customerId: string;
    subscriptionId?: string | null;
    type: string; // INSTALLATION|ADJUSTMENT|MANUAL
    taxPercent: number;
    dueAt: Date;
    notes?: string;
    lines: { kind: string; description: string; quantity: number; unitPrice: bigint }[];
  }
): Promise<Result> {
  if (!isValidCode(INVOICE_TYPES, data.type) || data.type === "MONTHLY") {
    return { ok: false, error: "Jenis invoice manual tidak valid (MONTHLY hanya via run)." };
  }
  const customer = await db.customer.findUnique({ where: { id: data.customerId } });
  if (!customer) return { ok: false, error: "Pelanggan tidak ditemukan." };
  if (data.subscriptionId) {
    const sub = await db.subscription.findUnique({ where: { id: data.subscriptionId } });
    if (!sub || sub.customerId !== data.customerId) {
      return { ok: false, error: "Langganan tidak ditemukan / bukan milik pelanggan ini." };
    }
  }
  if (!Number.isFinite(data.taxPercent) || data.taxPercent < 0 || data.taxPercent > 100) {
    return { ok: false, error: "PPN harus 0–100%." };
  }
  if (data.dueAt.getTime() < Date.now() - 60000) {
    return { ok: false, error: "Jatuh tempo harus di masa depan." };
  }
  if (!data.lines.length) return { ok: false, error: "Invoice wajib memiliki minimal satu baris." };
  for (const l of data.lines) {
    if (!isValidCode(INVOICE_LINE_KINDS, l.kind)) {
      return { ok: false, error: `Jenis baris "${l.kind}" tidak dikenal.` };
    }
    if (!l.description?.trim()) return { ok: false, error: "Deskripsi baris wajib diisi." };
    if (!Number.isInteger(l.quantity) || l.quantity < 1) {
      return { ok: false, error: "Qty baris minimal 1." };
    }
    // Nominal negatif hanya untuk potongan/penyesuaian.
    if (l.unitPrice < 0n && !["DISCOUNT", "ADJUSTMENT"].includes(l.kind)) {
      return { ok: false, error: "Harga negatif hanya untuk baris Diskon/Penyesuaian." };
    }
  }
  const lines = data.lines.map((l) => ({
    kind: l.kind,
    refId: null,
    description: l.description,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    amount: l.unitPrice * BigInt(l.quantity),
  }));
  const subtotal = lines.reduce((acc, l) => acc + l.amount, 0n);
  if (subtotal <= 0n) {
    return { ok: false, error: "Total invoice harus lebih dari nol." };
  }
  const taxAmount = taxOf(subtotal, data.taxPercent);
  const invoiceNumber = await nextInvoiceNumber(db, null);
  const invoice = await db.invoice.create({
    data: {
      invoiceNumber,
      customerId: data.customerId,
      subscriptionId: data.subscriptionId ?? null,
      type: data.type,
      issuedAt: new Date(),
      dueAt: data.dueAt,
      subtotal,
      taxPercent: data.taxPercent,
      taxAmount,
      totalAmount: subtotal + taxAmount,
      status: "OPEN", // manual langsung terbit
      notes: data.notes || null,
      createdById: user.id,
      lines: { create: lines },
    },
  });
  // Fase 11: invoice terbit wajib berjurnal saat GL aktif — gagal jurnal =
  // invoice dibatalkan (tidak pernah terlihat).
  const journal = await postInvoiceJournal(invoice.id);
  if (!journal.ok) {
    await db.invoiceLine.deleteMany({ where: { invoiceId: invoice.id } });
    await db.invoice.delete({ where: { id: invoice.id } });
    return { ok: false, error: `Jurnal gagal: ${journal.error}` };
  }
  await logAudit({
    userId: user.id,
    action: "INVOICE_CREATE",
    module: "billing",
    entityType: "Invoice",
    entityId: invoice.id,
    description: `Invoice ${invoiceNumber} (${data.type}) untuk ${customer.name}: Rp${(subtotal + taxAmount).toString()}`,
  });
  return { ok: true, id: invoice.id };
}

// §2.2: pembatalan = VOID + alasan (+ invoice pengganti bila perlu) — bukan hapus.
export async function voidInvoice(
  user: CurrentUser,
  invoiceId: string,
  reason: string
): Promise<Result> {
  if (!reason?.trim()) return { ok: false, error: "Alasan void wajib diisi (§2.2)." };
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return { ok: false, error: "Invoice tidak ditemukan." };
  if (invoice.status === "VOID") return { ok: false, error: "Invoice sudah void." };
  if (!["OPEN", "DRAFT"].includes(invoice.status)) {
    return { ok: false, error: "Hanya invoice belum-dibayar yang bisa di-void." };
  }
  if (invoice.paidAmount > 0n) {
    return {
      ok: false,
      error: "Invoice sudah menerima pembayaran — buat invoice penyesuaian, bukan void.",
    };
  }
  // Fase 11: jurnal balik DULU — void gagal bila bukunya tidak bisa dibalik.
  const reversed = await reverseInvoiceJournal(invoiceId, `Void: ${reason}`);
  if (!reversed.ok) {
    return { ok: false, error: `Jurnal balik gagal: ${reversed.error}` };
  }
  await db.invoice.update({
    where: { id: invoiceId },
    data: { status: "VOID", voidReason: reason },
  });
  await logAudit({
    userId: user.id,
    action: "INVOICE_VOID",
    module: "billing",
    entityType: "Invoice",
    entityId: invoiceId,
    description: `Void invoice ${invoice.invoiceNumber}`,
    metadata: { reason },
  });
  return { ok: true, id: invoiceId };
}

// ── Aging piutang (G5) ──────────────────────────────────────────

export interface AgingRow {
  customerId: string;
  customerName: string;
  customerNumber: string;
  unpaidCount: number;
  overdueCount: number;
  totalOutstanding: bigint;
  oldestDueAt: Date;
}

export async function agingSummary(): Promise<AgingRow[]> {
  const invoices = await db.invoice.findMany({
    where: { status: { in: ["OPEN", "PARTIAL"] } },
    include: { customer: true },
    orderBy: { dueAt: "asc" },
  });
  const now = Date.now();
  const map = new Map<string, AgingRow>();
  for (const inv of invoices) {
    const outstanding = inv.totalAmount - inv.paidAmount;
    const row = map.get(inv.customerId) ?? {
      customerId: inv.customerId,
      customerName: inv.customer.name,
      customerNumber: inv.customer.customerNumber,
      unpaidCount: 0,
      overdueCount: 0,
      totalOutstanding: 0n,
      oldestDueAt: inv.dueAt,
    };
    row.unpaidCount++;
    if (inv.dueAt.getTime() < now) row.overdueCount++;
    row.totalOutstanding += outstanding;
    if (inv.dueAt < row.oldestDueAt) row.oldestDueAt = inv.dueAt;
    map.set(inv.customerId, row);
  }
  // Penunggak terbanyak dulu — basis penentuan isolir (Fase 10).
  return [...map.values()].sort(
    (a, b) => b.overdueCount - a.overdueCount || Number(b.totalOutstanding - a.totalOutstanding)
  );
}
