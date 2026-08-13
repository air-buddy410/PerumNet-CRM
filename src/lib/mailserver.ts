import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import {
  listMailboxes,
  setMailboxTags,
  probeConnection,
  type Fetcher,
  type MailboxRecord,
  type ConnectionProbe,
} from "@/lib/mailcow";
import {
  probeImapLogin,
  imapHostFrom,
  type ImapProbe,
  type MailAuthResult,
} from "@/lib/mail-auth";
import {
  applyDivisionTag,
  compareMailboxes,
  summarize,
  type MailboxComparison,
} from "@/lib/mailbox-tag";
import type { CurrentUser } from "@/lib/rbac";

// ── Pengelolaan mailserver & label divisi (Fase 43–44) ──────────
//
// Keputusan E2 ditegakkan di sini: **CRM adalah editor tag.**
//
// Yang boleh terjadi:  divisi di CRM  ──dorong──►  tag di mailcow
// Yang TIDAK boleh:    tag di mailcow ──ubah───►  divisi di CRM
//
// Tidak ada satu pun fungsi di modul ini yang menulis ke User.divisionId.
// Arah sebaliknya hanya dipakai untuk MELAPORKAN selisih lewat
// loadMailboxOverview(), supaya IT melihat apa yang berbeda dan memutuskan.
//
// Alasannya bukan kerapian: divisi menentukan siapa approver supervisor pada
// rantai persetujuan. Kalau tag mailcow bisa mengubahnya, siapa pun yang bisa
// mengedit mailbox bisa memindahkan orang ke divisi lain — dan dengan itu
// mengubah siapa yang menyetujui pengajuannya.

type Result<T = undefined> =
  | { ok: true; id: string; data?: T }
  | { ok: false; error: string };

/** Kode integrasi tetap: hanya ada satu mailserver. */
export const MAILCOW_CODE = "mailcow";

export interface MailcowConfig {
  id: string;
  baseUrl: string;
  credentialRef: string;
  isEnabled: boolean;
  notes: string | null;
  lastEventAt: Date | null;
}

/** Integrasi mailcow yang terdaftar, atau null bila belum disiapkan. */
export async function loadMailcowIntegration(): Promise<MailcowConfig | null> {
  const row = await db.integration.findFirst({ where: { provider: "MAILCOW" } });
  if (!row) return null;
  return {
    id: row.id,
    baseUrl: row.baseUrl ?? "",
    credentialRef: row.credentialRef ?? "",
    isEnabled: row.isEnabled,
    notes: row.notes,
    lastEventAt: row.lastEventAt,
  };
}

/** Alasan mailserver belum bisa dipakai, atau null bila siap. */
export function mailcowBlocker(cfg: MailcowConfig | null): string | null {
  if (!cfg) return "Mailserver belum didaftarkan.";
  if (!cfg.baseUrl) return "Alamat mailserver (baseUrl) belum diisi.";
  if (!cfg.credentialRef) return "Nama environment variable API key belum diisi.";
  if (!cfg.isEnabled) return "Integrasi mailserver masih dimatikan.";
  return null;
}

function clientOptions(cfg: MailcowConfig, fetcher?: Fetcher) {
  return { baseUrl: cfg.baseUrl, credentialRef: cfg.credentialRef, fetcher };
}

/** Mencatat lalu lintas ke mailserver — sama seperti integrasi lain. */
async function logEvent(
  integrationId: string,
  eventType: string,
  status: "OK" | "ERROR",
  detail: string
): Promise<void> {
  try {
    await db.integrationEvent.create({
      data: { integrationId, direction: "OUT", eventType, status, detail: detail.slice(0, 500) },
    });
    if (status === "OK") {
      await db.integration.update({
        where: { id: integrationId },
        data: { lastEventAt: new Date() },
      });
    }
  } catch (e) {
    // Kegagalan mencatat tidak boleh menggagalkan operasinya.
    console.error("[mailserver] gagal mencatat event:", e);
  }
}

/** Uji koneksi ke mailserver. Tidak mengubah apa pun di mailcow. */
export async function testMailcowConnection(
  user: CurrentUser,
  fetcher?: Fetcher
): Promise<ConnectionProbe & { blocker?: string }> {
  const cfg = await loadMailcowIntegration();
  const blocker = mailcowBlocker(cfg);
  if (blocker || !cfg) {
    const reason = blocker ?? "Mailserver belum didaftarkan.";
    return { ok: false, version: null, mailboxCount: null, error: reason, blocker: reason };
  }
  const probe = await probeConnection(clientOptions(cfg, fetcher));
  await logEvent(
    cfg.id,
    "MAILCOW_PROBE",
    probe.ok ? "OK" : "ERROR",
    probe.ok
      ? `versi ${probe.version} · ${probe.mailboxCount} mailbox`
      : (probe.error ?? "tanpa keterangan")
  );
  await logAudit({
    userId: user.id,
    action: "MAILCOW_TEST",
    module: "integrations",
    entityType: "Integration",
    entityId: cfg.id,
    description: probe.ok
      ? `Uji koneksi mailserver berhasil — versi ${probe.version}`
      : `Uji koneksi mailserver gagal: ${probe.error}`,
  });
  return probe;
}

export interface MailboxOverview {
  rows: MailboxComparison[];
  summary: ReturnType<typeof summarize>;
  /** Nama divisi per kode, untuk ditampilkan tanpa query ulang. */
  divisionNames: Record<string, string>;
  error: string | null;
}

/**
 * Menyandingkan akun CRM dengan mailbox mailcow.
 *
 * Hanya MEMBACA. Tidak ada satu pun perubahan yang diterapkan di sini —
 * termasuk tidak ke CRM. Itu inti keputusan E2: yang berbeda ditampilkan
 * lebih dulu, penerapannya menunggu manusia menekan tombol.
 */
export async function loadMailboxOverview(fetcher?: Fetcher): Promise<MailboxOverview> {
  const empty = {
    rows: [] as MailboxComparison[],
    summary: summarize([]),
    divisionNames: {} as Record<string, string>,
  };
  const cfg = await loadMailcowIntegration();
  const blocker = mailcowBlocker(cfg);
  if (blocker || !cfg) return { ...empty, error: blocker };

  const [users, divisions] = await Promise.all([
    // Akun beku dan yang sudah diarsipkan sengaja IKUT: mailbox-nya masih ada
    // di mailserver, dan justru itulah yang perlu dilihat IT saat memutuskan
    // menutupnya.
    db.user.findMany({
      select: { email: true, division: { select: { code: true } } },
    }),
    db.division.findMany({ select: { code: true, name: true } }),
  ]);

  let mailboxes: MailboxRecord[];
  try {
    mailboxes = await listMailboxes(clientOptions(cfg, fetcher));
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : String(e) };
  }

  const rows = compareMailboxes(
    users.map((u) => ({ email: u.email, divisionCode: u.division?.code ?? null })),
    mailboxes
  );
  return {
    rows,
    summary: summarize(rows),
    divisionNames: Object.fromEntries(divisions.map((d) => [d.code, d.name])),
    error: null,
  };
}

/**
 * Mendorong divisi CRM sebuah akun menjadi tag di mailcow.
 *
 * Tag milik IT yang bukan urusan CRM dipertahankan — applyDivisionTag()
 * menyusun daftarnya, bukan modul ini. Menulis ulang seluruh tag hanya karena
 * divisinya berubah akan menghapus penanda yang dipasang IT untuk keperluan
 * mereka sendiri.
 */
export async function pushDivisionTag(
  user: CurrentUser,
  email: string,
  fetcher?: Fetcher
): Promise<Result> {
  const cfg = await loadMailcowIntegration();
  const blocker = mailcowBlocker(cfg);
  if (blocker || !cfg) return { ok: false, error: blocker! };

  const normalized = email.trim().toLowerCase();
  const account = await db.user.findFirst({
    where: { email: { equals: normalized, mode: "insensitive" } },
    select: { id: true, username: true, division: { select: { code: true, name: true } } },
  });
  if (!account) {
    return { ok: false, error: `Tidak ada akun CRM dengan alamat ${normalized}.` };
  }
  const divisionCode = account.division?.code ?? null;
  if (!divisionCode) {
    // Mendorong "tanpa divisi" akan MENGHAPUS tag yang mungkin benar. Yang
    // perlu diperbaiki adalah divisi di CRM, bukan tagnya.
    return {
      ok: false,
      error: `Akun ${account.username} belum punya divisi di CRM — isi divisinya dulu, jangan menghapus tag di mailcow.`,
    };
  }

  let current: MailboxRecord | undefined;
  try {
    const all = await listMailboxes(clientOptions(cfg, fetcher));
    current = all.find((m) => m.email === normalized);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (!current) {
    return { ok: false, error: `Mailbox ${normalized} tidak ada di mailserver.` };
  }

  const next = applyDivisionTag(current.tags, divisionCode);
  try {
    await setMailboxTags(clientOptions(cfg, fetcher), normalized, next);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logEvent(cfg.id, "MAILCOW_TAG_PUSH", "ERROR", `${normalized}: ${msg}`);
    return { ok: false, error: msg };
  }

  await logEvent(
    cfg.id,
    "MAILCOW_TAG_PUSH",
    "OK",
    `${normalized}: ${current.tags.join(",") || "(kosong)"} → ${next.join(",")}`
  );
  await logAudit({
    userId: user.id,
    action: "MAILCOW_TAG_PUSH",
    module: "integrations",
    entityType: "User",
    entityId: account.id,
    description: `Menandai mailbox ${normalized} sebagai divisi ${account.division!.name} (${divisionCode})`,
    metadata: { from: current.tags, to: next },
  });
  return { ok: true, id: account.id };
}

/** Mendorong seluruh baris yang bisa ditindak sekaligus. */
export async function pushAllDivisionTags(
  user: CurrentUser,
  fetcher?: Fetcher
): Promise<{ pushed: number; failed: number; errors: string[] }> {
  const overview = await loadMailboxOverview(fetcher);
  const targets = overview.rows.filter((r) => r.actionable);
  let pushed = 0;
  const errors: string[] = [];
  for (const row of targets) {
    const r = await pushDivisionTag(user, row.email, fetcher);
    if (r.ok) pushed++;
    else errors.push(`${row.email}: ${r.error}`);
  }
  return { pushed, failed: errors.length, errors };
}

// ── Mailserver sebagai sumber identitas (Fase 53) ───────────────
//
// PerumNet memilih mailcow lebih dulu; Authentik disimpan untuk nanti dan
// tidak dibongkar, jadi bisa dinaikkan lagi tanpa membangun ulang.

/**
 * Memeriksa password seseorang ke mailserver.
 *
 * Alamat IMAP-nya diturunkan dari baseUrl integrasi yang SAMA dengan API
 * mailcow — supaya tidak pernah ada dua alamat mailserver yang bisa berbeda
 * diam-diam.
 *
 * Integrasi yang belum siap menghasilkan UNREACHABLE, BUKAN penolakan biasa.
 * Bedanya menentukan: "password salah" akan membuat orang mencoba mereset
 * password email yang sebenarnya tidak bermasalah.
 */
export async function verifyMailserverPassword(
  email: string,
  password: string,
  probe: ImapProbe = probeImapLogin
): Promise<MailAuthResult> {
  const cfg = await loadMailcowIntegration();
  const blocker = mailcowBlocker(cfg);
  if (!cfg || blocker) {
    return { ok: false, reason: "UNREACHABLE", detail: blocker ?? "Integrasi mailserver belum disiapkan." };
  }
  if (!email) {
    return { ok: false, reason: "UNREACHABLE", detail: "Akun ini belum punya alamat email." };
  }
  try {
    return await probe(imapHostFrom(cfg.baseUrl), email, password);
  } catch (e) {
    // Password TIDAK PERNAH ikut ke pesan galat.
    return { ok: false, reason: "UNREACHABLE", detail: (e as Error).message };
  }
}
