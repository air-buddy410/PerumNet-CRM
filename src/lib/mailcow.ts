// ── Klien mailcow (Fase 43) ─────────────────────────────────────
//
// Pola yang sama persis dengan src/lib/mikrotik.ts, dan itu disengaja:
//
//  - API key TIDAK PERNAH masuk database. Yang disimpan hanya NAMA env var
//    (`Integration.credentialRef`), nilainya dibaca dari process.env.
//  - Fetcher bisa diganti, sehingga seluruh perilaku bisa diuji tanpa
//    menyentuh mailserver sungguhan.
//  - Kegagalan berupa Error bertipe, bukan null — pemanggil tidak boleh bisa
//    diam-diam mengabaikan mailserver yang tidak menjawab.
//
// CATATAN JUJUR: bentuk endpoint di bawah mengikuti API mailcow-dockerized
// yang umum (`/api/v1/get/...`, header `X-API-Key`). Versi mailcow yang
// dipasang belum diverifikasi, jadi tombol "Uji Koneksi" di /it/mailserver
// sengaja memeriksa versi DAN daftar mailbox — supaya ketidakcocokan endpoint
// ketahuan langsung dengan pesan yang jelas, bukan muncul sebagai daftar
// kosong yang menyesatkan.

export class MailcowError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null
  ) {
    super(message);
    this.name = "MailcowError";
  }
}

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/** API key dibaca dari env var yang NAMANYA disimpan di database. */
export function readApiKey(credentialRef: string): string {
  const raw = process.env[credentialRef];
  if (!raw?.trim()) {
    throw new MailcowError(
      `Env var ${credentialRef} belum di-set — API key mailcow tidak tersedia.`
    );
  }
  return raw.trim();
}

export interface MailcowOptions {
  baseUrl: string;
  credentialRef: string;
  fetcher?: Fetcher;
  timeoutMs?: number;
}

function apiRoot(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  // Terima baik "https://mail.perum.id" maupun ".../api/v1" — orang mengetik
  // keduanya, dan menolak salah satunya hanya membuang waktu.
  return trimmed.endsWith("/api/v1") ? trimmed : `${trimmed}/api/v1`;
}

async function call<T>(opts: MailcowOptions, path: string, init?: RequestInit): Promise<T> {
  const apiKey = readApiKey(opts.credentialRef);
  const url = `${apiRoot(opts.baseUrl)}${path}`;
  const doFetch = opts.fetcher ?? fetch;

  let res: Response;
  try {
    res = await doFetch(url, {
      ...init,
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new MailcowError(`Tidak bisa menghubungi ${url}: ${msg}`);
  }

  if (res.status === 401 || res.status === 403) {
    throw new MailcowError(
      "API key ditolak mailcow (401/403). Periksa nilainya dan izin API-nya di mailcow.",
      res.status
    );
  }
  if (res.status === 404) {
    throw new MailcowError(
      `Endpoint ${path} tidak ada di server ini (404) — kemungkinan versi mailcow berbeda.`,
      404
    );
  }
  if (!res.ok) {
    throw new MailcowError(`mailcow menjawab HTTP ${res.status} untuk ${path}.`, res.status);
  }

  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    // Halaman login HTML yang dikembalikan sebagai 200 adalah gejala khas
    // API yang belum diaktifkan — jangan biarkan lolos sebagai "berhasil".
    throw new MailcowError(
      `Jawaban ${path} bukan JSON. Pastikan API mailcow diaktifkan dan baseUrl benar.`
    );
  }

  // mailcow bisa menjawab HTTP 200 dengan isi berupa kesalahan. Ini jebakan
  // klasik: tanpa pemeriksaan ini, "gagal" terlihat seperti "berhasil".
  assertNoApiError(body, path);
  return body as T;
}

/** Mendeteksi bentuk `{type:"error"}` yang dikirim mailcow dengan status 200. */
export function assertNoApiError(body: unknown, path: string): void {
  const entries = Array.isArray(body) ? body : [body];
  for (const entry of entries) {
    if (entry && typeof entry === "object" && "type" in entry) {
      const type = String((entry as { type: unknown }).type).toLowerCase();
      if (type === "error" || type === "danger") {
        const msg = "msg" in entry ? JSON.stringify((entry as { msg: unknown }).msg) : "tanpa keterangan";
        throw new MailcowError(`mailcow menolak ${path}: ${msg}`);
      }
    }
  }
}

export interface MailcowMailboxRaw {
  username?: string;
  tags?: unknown;
  active?: unknown;
  name?: string;
}

export interface MailboxRecord {
  email: string;
  tags: string[];
  active: boolean;
  displayName: string | null;
}

/**
 * Menormalkan satu mailbox dari jawaban mailcow.
 *
 * Ditulis longgar dengan sengaja: bentuk `tags` berbeda antar versi mailcow
 * (pernah string dipisah koma, pernah array). Menolak keseluruhan sinkronisasi
 * karena satu field berbeda bentuk akan membuat fitur ini mati total pada
 * versi yang sedikit berbeda.
 */
export function normalizeMailbox(raw: MailcowMailboxRaw): MailboxRecord | null {
  const email = typeof raw.username === "string" ? raw.username.trim().toLowerCase() : "";
  if (!email) return null;

  let tags: string[] = [];
  if (Array.isArray(raw.tags)) {
    tags = raw.tags.map((t) => String(t).trim()).filter(Boolean);
  } else if (typeof raw.tags === "string" && raw.tags.trim()) {
    tags = raw.tags.split(",").map((t) => t.trim()).filter(Boolean);
  }

  return {
    email,
    tags,
    // mailcow mengirim active sebagai 1/0, "1"/"0", atau boolean.
    active: raw.active === undefined ? true : ["1", "true"].includes(String(raw.active).toLowerCase()),
    displayName: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : null,
  };
}

export async function getVersion(opts: MailcowOptions): Promise<string> {
  const body = await call<{ version?: string } | { version?: string }[]>(
    opts,
    "/get/status/version"
  );
  const first = Array.isArray(body) ? body[0] : body;
  return first?.version ? String(first.version) : "tidak diketahui";
}

export async function listMailboxes(opts: MailcowOptions): Promise<MailboxRecord[]> {
  const body = await call<MailcowMailboxRaw[]>(opts, "/get/mailbox/all");
  if (!Array.isArray(body)) {
    throw new MailcowError("Jawaban /get/mailbox/all bukan daftar — bentuk API tidak dikenali.");
  }
  return body.map(normalizeMailbox).filter((m): m is MailboxRecord => m !== null);
}

/**
 * Menulis daftar tag sebuah mailbox.
 *
 * Daftar yang dikirim menggantikan seluruh tag mailbox itu, jadi pemanggil
 * WAJIB menyusunnya lewat applyDivisionTag() yang mempertahankan tag milik IT.
 */
export async function setMailboxTags(
  opts: MailcowOptions,
  email: string,
  tags: string[]
): Promise<void> {
  await call(opts, "/edit/mailbox", {
    method: "POST",
    body: JSON.stringify({ items: [email], attr: { tags } }),
  });
}

export interface ConnectionProbe {
  ok: boolean;
  version: string | null;
  mailboxCount: number | null;
  error: string | null;
}

/**
 * Uji koneksi: versi DAN daftar mailbox.
 *
 * Keduanya diperiksa karena versi saja tidak membuktikan apa pun tentang
 * endpoint yang benar-benar dipakai fitur ini. "Terhubung" yang ternyata tidak
 * bisa membaca mailbox adalah kabar baik yang menyesatkan.
 */
export async function probeConnection(opts: MailcowOptions): Promise<ConnectionProbe> {
  try {
    const version = await getVersion(opts);
    const mailboxes = await listMailboxes(opts);
    return { ok: true, version, mailboxCount: mailboxes.length, error: null };
  } catch (e) {
    return {
      ok: false,
      version: null,
      mailboxCount: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Mengganti password sebuah mailbox.
 *
 * Butuh API key berizin TULIS. Endpoint-nya sama dengan penulisan tag, hanya
 * atributnya berbeda — mailcow meminta password dikirim dua kali.
 *
 * Pemanggilnya WAJIB sudah memastikan orang tersebut memang pemilik mailbox
 * ini; fungsi ini tidak punya cara mengetahuinya sendiri. Dengan API key
 * read-write, ia bisa mengganti password mailbox SIAPA PUN.
 */
export async function setMailboxPassword(
  opts: MailcowOptions,
  email: string,
  password: string
): Promise<void> {
  await call(opts, "/edit/mailbox", {
    method: "POST",
    body: JSON.stringify({ items: [email], attr: { password, password2: password } }),
  });
}
