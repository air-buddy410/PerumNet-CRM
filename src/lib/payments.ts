import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { autoRestoreAfterPayment } from "@/lib/dunning";
import { PAYMENT_METHODS, GATEWAY_PROVIDERS } from "@/lib/constants";
import type { CurrentUser } from "@/lib/rbac";

// ── Payment Engine (DESIGN-PHASE-8 §3, gap G2/G14/G22) ──────────
// Aturan yang ditegakkan DI SINI, bukan di UI:
//  - Alokasi eksplisit: jumlah alokasi WAJIB sama dengan amount (§3.2);
//    tiap alokasi ≤ sisa tagihan invoice-nya, invoice milik pelanggan yang
//    sama, dan hanya invoice OPEN/PARTIAL yang bisa dibayar.
//  - paidAmount & status invoice HANYA berubah lewat posting/reversal
//    pembayaran — tidak ada jalur edit langsung.
//  - Pembatalan = REVERSED + pembayaran cermin (reversalOfId), meniru pola
//    CashTransaction; piutang dikembalikan, riwayat tidak dihapus.
//  - Pembayaran GATEWAY hanya dibuat sistem dari webhook bundle — tidak
//    bisa dicatat manual.
//  - Fee kolektor dicatat per pembayaran (persen default dari merchant);
//    jurnal Hutang Fee menyusul di GL Fase 11.

type Result<T = undefined> =
  | { ok: true; id: string; data?: T }
  | { ok: false; error: string };

function isValidCode(list: readonly (readonly [string, string])[], code: string): boolean {
  return list.some(([c]) => c === code);
}

async function nextNumber(base: string, count: (prefix: string) => Promise<number>): Promise<string> {
  const now = new Date();
  const prefix = `${base}-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const n = await count(prefix);
  return `${prefix}-${String(n + 1).padStart(4, "0")}`;
}

// ── Merchant / mitra kolektor (G14) ─────────────────────────────

export async function saveMerchant(
  user: CurrentUser,
  data: {
    id?: string;
    code: string;
    name: string;
    contactName?: string;
    phone?: string;
    address?: string;
    isPaymentPoint?: boolean;
    cashbookId?: string | null;
    feePercent: number;
    isActive?: boolean;
  }
): Promise<Result> {
  const code = data.code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,20}$/.test(code)) {
    return { ok: false, error: "Kode merchant: huruf/angka/strip, 2–20 karakter." };
  }
  if (!data.name?.trim()) return { ok: false, error: "Nama merchant wajib diisi." };
  if (!Number.isFinite(data.feePercent) || data.feePercent < 0 || data.feePercent > 100) {
    return { ok: false, error: "Fee harus 0–100%." };
  }
  if (data.cashbookId) {
    const cb = await db.cashbook.findUnique({ where: { id: data.cashbookId } });
    if (!cb) return { ok: false, error: "Cashbook tidak ditemukan." };
  }
  const dup = await db.merchant.findFirst({
    where: { code, ...(data.id ? { id: { not: data.id } } : {}) },
  });
  if (dup) return { ok: false, error: `Kode "${code}" sudah dipakai merchant lain.` };

  const payload = {
    code,
    name: data.name,
    contactName: data.contactName || null,
    phone: data.phone || null,
    address: data.address || null,
    isPaymentPoint: data.isPaymentPoint ?? false,
    cashbookId: data.cashbookId || null,
    feePercent: data.feePercent,
    isActive: data.isActive ?? true,
  };
  const merchant = data.id
    ? await db.merchant.update({ where: { id: data.id }, data: payload })
    : await db.merchant.create({ data: payload });
  await logAudit({
    userId: user.id,
    action: data.id ? "MERCHANT_UPDATE" : "MERCHANT_CREATE",
    module: "billing",
    entityType: "Merchant",
    entityId: merchant.id,
    description: `${data.id ? "Mengubah" : "Mendaftarkan"} merchant ${code} (fee ${data.feePercent}%)`,
  });
  return { ok: true, id: merchant.id };
}

// Fee kolektor per pembayaran: persen merchant × amount, half-up.
export function feeOf(amount: bigint, feePercent: number): bigint {
  const basisPoints = BigInt(Math.round(feePercent * 100));
  return (amount * basisPoints + 5000n) / 10000n;
}

// ── Validasi alokasi bersama ────────────────────────────────────

async function validateAllocations(
  customerId: string,
  allocations: { invoiceId: string; amount: bigint }[],
  totalAmount: bigint
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!allocations.length) {
    return { ok: false, error: "Pembayaran wajib dialokasikan ke minimal satu invoice." };
  }
  const seen = new Set<string>();
  let sum = 0n;
  for (const alloc of allocations) {
    if (alloc.amount <= 0n) return { ok: false, error: "Nominal alokasi harus lebih dari nol." };
    if (seen.has(alloc.invoiceId)) {
      return { ok: false, error: "Satu invoice tidak boleh dialokasikan dua kali dalam satu pembayaran." };
    }
    seen.add(alloc.invoiceId);
    const invoice = await db.invoice.findUnique({ where: { id: alloc.invoiceId } });
    if (!invoice) return { ok: false, error: "Invoice tidak ditemukan." };
    if (invoice.customerId !== customerId) {
      return { ok: false, error: `Invoice ${invoice.invoiceNumber} bukan milik pelanggan ini.` };
    }
    if (!["OPEN", "PARTIAL"].includes(invoice.status)) {
      return { ok: false, error: `Invoice ${invoice.invoiceNumber} tidak dalam status tertagih.` };
    }
    const outstanding = invoice.totalAmount - invoice.paidAmount;
    if (alloc.amount > outstanding) {
      return {
        ok: false,
        error: `Alokasi ${invoice.invoiceNumber} melebihi sisa tagihan (${outstanding}).`,
      };
    }
    sum += alloc.amount;
  }
  if (sum !== totalAmount) {
    return {
      ok: false,
      error: `Jumlah alokasi (${sum}) harus sama dengan nominal pembayaran (${totalAmount}) — §3.2.`,
    };
  }
  return { ok: true };
}

// ── Payment (G2) ────────────────────────────────────────────────

export async function createPayment(
  user: CurrentUser,
  data: {
    customerId: string;
    merchantId?: string | null;
    method: string;
    cashbookId?: string | null;
    amount: bigint;
    feeAmount?: bigint | null; // null = hitung dari fee% merchant
    paidAt: Date;
    notes?: string;
    allocations: { invoiceId: string; amount: bigint }[];
  }
): Promise<Result> {
  if (!isValidCode(PAYMENT_METHODS, data.method)) {
    return { ok: false, error: "Metode pembayaran tidak dikenal." };
  }
  if (data.method === "GATEWAY") {
    return { ok: false, error: "Pembayaran gateway dibuat otomatis dari webhook bundle — tidak dicatat manual." };
  }
  const customer = await db.customer.findUnique({ where: { id: data.customerId } });
  if (!customer) return { ok: false, error: "Pelanggan tidak ditemukan." };
  if (data.amount <= 0n) return { ok: false, error: "Nominal pembayaran harus lebih dari nol." };
  if (!data.cashbookId) {
    return { ok: false, error: "Pembayaran tunai/transfer wajib memilih kas tujuan setoran." };
  }
  const cashbook = await db.cashbook.findUnique({ where: { id: data.cashbookId } });
  if (!cashbook) return { ok: false, error: "Cashbook tidak ditemukan." };

  let merchant = null;
  if (data.merchantId) {
    merchant = await db.merchant.findUnique({ where: { id: data.merchantId } });
    if (!merchant || !merchant.isActive) {
      return { ok: false, error: "Merchant tidak ditemukan / nonaktif." };
    }
  }
  const feeAmount = data.feeAmount ?? (merchant ? feeOf(data.amount, merchant.feePercent) : 0n);
  if (feeAmount < 0n || feeAmount > data.amount) {
    return { ok: false, error: "Fee tidak boleh negatif atau melebihi nominal pembayaran." };
  }

  const valid = await validateAllocations(data.customerId, data.allocations, data.amount);
  if (!valid.ok) return valid;

  const paymentNumber = await nextNumber("PAY", (p) =>
    db.payment.count({ where: { paymentNumber: { startsWith: p } } })
  );
  const payment = await db.payment.create({
    data: {
      paymentNumber,
      customerId: data.customerId,
      merchantId: data.merchantId || null,
      receivedById: user.id,
      method: data.method,
      cashbookId: data.cashbookId,
      amount: data.amount,
      feeAmount,
      netAmount: data.amount - feeAmount,
      paidAt: data.paidAt,
      notes: data.notes || null,
      createdById: user.id,
      allocations: { create: data.allocations.map((a) => ({ invoiceId: a.invoiceId, amount: a.amount })) },
    },
  });
  await logAudit({
    userId: user.id,
    action: "PAYMENT_CREATE",
    module: "billing",
    entityType: "Payment",
    entityId: payment.id,
    description: `Draft pembayaran ${paymentNumber} dari ${customer.name}: Rp${data.amount}${merchant ? ` via ${merchant.name}` : ""}`,
  });
  return { ok: true, id: payment.id };
}

// Terapkan/lepaskan alokasi ke invoice. arah +1 = posting, -1 = reversal.
async function applyAllocations(
  allocations: { invoiceId: string; amount: bigint }[],
  direction: 1 | -1
): Promise<{ ok: true } | { ok: false; error: string }> {
  for (const alloc of allocations) {
    const invoice = await db.invoice.findUnique({ where: { id: alloc.invoiceId } });
    if (!invoice) return { ok: false, error: "Invoice alokasi tidak ditemukan." };
    const delta = direction === 1 ? alloc.amount : -alloc.amount;
    const newPaid = invoice.paidAmount + delta;
    if (newPaid < 0n) {
      return { ok: false, error: `Reversal membuat ${invoice.invoiceNumber} negatif — data tidak konsisten.` };
    }
    if (direction === 1 && newPaid > invoice.totalAmount) {
      return { ok: false, error: `Pembayaran melebihi total ${invoice.invoiceNumber}.` };
    }
    await db.invoice.update({
      where: { id: alloc.invoiceId },
      data: {
        paidAmount: newPaid,
        status: newPaid >= invoice.totalAmount ? "PAID" : newPaid > 0n ? "PARTIAL" : "OPEN",
      },
    });
  }
  return { ok: true };
}

export async function postPayment(user: CurrentUser, paymentId: string): Promise<Result> {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { allocations: true, customer: true },
  });
  if (!payment) return { ok: false, error: "Pembayaran tidak ditemukan." };
  if (payment.status !== "DRAFT") return { ok: false, error: "Hanya draft yang bisa diposting." };

  // Validasi ulang saat posting — sisa tagihan bisa berubah sejak draft.
  const valid = await validateAllocations(
    payment.customerId,
    payment.allocations.map((a) => ({ invoiceId: a.invoiceId, amount: a.amount })),
    payment.amount
  );
  if (!valid.ok) return valid;

  const applied = await applyAllocations(
    payment.allocations.map((a) => ({ invoiceId: a.invoiceId, amount: a.amount })),
    1
  );
  if (!applied.ok) return applied;

  await db.payment.update({ where: { id: paymentId }, data: { status: "POSTED" } });
  await logAudit({
    userId: user.id,
    action: "PAYMENT_POST",
    module: "billing",
    entityType: "Payment",
    entityId: paymentId,
    description: `Posting pembayaran ${payment.paymentNumber} (${payment.allocations.length} invoice)`,
  });
  // Fase 10: buka isolir otomatis bila tunggakan sudah lunas (tidak melempar).
  await autoRestoreAfterPayment(payment.customerId);
  return { ok: true, id: paymentId };
}

export async function reversePayment(
  user: CurrentUser,
  paymentId: string,
  reason: string
): Promise<Result> {
  if (!reason?.trim()) return { ok: false, error: "Alasan reversal wajib diisi." };
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { allocations: true, reversal: true },
  });
  if (!payment) return { ok: false, error: "Pembayaran tidak ditemukan." };
  if (payment.status !== "POSTED") {
    return { ok: false, error: "Hanya pembayaran posted yang bisa di-reverse." };
  }
  if (payment.reversalOfId) {
    return { ok: false, error: "Pembayaran reversal tidak bisa di-reverse lagi." };
  }
  if (payment.reversal) {
    return { ok: false, error: "Pembayaran ini sudah pernah di-reverse." };
  }

  const applied = await applyAllocations(
    payment.allocations.map((a) => ({ invoiceId: a.invoiceId, amount: a.amount })),
    -1
  );
  if (!applied.ok) return applied;

  const paymentNumber = await nextNumber("PAY", (p) =>
    db.payment.count({ where: { paymentNumber: { startsWith: p } } })
  );
  const mirror = await db.payment.create({
    data: {
      paymentNumber,
      customerId: payment.customerId,
      merchantId: payment.merchantId,
      receivedById: payment.receivedById,
      method: payment.method,
      cashbookId: payment.cashbookId,
      gatewayTxId: payment.gatewayTxId,
      amount: payment.amount,
      feeAmount: payment.feeAmount,
      netAmount: payment.netAmount,
      paidAt: new Date(),
      status: "POSTED",
      reversalOfId: payment.id,
      notes: `[Reversal ${payment.paymentNumber}] ${reason}`,
      createdById: user.id,
      allocations: {
        create: payment.allocations.map((a) => ({ invoiceId: a.invoiceId, amount: a.amount })),
      },
    },
  });
  await db.payment.update({ where: { id: paymentId }, data: { status: "REVERSED" } });
  await logAudit({
    userId: user.id,
    action: "PAYMENT_REVERSE",
    module: "billing",
    entityType: "Payment",
    entityId: paymentId,
    description: `Reversal ${payment.paymentNumber} → ${paymentNumber}; piutang dikembalikan`,
    metadata: { reason },
  });
  return { ok: true, id: mirror.id };
}

// ── Bundle gateway (padanan "Bundle Payment") ───────────────────

export async function createGatewayTx(
  user: CurrentUser,
  data: {
    customerId: string;
    invoiceIds: string[];
    provider: string;
    integrationId?: string | null;
    expiresAt?: Date | null;
  }
): Promise<Result<{ totalAmount: string }>> {
  if (!isValidCode(GATEWAY_PROVIDERS, data.provider)) {
    return { ok: false, error: "Provider gateway tidak dikenal." };
  }
  const customer = await db.customer.findUnique({ where: { id: data.customerId } });
  if (!customer) return { ok: false, error: "Pelanggan tidak ditemukan." };
  if (!data.invoiceIds.length) {
    return { ok: false, error: "Pilih minimal satu invoice untuk bundle." };
  }
  let total = 0n;
  for (const invId of [...new Set(data.invoiceIds)]) {
    const invoice = await db.invoice.findUnique({ where: { id: invId } });
    if (!invoice) return { ok: false, error: "Invoice tidak ditemukan." };
    if (invoice.customerId !== data.customerId) {
      return { ok: false, error: `Invoice ${invoice.invoiceNumber} bukan milik pelanggan ini.` };
    }
    if (!["OPEN", "PARTIAL"].includes(invoice.status)) {
      return { ok: false, error: `Invoice ${invoice.invoiceNumber} tidak dalam status tertagih.` };
    }
    // Satu invoice tidak boleh berada di dua bundle PENDING sekaligus.
    const pendingBundle = await db.paymentGatewayTxInvoice.findFirst({
      where: { invoiceId: invId, gatewayTx: { status: "PENDING" } },
    });
    if (pendingBundle) {
      return { ok: false, error: `Invoice ${invoice.invoiceNumber} sudah ada di bundle lain yang masih pending.` };
    }
    total += invoice.totalAmount - invoice.paidAmount;
  }
  if (data.integrationId) {
    const integration = await db.integration.findUnique({ where: { id: data.integrationId } });
    if (!integration) return { ok: false, error: "Integrasi tidak ditemukan." };
  }

  const bundleRef = await nextNumber("GTX", (p) =>
    db.paymentGatewayTx.count({ where: { bundleRef: { startsWith: p } } })
  );
  const tx = await db.paymentGatewayTx.create({
    data: {
      bundleRef,
      provider: data.provider,
      integrationId: data.integrationId || null,
      customerId: data.customerId,
      totalAmount: total,
      expiresAt: data.expiresAt ?? null,
      createdById: user.id,
      invoices: { create: [...new Set(data.invoiceIds)].map((invoiceId) => ({ invoiceId })) },
    },
  });
  await logAudit({
    userId: user.id,
    action: "GATEWAY_TX_CREATE",
    module: "billing",
    entityType: "PaymentGatewayTx",
    entityId: tx.id,
    description: `Bundle ${bundleRef} (${data.provider}) untuk ${customer.name}: Rp${total}`,
  });
  return { ok: true, id: tx.id, data: { totalAmount: total.toString() } };
}

// Webhook gateway (dipanggil route /api/integrations/[code]/webhook untuk
// integrasi kategori CRM_CUSTOMER). Payload generik:
//   { bundleRef, status: "PAID"|"EXPIRED"|"CANCELLED"|"FAILED", feeAmount? }
export interface GatewayEvent {
  bundleRef?: string;
  status?: string;
  feeAmount?: string | number;
}

export async function ingestGatewayEvent(
  integrationCode: string,
  token: string | null,
  event: GatewayEvent
): Promise<Result<{ action: string; paymentNumber?: string }>> {
  const integration = await db.integration.findUnique({
    where: { code: integrationCode.toLowerCase() },
  });
  if (!integration) return { ok: false, error: "Integrasi tidak ditemukan." };
  if (!token || token !== integration.webhookToken) {
    return { ok: false, error: "Token webhook tidak valid." };
  }
  if (!integration.isEnabled) return { ok: false, error: "Integrasi sedang dinonaktifkan." };

  const logEvent = async (status: "OK" | "REJECTED", detail: string) => {
    try {
      await db.integrationEvent.create({
        data: {
          integrationId: integration.id,
          direction: "IN",
          eventType: "GATEWAY_EVENT",
          payload: JSON.stringify(event).slice(0, 2000),
          status,
          detail,
        },
      });
      await db.integration.update({
        where: { id: integration.id },
        data: { lastEventAt: new Date() },
      });
    } catch (e) {
      console.error("[payments] gagal mencatat event:", e);
    }
  };

  if (!event.bundleRef) {
    await logEvent("REJECTED", "Payload tanpa bundleRef");
    return { ok: false, error: "Field bundleRef wajib diisi." };
  }
  const bundle = await db.paymentGatewayTx.findUnique({
    where: { bundleRef: event.bundleRef },
    include: { invoices: { include: { invoice: true } } },
  });
  if (!bundle) {
    await logEvent("REJECTED", `Bundle ${event.bundleRef} tidak ditemukan`);
    return { ok: false, error: "Bundle tidak ditemukan." };
  }
  const status = (event.status ?? "").toUpperCase();
  if (!["PAID", "EXPIRED", "CANCELLED", "FAILED"].includes(status)) {
    await logEvent("REJECTED", `Status "${event.status}" tidak dikenal`);
    return { ok: false, error: "Status event tidak dikenal." };
  }
  if (bundle.status !== "PENDING") {
    await logEvent("OK", `Bundle ${bundle.bundleRef} sudah ${bundle.status} — event diabaikan`);
    return { ok: true, id: bundle.id, data: { action: "IGNORED_FINAL" } };
  }

  if (status !== "PAID") {
    await db.paymentGatewayTx.update({
      where: { id: bundle.id },
      data: { status, rawPayload: JSON.stringify(event).slice(0, 2000) },
    });
    await logEvent("OK", `Bundle ${bundle.bundleRef} → ${status}`);
    return { ok: true, id: bundle.id, data: { action: status } };
  }

  // PAID → buat & posting pembayaran GATEWAY teralokasi ke sisa tagihan bundle.
  const allocations: { invoiceId: string; amount: bigint }[] = [];
  let total = 0n;
  for (const bi of bundle.invoices) {
    const outstanding = bi.invoice.totalAmount - bi.invoice.paidAmount;
    if (outstanding <= 0n) continue;
    allocations.push({ invoiceId: bi.invoiceId, amount: outstanding });
    total += outstanding;
  }
  if (total === 0n) {
    await db.paymentGatewayTx.update({
      where: { id: bundle.id },
      data: { status: "PAID", paidAmount: 0n, rawPayload: JSON.stringify(event).slice(0, 2000) },
    });
    await logEvent("OK", `Bundle ${bundle.bundleRef} PAID tetapi seluruh invoice sudah lunas`);
    return { ok: true, id: bundle.id, data: { action: "PAID_NO_OUTSTANDING" } };
  }

  const feeAmount = BigInt(String(event.feeAmount ?? "0").replace(/[^0-9]/g, "") || "0");
  if (feeAmount > total) {
    await logEvent("REJECTED", "feeAmount melebihi total bundle");
    return { ok: false, error: "Fee gateway melebihi total pembayaran." };
  }
  const paymentNumber = await nextNumber("PAY", (p) =>
    db.payment.count({ where: { paymentNumber: { startsWith: p } } })
  );
  const payment = await db.payment.create({
    data: {
      paymentNumber,
      customerId: bundle.customerId,
      method: "GATEWAY",
      gatewayTxId: bundle.id,
      amount: total,
      feeAmount,
      netAmount: total - feeAmount,
      paidAt: new Date(),
      status: "DRAFT",
      notes: `Gateway ${bundle.provider} — bundle ${bundle.bundleRef}`,
      createdById: bundle.createdById, // pencatat bundle sebagai jejak
      allocations: { create: allocations.map((a) => ({ invoiceId: a.invoiceId, amount: a.amount })) },
    },
  });
  const applied = await applyAllocations(allocations, 1);
  if (!applied.ok) {
    await logEvent("REJECTED", `Gagal alokasi: ${applied.error}`);
    return applied;
  }
  await db.$transaction([
    db.payment.update({ where: { id: payment.id }, data: { status: "POSTED" } }),
    db.paymentGatewayTx.update({
      where: { id: bundle.id },
      data: { status: "PAID", paidAmount: total, rawPayload: JSON.stringify(event).slice(0, 2000) },
    }),
  ]);
  await logEvent("OK", `Bundle ${bundle.bundleRef} PAID → ${paymentNumber} (Rp${total})`);
  await logAudit({
    userId: null,
    action: "PAYMENT_GATEWAY_POSTED",
    module: "billing",
    entityType: "Payment",
    entityId: payment.id,
    description: `Pembayaran gateway ${paymentNumber} dari webhook ${integration.code}: Rp${total} (${allocations.length} invoice)`,
  });
  // Fase 10: buka isolir otomatis bila tunggakan sudah lunas (tidak melempar).
  await autoRestoreAfterPayment(bundle.customerId);
  return { ok: true, id: payment.id, data: { action: "PAID", paymentNumber } };
}

// ── Rekap fee kolektor (basis Hutang Fee di GL Fase 11) ─────────

export interface MerchantFeeRow {
  merchantId: string;
  merchantName: string;
  merchantCode: string;
  feePercent: number;
  paymentCount: number;
  totalCollected: bigint;
  totalFee: bigint;
}

export async function merchantFeeSummary(): Promise<MerchantFeeRow[]> {
  // Hanya pembayaran valid: POSTED, bukan cermin reversal, belum di-reverse.
  const payments = await db.payment.findMany({
    where: { status: "POSTED", reversalOfId: null, merchantId: { not: null } },
    include: { merchant: true },
  });
  const map = new Map<string, MerchantFeeRow>();
  for (const p of payments) {
    const m = p.merchant!;
    const row = map.get(m.id) ?? {
      merchantId: m.id,
      merchantName: m.name,
      merchantCode: m.code,
      feePercent: m.feePercent,
      paymentCount: 0,
      totalCollected: 0n,
      totalFee: 0n,
    };
    row.paymentCount++;
    row.totalCollected += p.amount;
    row.totalFee += p.feeAmount;
    map.set(m.id, row);
  }
  return [...map.values()].sort((a, b) => Number(b.totalFee - a.totalFee));
}
