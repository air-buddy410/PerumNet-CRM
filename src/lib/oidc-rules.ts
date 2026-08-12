// ── Aturan Login Terpusat (Fase 45) ─────────────────────────────
// Modul MURNI: tidak menyentuh database maupun jaringan.
//
// Semua yang menentukan BOLEH atau TIDAK seseorang masuk ada di sini, supaya
// bisa diuji tanpa satu pun penyedia identitas nyata. Alur jaringannya
// (redirect, tukar kode, ambil JWKS) ada di oidc.ts dan hanya menjalankan
// keputusan yang dibuat di berkas ini.

export type AuthProviderMode = "LOCAL" | "OIDC" | "MAILSERVER";

/** Klaim id_token yang kita pedulikan. Sisanya sengaja diabaikan. */
export interface IdTokenClaims {
  iss?: unknown;
  aud?: unknown;
  sub?: unknown;
  exp?: unknown;
  iat?: unknown;
  nonce?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
  preferred_username?: unknown;
}

export interface IdTokenExpectation {
  issuer: string;
  clientId: string;
  nonce: string;
  now: Date;
  /** Toleransi selisih jam antara CRM dan penyedia identitas. */
  clockSkewSec?: number;
}

const DEFAULT_SKEW_SEC = 60;

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Alasan id_token ditolak, atau null bila sah.
 *
 * Ditulis sebagai daftar penolakan berurutan, bukan satu ekspresi boolean,
 * supaya kegagalan bisa ditelusuri: "kenapa orang ini tidak bisa masuk" harus
 * terjawab dari log, bukan ditebak.
 *
 * Verifikasi TANDA TANGAN tidak dilakukan di sini — itu tugas jose di oidc.ts.
 * Berkas ini memeriksa isinya SETELAH tanda tangannya terbukti sah.
 */
export function idTokenRejection(
  claims: IdTokenClaims,
  expect: IdTokenExpectation
): string | null {
  const skew = expect.clockSkewSec ?? DEFAULT_SKEW_SEC;
  const nowSec = Math.floor(expect.now.getTime() / 1000);

  const iss = asString(claims.iss);
  if (!iss) return "Token tanpa issuer.";
  // Dibandingkan sama persis. Membandingkan "mengandung" atau "berawalan"
  // membuat issuer palsu yang kebetulan berawalan sama ikut lolos.
  if (iss !== expect.issuer) return "Issuer token tidak dikenal.";

  // aud boleh string atau daftar string — keduanya sah menurut spesifikasi.
  const audRaw = claims.aud;
  const audList = Array.isArray(audRaw) ? audRaw.map(asString) : [asString(audRaw)];
  if (!audList.includes(expect.clientId)) {
    return "Token ini tidak ditujukan untuk aplikasi ini.";
  }

  const sub = asString(claims.sub);
  if (!sub) return "Token tanpa subject.";

  if (typeof claims.exp !== "number") return "Token tanpa masa berlaku.";
  if (claims.exp + skew < nowSec) return "Token sudah kedaluwarsa.";
  if (typeof claims.iat === "number" && claims.iat - skew > nowSec) {
    return "Token diterbitkan di masa depan — periksa jam server.";
  }

  // Nonce mengikat token ini pada permintaan login yang KITA mulai. Tanpa
  // pemeriksaan ini, token sah yang dicuri dari sesi lain bisa diputar ulang.
  const nonce = asString(claims.nonce);
  if (!nonce) return "Token tanpa nonce.";
  if (nonce !== expect.nonce) return "Nonce tidak cocok — permintaan login tidak dikenali.";

  const email = asString(claims.email);
  if (!email) return "Token tanpa alamat email — CRM mencocokkan akun lewat email.";
  // email_verified hanya ditegakkan bila penyedia mengirimkannya. Menolak
  // ketiadaannya akan mematikan penyedia yang memang tidak mengirim klaim itu.
  if (claims.email_verified === false) {
    return "Alamat email belum diverifikasi di penyedia identitas.";
  }

  return null;
}

// ── Pencocokan akun ─────────────────────────────────────────────

export interface CrmAccountForLogin {
  id: string;
  email: string;
  isActive: boolean;
  frozenAt: Date | null;
  oidcSubject: string | null;
}

export type AccountResolution =
  | { ok: true; userId: string; bindSubject: boolean }
  | { ok: false; error: string };

/**
 * Memutuskan apakah pemilik token ini boleh memakai akun CRM tertentu.
 *
 * Tiga keputusan yang ditanam di sini, semuanya disengaja:
 *
 * 1. **Akun TIDAK dibuat otomatis.** Kalau emailnya tidak ada di CRM, login
 *    ditolak. Membuat akun otomatis berarti siapa pun yang diterima Authentik
 *    langsung punya akun CRM — dan peran serta izinnya harus ditetapkan sadar
 *    oleh admin, bukan muncul sebagai efek samping login.
 *
 * 2. **Subject mengikat lebih kuat daripada email.** Sekali sebuah akun
 *    tertaut ke satu `sub`, token dengan `sub` berbeda DITOLAK meski emailnya
 *    sama. Tanpa aturan ini, menghapus lalu membuat ulang pengguna di
 *    Authentik dengan alamat yang sama akan mengambil alih akun CRM beserta
 *    seluruh izinnya.
 *
 * 3. **Beku dan nonaktif tetap berlaku.** Identitas terpusat tidak membatalkan
 *    keputusan yang sudah diambil di CRM.
 */
export function resolveAccount(
  claims: { sub: string; email: string },
  account: CrmAccountForLogin | null
): AccountResolution {
  if (!account) {
    return {
      ok: false,
      error: `Tidak ada akun CRM untuk ${claims.email}. Hubungi admin untuk dibuatkan akun.`,
    };
  }
  if (account.oidcSubject && account.oidcSubject !== claims.sub) {
    return {
      ok: false,
      error:
        "Akun ini sudah tertaut ke identitas lain di penyedia identitas. Hubungi admin.",
    };
  }
  if (!account.isActive) {
    return { ok: false, error: "Akun ini sudah tidak aktif." };
  }
  if (account.frozenAt) {
    return {
      ok: false,
      error: `Akun Anda dibekukan sejak ${account.frozenAt.toLocaleDateString("id-ID")}. Hubungi HRD atau IT.`,
    };
  }
  return { ok: true, userId: account.id, bindSubject: !account.oidcSubject };
}

// ── Jalur darurat: login lokal saat identitas terpusat aktif ────

/**
 * Alasan login password lokal ditolak, atau null bila boleh.
 *
 * Saat identitas terpusat aktif, password lokal ditutup untuk SEMUA orang
 * kecuali akun yang ditandai darurat. Kalau tidak, mencabut akses seseorang
 * di Authentik tidak berarti apa-apa selama hash lama masih ada di CRM.
 *
 * Akun darurat sengaja tetap ada: kalau penyedia identitas mati dan tidak ada
 * jalan masuk lain, tidak seorang pun bisa masuk CRM — termasuk untuk
 * memperbaiki penyedianya. Itu pintu keluar kebakaran, dan pemakaiannya harus
 * TERLIHAT, bukan disembunyikan.
 */
export function localLoginBlocker(
  provider: AuthProviderMode,
  account: { allowLocalLogin: boolean }
): string | null {
  if (provider === "LOCAL") return null;
  if (account.allowLocalLogin) return null;
  return "Masuk memakai password lokal sudah dinonaktifkan. Gunakan tombol masuk lewat penyedia identitas.";
}

/** Apakah pemakaian jalur darurat perlu dicatat & diberitakan? */
export function isBreakGlassLogin(
  provider: AuthProviderMode,
  account: { allowLocalLogin: boolean }
): boolean {
  return provider !== "LOCAL" && account.allowLocalLogin;
}

// ── PKCE & parameter permintaan ─────────────────────────────────

export interface AuthRequestParams {
  state: string;
  nonce: string;
  codeVerifier: string;
}

/**
 * Alasan balasan callback ditolak sebelum menyentuh jaringan.
 *
 * `state` diperiksa lebih dulu dan dengan perbandingan yang tidak bocor waktu
 * — ia satu-satunya penjaga terhadap permintaan login yang tidak kita mulai.
 */
export function callbackRejection(
  received: { state?: string | null; code?: string | null; error?: string | null },
  stored: { state: string } | null
): string | null {
  if (received.error) {
    return `Penyedia identitas menolak: ${received.error}`;
  }
  if (!stored) {
    return "Permintaan login tidak dikenali atau sudah kedaluwarsa. Ulangi dari halaman masuk.";
  }
  const state = received.state?.trim();
  if (!state || !timingSafeEqual(state, stored.state)) {
    return "Parameter state tidak cocok — permintaan login ditolak.";
  }
  if (!received.code?.trim()) return "Penyedia identitas tidak mengirimkan kode otorisasi.";
  return null;
}

/** Perbandingan string yang waktunya tidak bergantung pada isi. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Nama tampilan dari klaim, dengan urutan jatuh yang masuk akal. */
export function displayNameFrom(claims: IdTokenClaims, fallback: string): string {
  return asString(claims.name) ?? asString(claims.preferred_username) ?? fallback;
}
