import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, decodeJwt } from "jose";
import {
  idTokenRejection,
  type IdTokenClaims,
  type AuthProviderMode,
} from "@/lib/oidc-rules";

// ── Sambungan ke Penyedia Identitas (Fase 45) ───────────────────
//
// Alur yang dipakai: Authorization Code + PKCE.
//
// PKCE dipasang meski klien ini rahasia (punya client secret). Alasannya:
// kode otorisasi melintas lewat peramban dan bisa bocor ke riwayat, log
// proxy, atau ekstensi. Dengan PKCE, kode yang bocor tidak bisa ditukar tanpa
// verifier yang hanya ada di cookie kita.
//
// Yang TIDAK dilakukan di sini, dan itu disengaja:
//
//  - Tidak ada pembuatan akun otomatis. Lihat resolveAccount() di
//    oidc-rules.ts — akun harus sudah ada di CRM.
//  - Tidak ada peran atau izin yang diambil dari penyedia identitas. Divisi
//    dan role tetap ditetapkan di CRM. Kalau IdP bisa memberi peran, siapa pun
//    yang menguasai IdP menguasai kewenangan di CRM.
//  - Client secret tidak pernah dipakai untuk memverifikasi token. Tanda
//    tangan diverifikasi dengan kunci publik dari JWKS (RS256).

export class OidcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OidcError";
  }
}

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Alamat CRM yang dilihat peramban — dasar redirect URI. */
  appUrl: string;
}

export const OIDC_CALLBACK_PATH = "/api/auth/callback/oidc";

/** Mode autentikasi yang sedang berlaku. */
export function authProviderMode(): AuthProviderMode {
  const raw = (process.env.AUTH_PROVIDER ?? "LOCAL").trim().toUpperCase();
  if (raw === "OIDC") return "OIDC";
  if (raw === "MAILSERVER") return "MAILSERVER";
  return "LOCAL";
}

/**
 * Konfigurasi OIDC, atau null bila belum lengkap.
 *
 * Mengembalikan null alih-alih melempar: halaman masuk harus tetap tampil
 * meski konfigurasinya belum diisi, supaya jalur darurat tetap terjangkau.
 */
export function oidcConfig(): OidcConfig | null {
  const issuer = process.env.OIDC_ISSUER?.trim();
  const clientId = process.env.OIDC_CLIENT_ID?.trim();
  const clientSecret = process.env.OIDC_CLIENT_SECRET?.trim();
  const appUrl = process.env.APP_URL?.trim() || "http://localhost:3300";
  if (!issuer || !clientId || !clientSecret) return null;
  // Issuer selalu dinormalkan berakhiran "/" — Authentik menerbitkannya
  // begitu, dan perbandingan issuer di idTokenRejection() sama persis.
  return {
    issuer: issuer.endsWith("/") ? issuer : `${issuer}/`,
    clientId,
    clientSecret,
    appUrl: appUrl.replace(/\/+$/, ""),
  };
}

export function redirectUri(cfg: OidcConfig): string {
  return `${cfg.appUrl}${OIDC_CALLBACK_PATH}`;
}

/** Alasan OIDC belum bisa dipakai, atau null bila siap. */
export function oidcBlocker(): string | null {
  if (authProviderMode() !== "OIDC") return "AUTH_PROVIDER belum di-set ke OIDC.";
  if (!oidcConfig()) {
    return "OIDC_ISSUER, OIDC_CLIENT_ID, atau OIDC_CLIENT_SECRET belum di-set.";
  }
  return null;
}

// ── Discovery ───────────────────────────────────────────────────

export interface Discovery {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  issuer: string;
}

let discoveryCache: { issuer: string; at: number; data: Discovery } | null = null;
const DISCOVERY_TTL_MS = 10 * 60 * 1000;

export async function discover(cfg: OidcConfig, fetcher = fetch): Promise<Discovery> {
  if (discoveryCache && discoveryCache.issuer === cfg.issuer && Date.now() - discoveryCache.at < DISCOVERY_TTL_MS) {
    return discoveryCache.data;
  }
  const url = `${cfg.issuer}.well-known/openid-configuration`;
  let res: Response;
  try {
    res = await fetcher(url, { signal: AbortSignal.timeout(10_000) });
  } catch (e) {
    throw new OidcError(`Tidak bisa menghubungi penyedia identitas: ${e instanceof Error ? e.message : e}`);
  }
  if (!res.ok) throw new OidcError(`Discovery gagal (HTTP ${res.status}) di ${url}.`);

  let data: Discovery;
  try {
    data = (await res.json()) as Discovery;
  } catch {
    throw new OidcError("Jawaban discovery bukan JSON — periksa OIDC_ISSUER.");
  }
  for (const field of ["authorization_endpoint", "token_endpoint", "jwks_uri", "issuer"] as const) {
    if (!data[field]) throw new OidcError(`Discovery tidak memuat ${field}.`);
  }
  // Issuer yang diumumkan harus sama dengan yang kita konfigurasi. Kalau
  // berbeda, kita sedang bicara dengan penyedia lain daripada yang dikira.
  const announced = data.issuer.endsWith("/") ? data.issuer : `${data.issuer}/`;
  if (announced !== cfg.issuer) {
    throw new OidcError(`Issuer yang diumumkan (${data.issuer}) berbeda dari OIDC_ISSUER.`);
  }
  discoveryCache = { issuer: cfg.issuer, at: Date.now(), data };
  return data;
}

/** Dipakai tes untuk memastikan cache tidak membawa keadaan antar-kasus. */
export function clearDiscoveryCache(): void {
  discoveryCache = null;
}

// ── PKCE & parameter acak ───────────────────────────────────────

const b64url = (buf: Buffer) => buf.toString("base64url");

export function randomToken(bytes = 32): string {
  return b64url(randomBytes(bytes));
}

export function codeChallengeOf(verifier: string): string {
  return b64url(createHash("sha256").update(verifier).digest());
}

export interface StartParams {
  state: string;
  nonce: string;
  codeVerifier: string;
}

export function newStartParams(): StartParams {
  return {
    state: randomToken(),
    nonce: randomToken(),
    // 32 byte → 43 karakter base64url, di dalam rentang 43–128 yang diminta RFC 7636.
    codeVerifier: randomToken(),
  };
}

export async function authorizationUrl(
  cfg: OidcConfig,
  p: StartParams,
  fetcher = fetch
): Promise<string> {
  const d = await discover(cfg, fetcher);
  const url = new URL(d.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", redirectUri(cfg));
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", p.state);
  url.searchParams.set("nonce", p.nonce);
  url.searchParams.set("code_challenge", codeChallengeOf(p.codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

// ── Tukar kode & verifikasi token ───────────────────────────────

export interface TokenResponse {
  id_token?: string;
  access_token?: string;
  token_type?: string;
}

export async function exchangeCode(
  cfg: OidcConfig,
  code: string,
  codeVerifier: string,
  fetcher = fetch
): Promise<TokenResponse> {
  const d = await discover(cfg, fetcher);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(cfg),
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code_verifier: codeVerifier,
  });

  let res: Response;
  try {
    res = await fetcher(d.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    throw new OidcError(`Gagal menukar kode: ${e instanceof Error ? e.message : e}`);
  }

  const text = await res.text();
  if (!res.ok) {
    // Isi balasan tidak diteruskan apa adanya ke pemakai — ia bisa memuat
    // gema parameter yang kita kirim, termasuk client_secret.
    console.error("[oidc] token endpoint menolak:", res.status, text.slice(0, 300));
    throw new OidcError(`Penyedia identitas menolak penukaran kode (HTTP ${res.status}).`);
  }
  try {
    return JSON.parse(text) as TokenResponse;
  } catch {
    throw new OidcError("Jawaban token endpoint bukan JSON.");
  }
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwksFor(uri: string) {
  let set = jwksCache.get(uri);
  if (!set) {
    set = createRemoteJWKSet(new URL(uri));
    jwksCache.set(uri, set);
  }
  return set;
}

export interface VerifiedIdentity {
  sub: string;
  email: string;
  claims: IdTokenClaims;
}

/**
 * Memverifikasi id_token: tanda tangan lebih dulu, baru isinya.
 *
 * Urutannya penting. Membaca klaim dari token yang belum terbukti asli berarti
 * mengambil keputusan berdasarkan data yang bisa dikarang siapa saja.
 */
export async function verifyIdToken(
  cfg: OidcConfig,
  idToken: string,
  nonce: string,
  now: Date = new Date()
): Promise<VerifiedIdentity> {
  const d = await discover(cfg);
  let payload: IdTokenClaims;
  try {
    const verified = await jwtVerify(idToken, jwksFor(d.jwks_uri), {
      issuer: d.issuer,
      audience: cfg.clientId,
    });
    payload = verified.payload as IdTokenClaims;
  } catch (e) {
    throw new OidcError(`Tanda tangan token tidak sah: ${e instanceof Error ? e.message : e}`);
  }

  // Pemeriksaan isi dijalankan LAGI lewat modul murni: jose sudah memeriksa
  // iss/aud/exp, tetapi nonce, email, dan email_verified adalah aturan kita
  // sendiri — dan menaruhnya di modul murni membuatnya bisa diuji.
  const rejection = idTokenRejection(payload, {
    issuer: cfg.issuer,
    clientId: cfg.clientId,
    nonce,
    now,
  });
  if (rejection) throw new OidcError(rejection);

  return {
    sub: String(payload.sub),
    email: String(payload.email).trim().toLowerCase(),
    claims: payload,
  };
}

/** Membaca klaim tanpa verifikasi — HANYA untuk pesan diagnostik. */
export function peekClaims(idToken: string): Record<string, unknown> | null {
  try {
    return decodeJwt(idToken) as Record<string, unknown>;
  } catch {
    return null;
  }
}
