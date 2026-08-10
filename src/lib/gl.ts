import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import {
  ACCOUNT_CATEGORIES,
  BALANCE_SHEET_ASSET_CATS,
  BALANCE_SHEET_LIABILITY_CATS,
  INCOME_CATS,
  EXPENSE_CATS,
} from "@/lib/constants";
import type { CurrentUser } from "@/lib/rbac";

// ── General Ledger Engine (DESIGN-PHASE-8 §5) ───────────────────
// Aturan yang ditegakkan DI SINI, bukan di UI:
//  - Jurnal append-only: tidak ada edit/hapus — koreksi = jurnal balik.
//  - Total debit = total kredit divalidasi di level transaksi.
//  - Setiap baris tepat satu sisi (debit ATAU kredit) dan > 0.
//  - Pemetaan peristiwa → akun lewat PostingRule, bukan hardcode.
//  - GL "aktif" bila rule INVOICE_POSTED aktif ada; bila belum
//    dikonfigurasi, auto-posting billing/payment dilewati (pra-GL).
//    Saat aktif, kegagalan jurnal MENGGAGALKAN operasi bisnis — uang
//    tidak boleh punya dua sumber kebenaran (§0.2).
//  - Laporan (buku besar, neraca saldo, neraca, laba rugi) adalah query
//    di atas jurnal — tidak ada tabel saldo terpisah.
//    (Arus kas, perubahan modal, dan rasio menyusul.)

type Result<T = undefined> =
  | { ok: true; id: string; data?: T }
  | { ok: false; error: string };

const ACCOUNT_CODE_RE = /^[0-9]-[0-9]{3,6}$/;

export interface JournalLineInput {
  accountId: string;
  debit?: bigint;
  credit?: bigint;
  description?: string;
  costCenterId?: string | null;
}

// ── Chart of Accounts ───────────────────────────────────────────

export async function saveAccount(
  user: CurrentUser,
  data: {
    id?: string;
    code: string;
    name: string;
    category: string;
    parentId?: string | null;
    isTaxAccount?: boolean;
    taxPercent?: number | null;
    cashbookId?: string | null;
    isActive?: boolean;
  }
): Promise<Result> {
  const code = data.code.trim();
  if (!ACCOUNT_CODE_RE.test(code)) {
    return { ok: false, error: 'Kode akun harus berpola "K-NNNNN", mis. 1-10100.' };
  }
  if (!data.name?.trim()) return { ok: false, error: "Nama akun wajib diisi." };
  const cat = ACCOUNT_CATEGORIES.find(([c]) => c === data.category);
  if (!cat) return { ok: false, error: "Kategori akun tidak dikenal." };
  if (data.parentId) {
    if (data.parentId === data.id) return { ok: false, error: "Akun tidak bisa menjadi induk dirinya sendiri." };
    const parent = await db.account.findUnique({ where: { id: data.parentId } });
    if (!parent) return { ok: false, error: "Akun induk tidak ditemukan." };
    if (parent.category !== data.category) {
      return { ok: false, error: "Akun anak harus sekategori dengan induknya." };
    }
  }
  if (
    data.taxPercent !== undefined &&
    data.taxPercent !== null &&
    (!Number.isFinite(data.taxPercent) || data.taxPercent < 0 || data.taxPercent > 100)
  ) {
    return { ok: false, error: "Persen pajak harus 0–100." };
  }
  if (data.cashbookId) {
    const cb = await db.cashbook.findUnique({ where: { id: data.cashbookId } });
    if (!cb) return { ok: false, error: "Cashbook tidak ditemukan." };
    const taken = await db.account.findFirst({
      where: { cashbookId: data.cashbookId, ...(data.id ? { id: { not: data.id } } : {}) },
    });
    if (taken) return { ok: false, error: `Cashbook sudah terpetakan ke akun ${taken.code}.` };
  }
  const dup = await db.account.findFirst({
    where: { code, ...(data.id ? { id: { not: data.id } } : {}) },
  });
  if (dup) return { ok: false, error: `Kode akun ${code} sudah dipakai.` };

  const payload = {
    code,
    name: data.name,
    category: data.category,
    normalSide: cat[2], // sisi normal mengikuti kategori
    parentId: data.parentId || null,
    isTaxAccount: data.isTaxAccount ?? false,
    taxPercent: data.taxPercent ?? null,
    cashbookId: data.cashbookId || null,
    isActive: data.isActive ?? true,
  };
  const account = data.id
    ? await db.account.update({ where: { id: data.id }, data: payload })
    : await db.account.create({ data: payload });
  await logAudit({
    userId: user.id,
    action: data.id ? "ACCOUNT_UPDATE" : "ACCOUNT_CREATE",
    module: "gl",
    entityType: "Account",
    entityId: account.id,
    description: `${data.id ? "Mengubah" : "Membuat"} akun ${code} — ${data.name}`,
  });
  return { ok: true, id: account.id };
}

export async function savePostingRule(
  user: CurrentUser,
  data: { event: string; debitAccountId?: string | null; creditAccountId?: string | null; isActive?: boolean }
): Promise<Result> {
  if (!data.debitAccountId && !data.creditAccountId) {
    return { ok: false, error: "Isi minimal satu akun (debit/kredit)." };
  }
  for (const accId of [data.debitAccountId, data.creditAccountId]) {
    if (accId) {
      const acc = await db.account.findUnique({ where: { id: accId } });
      if (!acc || !acc.isActive) return { ok: false, error: "Akun rule tidak ditemukan / nonaktif." };
    }
  }
  const rule = await db.postingRule.upsert({
    where: { event: data.event },
    update: {
      debitAccountId: data.debitAccountId || null,
      creditAccountId: data.creditAccountId || null,
      isActive: data.isActive ?? true,
    },
    create: {
      event: data.event,
      debitAccountId: data.debitAccountId || null,
      creditAccountId: data.creditAccountId || null,
      isActive: data.isActive ?? true,
    },
  });
  await logAudit({
    userId: user.id,
    action: "POSTING_RULE_SAVE",
    module: "gl",
    entityType: "PostingRule",
    entityId: rule.id,
    description: `Pemetaan posting ${data.event} diperbarui`,
  });
  return { ok: true, id: rule.id };
}

// ── Jurnal (append-only) ────────────────────────────────────────

async function nextEntryNumber(): Promise<string> {
  const now = new Date();
  const prefix = `JRN-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const n = await db.journalEntry.count({ where: { entryNumber: { startsWith: prefix } } });
  return `${prefix}-${String(n + 1).padStart(4, "0")}`;
}

export async function createJournalEntry(
  user: CurrentUser | null,
  data: {
    entryDate: Date;
    source: string;
    sourceId?: string | null;
    memo?: string;
    partyType?: string | null;
    partyId?: string | null;
    reversalOfId?: string | null;
    lines: JournalLineInput[];
  }
): Promise<Result> {
  if (Number.isNaN(data.entryDate.getTime())) {
    return { ok: false, error: "Tanggal jurnal tidak valid." };
  }
  if (data.lines.length < 2) {
    return { ok: false, error: "Jurnal minimal dua baris (debit dan kredit)." };
  }
  let totalDebit = 0n;
  let totalCredit = 0n;
  for (const line of data.lines) {
    const debit = line.debit ?? 0n;
    const credit = line.credit ?? 0n;
    if (debit < 0n || credit < 0n) {
      return { ok: false, error: "Nominal jurnal tidak boleh negatif." };
    }
    if ((debit > 0n) === (credit > 0n)) {
      return { ok: false, error: "Setiap baris harus tepat satu sisi: debit ATAU kredit, dan > 0." };
    }
    const account = await db.account.findUnique({ where: { id: line.accountId } });
    if (!account) return { ok: false, error: "Akun jurnal tidak ditemukan." };
    if (!account.isActive) {
      return { ok: false, error: `Akun ${account.code} nonaktif — tidak bisa dijurnal.` };
    }
    totalDebit += debit;
    totalCredit += credit;
  }
  // Aturan inti double-entry: debit = kredit.
  if (totalDebit !== totalCredit) {
    return {
      ok: false,
      error: `Jurnal tidak seimbang: debit ${totalDebit} ≠ kredit ${totalCredit}.`,
    };
  }
  if (totalDebit === 0n) return { ok: false, error: "Jurnal tidak boleh bernilai nol." };

  const entryNumber = await nextEntryNumber();
  const entry = await db.journalEntry.create({
    data: {
      entryNumber,
      entryDate: data.entryDate,
      source: data.source,
      sourceId: data.sourceId ?? null,
      memo: data.memo || null,
      partyType: data.partyType ?? null,
      partyId: data.partyId ?? null,
      reversalOfId: data.reversalOfId ?? null,
      postedById: user?.id ?? null,
      lines: {
        create: data.lines.map((l) => ({
          accountId: l.accountId,
          debit: l.debit ?? 0n,
          credit: l.credit ?? 0n,
          description: l.description || null,
          costCenterId: l.costCenterId ?? null,
        })),
      },
    },
  });
  await logAudit({
    userId: user?.id ?? null,
    action: "JOURNAL_POST",
    module: "gl",
    entityType: "JournalEntry",
    entityId: entry.id,
    description: `Jurnal ${entryNumber} (${data.source}): Rp${totalDebit}`,
  });
  return { ok: true, id: entry.id };
}

export async function reverseJournalEntry(
  user: CurrentUser | null,
  entryId: string,
  reason: string
): Promise<Result> {
  if (!reason?.trim()) return { ok: false, error: "Alasan jurnal balik wajib diisi." };
  const entry = await db.journalEntry.findUnique({
    where: { id: entryId },
    include: { lines: true, reversal: true },
  });
  if (!entry) return { ok: false, error: "Jurnal tidak ditemukan." };
  if (entry.status !== "POSTED") return { ok: false, error: "Jurnal sudah di-reverse." };
  if (entry.reversalOfId) return { ok: false, error: "Jurnal balik tidak bisa dibalik lagi." };
  if (entry.reversal) return { ok: false, error: "Jurnal ini sudah punya jurnal balik." };

  const mirror = await createJournalEntry(user, {
    entryDate: new Date(),
    source: "REVERSAL",
    sourceId: entry.id,
    memo: `[Balik ${entry.entryNumber}] ${reason}`,
    partyType: entry.partyType,
    partyId: entry.partyId,
    reversalOfId: entry.id,
    lines: entry.lines.map((l) => ({
      accountId: l.accountId,
      debit: l.credit, // sisi ditukar
      credit: l.debit,
      description: l.description ?? undefined,
      costCenterId: l.costCenterId,
    })),
  });
  if (!mirror.ok) return mirror;
  await db.journalEntry.update({ where: { id: entryId }, data: { status: "REVERSED" } });
  await logAudit({
    userId: user?.id ?? null,
    action: "JOURNAL_REVERSE",
    module: "gl",
    entityType: "JournalEntry",
    entityId: entryId,
    description: `Jurnal ${entry.entryNumber} dibalik`,
    metadata: { reason },
  });
  return mirror;
}

// ── Auto-posting dari peristiwa billing/payment ─────────────────

async function ruleAccounts(event: string): Promise<{ debitId: string | null; creditId: string | null } | null> {
  const rule = await db.postingRule.findUnique({ where: { event } });
  if (!rule || !rule.isActive) return null;
  return { debitId: rule.debitAccountId, creditId: rule.creditAccountId };
}

// GL aktif = rule INVOICE_POSTED aktif ada (§5).
export async function isGlActive(): Promise<boolean> {
  return (await ruleAccounts("INVOICE_POSTED")) !== null;
}

// Kas tujuan pembayaran: akun yang terpetakan ke cashbook-nya, atau
// fallback akun debit rule PAYMENT_RECEIVED.
async function cashAccountFor(cashbookId: string | null): Promise<string | null> {
  if (cashbookId) {
    const mapped = await db.account.findFirst({ where: { cashbookId, isActive: true } });
    if (mapped) return mapped.id;
  }
  const rule = await ruleAccounts("PAYMENT_RECEIVED");
  return rule?.debitId ?? null;
}

export async function postInvoiceJournal(invoiceId: string): Promise<Result | { ok: true; id: "SKIPPED" }> {
  if (!(await isGlActive())) return { ok: true, id: "SKIPPED" };
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, include: { customer: true } });
  if (!invoice) return { ok: false, error: "Invoice tidak ditemukan." };
  if (invoice.journalEntryId) return { ok: true, id: invoice.journalEntryId }; // idempoten

  const main = await ruleAccounts("INVOICE_POSTED");
  if (!main?.debitId || !main.creditId) {
    return { ok: false, error: "Posting rule INVOICE_POSTED belum lengkap (debit & kredit)." };
  }
  const lines: JournalLineInput[] = [
    { accountId: main.debitId, debit: invoice.totalAmount, description: `Piutang ${invoice.invoiceNumber}` },
    { accountId: main.creditId, credit: invoice.subtotal, description: `Pendapatan ${invoice.invoiceNumber}` },
  ];
  if (invoice.taxAmount > 0n) {
    const tax = await ruleAccounts("INVOICE_TAX");
    if (!tax?.creditId) {
      return { ok: false, error: "Invoice ber-PPN tetapi rule INVOICE_TAX belum dipetakan." };
    }
    lines.push({ accountId: tax.creditId, credit: invoice.taxAmount, description: `PPN ${invoice.invoiceNumber}` });
  }
  const entry = await createJournalEntry(null, {
    entryDate: invoice.issuedAt,
    source: "INVOICE",
    sourceId: invoice.id,
    memo: `Invoice ${invoice.invoiceNumber} — ${invoice.customer.name}`,
    partyType: "CUSTOMER",
    partyId: invoice.customerId,
    lines,
  });
  if (!entry.ok) return entry;
  await db.invoice.update({ where: { id: invoiceId }, data: { journalEntryId: entry.id } });
  return entry;
}

export async function reverseInvoiceJournal(invoiceId: string, reason: string): Promise<Result | { ok: true; id: "SKIPPED" }> {
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice?.journalEntryId) return { ok: true, id: "SKIPPED" }; // belum/tidak terjurnal
  return reverseJournalEntry(null, invoice.journalEntryId, reason);
}

export async function postPaymentJournal(paymentId: string): Promise<Result | { ok: true; id: "SKIPPED" }> {
  if (!(await isGlActive())) return { ok: true, id: "SKIPPED" };
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { customer: true, merchant: true },
  });
  if (!payment) return { ok: false, error: "Pembayaran tidak ditemukan." };
  if (payment.journalEntryId) return { ok: true, id: payment.journalEntryId }; // idempoten

  const main = await ruleAccounts("PAYMENT_RECEIVED");
  if (!main?.creditId) {
    return { ok: false, error: "Posting rule PAYMENT_RECEIVED belum lengkap." };
  }
  const cashId = await cashAccountFor(payment.cashbookId);
  if (!cashId) return { ok: false, error: "Akun kas untuk pembayaran belum terpetakan." };

  const lines: JournalLineInput[] = [];
  if (payment.method === "GATEWAY" && payment.feeAmount > 0n) {
    // §5: Debit Kas (netto) + Beban Biaya Gateway, Kredit Piutang (bruto).
    const fee = await ruleAccounts("GATEWAY_FEE");
    if (!fee?.debitId) return { ok: false, error: "Rule GATEWAY_FEE belum dipetakan." };
    lines.push(
      { accountId: cashId, debit: payment.netAmount, description: `Kas ${payment.paymentNumber}` },
      { accountId: fee.debitId, debit: payment.feeAmount, description: `Biaya gateway ${payment.paymentNumber}` },
      { accountId: main.creditId, credit: payment.amount, description: `Pelunasan piutang ${payment.paymentNumber}` }
    );
  } else {
    lines.push(
      { accountId: cashId, debit: payment.amount, description: `Kas ${payment.paymentNumber}` },
      { accountId: main.creditId, credit: payment.amount, description: `Pelunasan piutang ${payment.paymentNumber}` }
    );
  }
  const entry = await createJournalEntry(null, {
    entryDate: payment.paidAt,
    source: "PAYMENT",
    sourceId: payment.id,
    memo: `Pembayaran ${payment.paymentNumber} — ${payment.customer.name}${payment.merchant ? ` via ${payment.merchant.name}` : ""}`,
    partyType: "CUSTOMER",
    partyId: payment.customerId,
    lines,
  });
  if (!entry.ok) return entry;
  await db.payment.update({ where: { id: paymentId }, data: { journalEntryId: entry.id } });

  // Komisi kolektor = liabilitas (§3.2): Beban Fee → Hutang Fee, jurnal terpisah.
  if (payment.merchantId && payment.feeAmount > 0n && payment.method !== "GATEWAY") {
    const fee = await ruleAccounts("COLLECTOR_FEE");
    if (!fee?.debitId || !fee.creditId) {
      return { ok: false, error: "Rule COLLECTOR_FEE belum lengkap." };
    }
    const feeEntry = await createJournalEntry(null, {
      entryDate: payment.paidAt,
      source: "COLLECTOR_FEE",
      sourceId: payment.id,
      memo: `Komisi ${payment.merchant!.name} atas ${payment.paymentNumber}`,
      partyType: "MERCHANT",
      partyId: payment.merchantId,
      lines: [
        { accountId: fee.debitId, debit: payment.feeAmount, description: `Beban fee ${payment.paymentNumber}` },
        { accountId: fee.creditId, credit: payment.feeAmount, description: `Hutang fee ${payment.merchant!.name}` },
      ],
    });
    if (!feeEntry.ok) return feeEntry;
  }
  return entry;
}

export async function reversePaymentJournals(paymentId: string, reason: string): Promise<Result | { ok: true; id: "SKIPPED" }> {
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return { ok: false, error: "Pembayaran tidak ditemukan." };
  if (!payment.journalEntryId) return { ok: true, id: "SKIPPED" };
  const main = await reverseJournalEntry(null, payment.journalEntryId, reason);
  if (!main.ok) return main;
  // Jurnal fee kolektor (bila ada) ikut dibalik.
  const feeEntry = await db.journalEntry.findFirst({
    where: { source: "COLLECTOR_FEE", sourceId: paymentId, status: "POSTED" },
  });
  if (feeEntry) {
    const fee = await reverseJournalEntry(null, feeEntry.id, reason);
    if (!fee.ok) return fee;
  }
  return main;
}

// ── Laporan — query di atas jurnal ──────────────────────────────

export interface AccountBalance {
  accountId: string;
  code: string;
  name: string;
  category: string;
  normalSide: string;
  debit: bigint;
  credit: bigint;
  balance: bigint; // menurut sisi normal
}

async function sumLines(where: object): Promise<Map<string, { debit: bigint; credit: bigint }>> {
  const lines = await db.journalLine.findMany({ where, include: { entry: true } });
  const map = new Map<string, { debit: bigint; credit: bigint }>();
  for (const l of lines) {
    const cur = map.get(l.accountId) ?? { debit: 0n, credit: 0n };
    cur.debit += l.debit;
    cur.credit += l.credit;
    map.set(l.accountId, cur);
  }
  return map;
}

export async function trialBalance(from: Date, to: Date): Promise<{
  rows: { account: AccountBalance; opening: bigint; moveDebit: bigint; moveCredit: bigint; closing: bigint }[];
  totalDebit: bigint;
  totalCredit: bigint;
}> {
  const accounts = await db.account.findMany({ where: { isActive: true }, orderBy: { code: "asc" } });
  const before = await sumLines({ entry: { entryDate: { lt: from } } });
  const during = await sumLines({ entry: { entryDate: { gte: from, lte: to } } });
  const rows = [];
  let totalDebit = 0n;
  let totalCredit = 0n;
  for (const a of accounts) {
    const b = before.get(a.id) ?? { debit: 0n, credit: 0n };
    const d = during.get(a.id) ?? { debit: 0n, credit: 0n };
    const sign = a.normalSide === "DEBIT" ? 1n : -1n;
    const opening = (b.debit - b.credit) * sign;
    const closing = opening + (d.debit - d.credit) * sign;
    if (opening === 0n && d.debit === 0n && d.credit === 0n) continue;
    rows.push({
      account: {
        accountId: a.id, code: a.code, name: a.name, category: a.category,
        normalSide: a.normalSide, debit: d.debit, credit: d.credit, balance: closing,
      },
      opening,
      moveDebit: d.debit,
      moveCredit: d.credit,
      closing,
    });
    totalDebit += d.debit;
    totalCredit += d.credit;
  }
  return { rows, totalDebit, totalCredit };
}

export async function ledger(accountId: string, from: Date, to: Date): Promise<{
  opening: bigint;
  closing: bigint;
  entries: { date: Date; entryNumber: string; entryId: string; memo: string | null; description: string | null; debit: bigint; credit: bigint; running: bigint }[];
}> {
  const account = await db.account.findUnique({ where: { id: accountId } });
  if (!account) return { opening: 0n, closing: 0n, entries: [] };
  const sign = account.normalSide === "DEBIT" ? 1n : -1n;
  const before = await db.journalLine.aggregate({
    where: { accountId, entry: { entryDate: { lt: from } } },
    _sum: { debit: true, credit: true },
  });
  const opening = ((before._sum.debit ?? 0n) - (before._sum.credit ?? 0n)) * sign;
  const lines = await db.journalLine.findMany({
    where: { accountId, entry: { entryDate: { gte: from, lte: to } } },
    include: { entry: true },
    orderBy: [{ entry: { entryDate: "asc" } }, { id: "asc" }],
  });
  let running = opening;
  const entries = lines.map((l) => {
    running += (l.debit - l.credit) * sign;
    return {
      date: l.entry.entryDate,
      entryNumber: l.entry.entryNumber,
      entryId: l.entryId,
      memo: l.entry.memo,
      description: l.description,
      debit: l.debit,
      credit: l.credit,
      running,
    };
  });
  return { opening, closing: running, entries };
}

export async function incomeStatement(from: Date, to: Date): Promise<{
  income: AccountBalance[];
  expense: AccountBalance[];
  totalIncome: bigint;
  totalExpense: bigint;
  netIncome: bigint;
}> {
  const accounts = await db.account.findMany({
    where: { isActive: true, category: { in: [...INCOME_CATS, ...EXPENSE_CATS] } },
    orderBy: { code: "asc" },
  });
  const sums = await sumLines({ entry: { entryDate: { gte: from, lte: to } } });
  const income: AccountBalance[] = [];
  const expense: AccountBalance[] = [];
  let totalIncome = 0n;
  let totalExpense = 0n;
  for (const a of accounts) {
    const s = sums.get(a.id) ?? { debit: 0n, credit: 0n };
    if (s.debit === 0n && s.credit === 0n) continue;
    const isIncome = (INCOME_CATS as readonly string[]).includes(a.category);
    const balance = isIncome ? s.credit - s.debit : s.debit - s.credit;
    const row: AccountBalance = {
      accountId: a.id, code: a.code, name: a.name, category: a.category,
      normalSide: a.normalSide, debit: s.debit, credit: s.credit, balance,
    };
    if (isIncome) {
      income.push(row);
      totalIncome += balance;
    } else {
      expense.push(row);
      totalExpense += balance;
    }
  }
  return { income, expense, totalIncome, totalExpense, netIncome: totalIncome - totalExpense };
}

export async function balanceSheet(asOf: Date): Promise<{
  assets: AccountBalance[];
  liabilities: AccountBalance[];
  equity: AccountBalance[];
  totalAssets: bigint;
  totalLiabilities: bigint;
  totalEquity: bigint;
  retainedEarnings: bigint; // laba berjalan s.d. asOf
  balanced: boolean;
}> {
  const accounts = await db.account.findMany({ where: { isActive: true }, orderBy: { code: "asc" } });
  const sums = await sumLines({ entry: { entryDate: { lte: asOf } } });
  const assets: AccountBalance[] = [];
  const liabilities: AccountBalance[] = [];
  const equity: AccountBalance[] = [];
  let totalAssets = 0n;
  let totalLiabilities = 0n;
  let totalEquity = 0n;
  let income = 0n;
  let expense = 0n;
  for (const a of accounts) {
    const s = sums.get(a.id) ?? { debit: 0n, credit: 0n };
    if (s.debit === 0n && s.credit === 0n) continue;
    const sign = a.normalSide === "DEBIT" ? 1n : -1n;
    const balance = (s.debit - s.credit) * sign;
    const row: AccountBalance = {
      accountId: a.id, code: a.code, name: a.name, category: a.category,
      normalSide: a.normalSide, debit: s.debit, credit: s.credit, balance,
    };
    if ((BALANCE_SHEET_ASSET_CATS as readonly string[]).includes(a.category)) {
      assets.push(row);
      totalAssets += a.normalSide === "DEBIT" ? balance : -balance; // depresiasi mengurangi aktiva
    } else if ((BALANCE_SHEET_LIABILITY_CATS as readonly string[]).includes(a.category)) {
      liabilities.push(row);
      totalLiabilities += balance;
    } else if (a.category === "EKUITAS") {
      equity.push(row);
      totalEquity += balance;
    } else if ((INCOME_CATS as readonly string[]).includes(a.category)) {
      income += s.credit - s.debit;
    } else {
      expense += s.debit - s.credit;
    }
  }
  const retainedEarnings = income - expense;
  return {
    assets, liabilities, equity,
    totalAssets, totalLiabilities, totalEquity, retainedEarnings,
    balanced: totalAssets === totalLiabilities + totalEquity + retainedEarnings,
  };
}
