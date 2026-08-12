// ── Tag Mailbox ↔ Divisi (Fase 44) ──────────────────────────────
// Modul MURNI: tidak menyentuh database maupun jaringan.
//
// Keputusan E2: **CRM adalah editor tag.** Divisi ditetapkan di CRM lewat
// dropdown daftar divisi yang sah, lalu didorong ke mailcow. Arah sebaliknya
// hanya dipakai untuk MELAPORKAN selisih, tidak pernah untuk mengubah divisi
// diam-diam.
//
// Alasannya: tag mailcow adalah teks bebas. Kalau tag menjadi otoritas, satu
// salah ketik (`enginer`, `Divisi Marketing`, `marketing ` dengan spasi)
// membuat pegawai kehilangan divisinya — dan di CRM ini divisi menentukan
// siapa approver supervisor pada rantai persetujuan.
//
// Batas yang TIDAK boleh dilanggar: tag divisi tidak memberi kewenangan apa
// pun di CRM. Ia menentukan keanggotaan dan akses masuk aplikasi lain; peran
// CRM tetap ditetapkan eksplisit oleh admin. Tanpa batas itu, siapa pun yang
// bisa mengedit mailbox bisa menaikkan kewenangan orang di CRM.

/** Awalan yang menandai sebuah tag sebagai milik CRM. */
export const DIVISION_TAG_PREFIX = "divisi-";

/** Tag untuk sebuah kode divisi. Selalu huruf kecil supaya perbandingan stabil. */
export function divisionTag(divisionCode: string): string {
  return `${DIVISION_TAG_PREFIX}${divisionCode.trim().toLowerCase()}`;
}

export function isDivisionTag(tag: string): boolean {
  return tag.trim().toLowerCase().startsWith(DIVISION_TAG_PREFIX);
}

export interface ParsedTags {
  /** Kode divisi dari tag, huruf besar. null bila tidak ada. */
  code: string | null;
  /** Tag divisi yang ditemukan, apa adanya — >1 berarti ambigu. */
  divisionTags: string[];
  /** Tag yang BUKAN milik CRM. Wajib dipertahankan saat menulis. */
  foreign: string[];
}

/**
 * Membaca tag sebuah mailbox.
 *
 * Tag ganda TIDAK diselesaikan dengan menebak (mis. mengambil yang pertama):
 * mailbox bertag `divisi-mkt` dan `divisi-fin` sekaligus adalah keadaan yang
 * harus dilihat manusia, bukan dirapikan diam-diam menjadi salah satunya.
 */
export function parseTags(tags: readonly string[]): ParsedTags {
  const divisionTags: string[] = [];
  const foreign: string[] = [];
  for (const raw of tags) {
    const t = raw.trim();
    if (!t) continue;
    if (isDivisionTag(t)) divisionTags.push(t);
    else foreign.push(t);
  }
  const code =
    divisionTags.length === 1
      ? divisionTags[0].trim().slice(DIVISION_TAG_PREFIX.length).toUpperCase()
      : null;
  return { code, divisionTags, foreign };
}

/**
 * Menyusun daftar tag baru untuk sebuah mailbox.
 *
 * Tag milik IT yang bukan urusan CRM DIPERTAHANKAN. Menulis ulang seluruh
 * daftar tag hanya karena divisinya berubah akan menghapus penanda yang
 * dipasang IT untuk keperluan mereka sendiri — kerusakan senyap yang baru
 * ketahuan lama setelah kejadian.
 *
 * `divisionCode: null` menghapus tag divisi tanpa menyentuh sisanya.
 */
export function applyDivisionTag(
  existing: readonly string[],
  divisionCode: string | null
): string[] {
  const { foreign } = parseTags(existing);
  if (!divisionCode) return [...foreign];
  return [...foreign, divisionTag(divisionCode)];
}

// ── Perbandingan CRM ↔ mailcow ──────────────────────────────────

export type MailboxSyncState =
  /** Mailbox tertaut pegawai dan tagnya sudah sesuai divisi di CRM. */
  | "MATCHED"
  /** Tertaut, tetapi tag di mailcow berbeda dari divisi di CRM. */
  | "TAG_MISMATCH"
  /** Tertaut, tetapi mailbox belum punya tag divisi sama sekali. */
  | "TAG_MISSING"
  /** Tertaut, tetapi mailbox punya lebih dari satu tag divisi. */
  | "TAG_AMBIGUOUS"
  /** Tertaut, tetapi pemakainya belum punya divisi di CRM. */
  | "NO_DIVISION_IN_CRM"
  /** Ada di mailcow, tidak ada akun CRM dengan alamat itu. */
  | "NO_CRM_ACCOUNT"
  /** Ada akun CRM, tidak ada mailbox dengan alamat itu. */
  | "NO_MAILBOX";

export interface MailboxComparison {
  email: string;
  state: MailboxSyncState;
  /** Kode divisi menurut CRM — inilah yang benar (keputusan E2). */
  crmDivisionCode: string | null;
  /** Kode divisi menurut tag mailcow — hanya untuk dilihat, bukan diterapkan. */
  tagDivisionCode: string | null;
  divisionTags: string[];
  foreignTags: string[];
  /** Apakah ada yang bisa didorong dari CRM ke mailcow. */
  actionable: boolean;
}

export interface CrmAccount {
  email: string;
  divisionCode: string | null;
}

export interface MailcowMailbox {
  email: string;
  tags: string[];
}

/**
 * Menyandingkan akun CRM dengan mailbox mailcow.
 *
 * Pencocokan memakai alamat email, dinormalkan huruf kecil — mailcow tidak
 * membedakan besar-kecil pada bagian domain, dan orang mengetik keduanya.
 */
export function compareMailboxes(
  accounts: readonly CrmAccount[],
  mailboxes: readonly MailcowMailbox[]
): MailboxComparison[] {
  const norm = (e: string) => e.trim().toLowerCase();
  const byEmail = new Map(accounts.map((a) => [norm(a.email), a]));
  const seen = new Set<string>();
  const out: MailboxComparison[] = [];

  for (const mb of mailboxes) {
    const email = norm(mb.email);
    seen.add(email);
    const parsed = parseTags(mb.tags);
    const account = byEmail.get(email);

    if (!account) {
      // Mailbox bersama (info@, billing@) juga jatuh ke sini. Bukan kesalahan
      // — karena itu tidak ada aksi yang ditawarkan, hanya dilaporkan.
      out.push({
        email,
        state: "NO_CRM_ACCOUNT",
        crmDivisionCode: null,
        tagDivisionCode: parsed.code,
        divisionTags: parsed.divisionTags,
        foreignTags: parsed.foreign,
        actionable: false,
      });
      continue;
    }

    const crm = account.divisionCode;
    let state: MailboxSyncState;
    if (parsed.divisionTags.length > 1) state = "TAG_AMBIGUOUS";
    else if (!crm) state = "NO_DIVISION_IN_CRM";
    else if (parsed.divisionTags.length === 0) state = "TAG_MISSING";
    else if (parsed.code !== crm.toUpperCase()) state = "TAG_MISMATCH";
    else state = "MATCHED";

    out.push({
      email,
      state,
      crmDivisionCode: crm,
      tagDivisionCode: parsed.code,
      divisionTags: parsed.divisionTags,
      foreignTags: parsed.foreign,
      // Hanya bisa didorong bila CRM punya divisi untuk didorong. Tanpa divisi
      // di CRM, yang perlu diperbaiki adalah datanya — bukan tagnya.
      actionable: Boolean(crm) && state !== "MATCHED" && state !== "NO_DIVISION_IN_CRM",
    });
  }

  for (const acc of accounts) {
    const email = norm(acc.email);
    if (seen.has(email)) continue;
    out.push({
      email,
      state: "NO_MAILBOX",
      crmDivisionCode: acc.divisionCode,
      tagDivisionCode: null,
      divisionTags: [],
      foreignTags: [],
      actionable: false, // membuat mailbox adalah keputusan IT, bukan efek samping sinkronisasi
    });
  }

  return out.sort((a, b) => a.email.localeCompare(b.email));
}

export const SYNC_STATE_LABELS: Record<MailboxSyncState, string> = {
  MATCHED: "Sesuai",
  TAG_MISMATCH: "Tag berbeda",
  TAG_MISSING: "Tag belum ada",
  TAG_AMBIGUOUS: "Tag ganda",
  NO_DIVISION_IN_CRM: "Divisi kosong di CRM",
  NO_CRM_ACCOUNT: "Tanpa akun CRM",
  NO_MAILBOX: "Tanpa mailbox",
};

/** Ringkasan untuk kepala halaman. */
export function summarize(rows: readonly MailboxComparison[]) {
  const count = (s: MailboxSyncState) => rows.filter((r) => r.state === s).length;
  return {
    total: rows.length,
    matched: count("MATCHED"),
    actionable: rows.filter((r) => r.actionable).length,
    noCrmAccount: count("NO_CRM_ACCOUNT"),
    noMailbox: count("NO_MAILBOX"),
  };
}
