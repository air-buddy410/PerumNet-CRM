// ── Klien Authentik (Fase 46) ───────────────────────────────────
//
// Pola yang sama dengan mikrotik.ts dan mailcow.ts, dan itu disengaja:
// token TIDAK PERNAH masuk database — yang disimpan hanya NAMA env var,
// fetcher bisa diganti sehingga seluruh perilaku teruji tanpa menyentuh IdP
// sungguhan, dan kegagalan berupa Error bertipe agar tidak bisa diabaikan
// diam-diam.

export class AuthentikError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null
  ) {
    super(message);
    this.name = "AuthentikError";
  }
}

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/** Token dibaca dari env var yang NAMANYA disimpan di database. */
export function readApiToken(credentialRef: string): string {
  const raw = process.env[credentialRef];
  if (!raw?.trim()) {
    throw new AuthentikError(
      `Env var ${credentialRef} belum di-set — token API Authentik tidak tersedia.`
    );
  }
  return raw.trim();
}

export interface AuthentikOptions {
  /** Alamat pangkal Authentik, mis. https://auth.perumnet.id */
  baseUrl: string;
  credentialRef: string;
  fetcher?: Fetcher;
  timeoutMs?: number;
}

function apiRoot(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/api/v3") ? trimmed : `${trimmed}/api/v3`;
}

/**
 * Menurunkan alamat pangkal Authentik dari issuer OIDC.
 *
 * Issuer berbentuk `https://host/application/o/<slug>/`; API-nya ada di
 * `https://host/api/v3`. Diturunkan alih-alih dikonfigurasi terpisah supaya
 * tidak mungkin ada dua alamat yang berbeda pendapat tentang IdP mana yang
 * sedang dipakai.
 */
export function baseUrlFromIssuer(issuer: string): string | null {
  try {
    return new URL(issuer).origin;
  } catch {
    return null;
  }
}

async function call<T>(
  opts: AuthentikOptions,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = readApiToken(opts.credentialRef);
  const url = `${apiRoot(opts.baseUrl)}${path}`;
  const doFetch = opts.fetcher ?? fetch;

  let res: Response;
  try {
    res = await doFetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    });
  } catch (e) {
    throw new AuthentikError(
      `Tidak bisa menghubungi Authentik di ${url}: ${e instanceof Error ? e.message : e}`
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new AuthentikError(
      "Token API ditolak Authentik (401/403). Periksa nilainya dan izin service account-nya.",
      res.status
    );
  }
  if (!res.ok) {
    const body = await res.text();
    // Isi balasan tidak diteruskan ke pemakai — ia bisa memuat gema
    // permintaan kita, termasuk header otorisasi pada beberapa proxy.
    console.error("[authentik] HTTP", res.status, path, body.slice(0, 300));
    throw new AuthentikError(`Authentik menjawab HTTP ${res.status} untuk ${path}.`, res.status);
  }
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AuthentikError(
      `Jawaban ${path} bukan JSON. Pastikan baseUrl menunjuk ke Authentik, bukan ke proxy lain.`
    );
  }
}

// ── Bentuk balasan ──────────────────────────────────────────────

interface Paged<T> {
  pagination?: { next?: number; total_pages?: number };
  results?: T[];
}

export interface AkUserRaw {
  pk?: unknown;
  email?: unknown;
  username?: unknown;
  is_active?: unknown;
}

export interface AkGroupRaw {
  pk?: unknown;
  name?: unknown;
  users?: unknown;
}

export interface AkUser {
  pk: number;
  email: string;
  username: string;
  isActive: boolean;
}

export interface AkGroup {
  pk: string;
  name: string;
  users: number[];
}

export function normalizeUser(raw: AkUserRaw): AkUser | null {
  const pk = typeof raw.pk === "number" ? raw.pk : Number(raw.pk);
  const username = typeof raw.username === "string" ? raw.username.trim() : "";
  if (!Number.isFinite(pk) || !username) return null;
  return {
    pk,
    // Email boleh kosong di Authentik (akun layanan). Dibiarkan kosong, bukan
    // dibuang: pengguna itu tetap perlu dikenali saat menjadi anggota grup,
    // justru supaya TIDAK ikut dikeluarkan sebagai "tak dikenal".
    email: typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "",
    username,
    isActive: raw.is_active === undefined ? true : Boolean(raw.is_active),
  };
}

export function normalizeGroup(raw: AkGroupRaw): AkGroup | null {
  const pk = raw.pk === undefined || raw.pk === null ? "" : String(raw.pk);
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!pk || !name) return null;
  const users = Array.isArray(raw.users)
    ? raw.users.map((u) => (typeof u === "number" ? u : Number(u))).filter(Number.isFinite)
    : [];
  return { pk, name, users };
}

/** Menarik seluruh halaman dari endpoint berpaginasi. */
async function fetchAll<TRaw, T>(
  opts: AuthentikOptions,
  path: string,
  normalize: (raw: TRaw) => T | null
): Promise<T[]> {
  const out: T[] = [];
  let page = 1;
  // Batas atas supaya kesalahan paginasi tidak berubah menjadi loop abadi
  // yang menghabiskan memori dan membebani IdP.
  for (let guard = 0; guard < 100; guard++) {
    const sep = path.includes("?") ? "&" : "?";
    const body = await call<Paged<TRaw>>(opts, `${path}${sep}page=${page}&page_size=100`);
    for (const raw of body.results ?? []) {
      const item = normalize(raw);
      if (item) out.push(item);
    }
    const next = body.pagination?.next;
    if (!next || next === page) break;
    page = next;
  }
  return out;
}

export async function listUsers(opts: AuthentikOptions): Promise<AkUser[]> {
  return fetchAll<AkUserRaw, AkUser>(opts, "/core/users/", normalizeUser);
}

export async function listGroups(opts: AuthentikOptions): Promise<AkGroup[]> {
  return fetchAll<AkGroupRaw, AkGroup>(opts, "/core/groups/", normalizeGroup);
}

export async function createGroup(opts: AuthentikOptions, name: string): Promise<AkGroup> {
  const raw = await call<AkGroupRaw>(opts, "/core/groups/", {
    method: "POST",
    body: JSON.stringify({ name, is_superuser: false }),
  });
  const g = normalizeGroup(raw);
  if (!g) throw new AuthentikError(`Authentik tidak mengembalikan grup yang bisa dibaca untuk "${name}".`);
  return g;
}

/**
 * Menambahkan atau mengeluarkan satu pengguna dari satu grup.
 *
 * Sengaja memakai endpoint per-anggota (`add_user`/`remove_user`), BUKAN
 * menulis ulang seluruh daftar `users` grup. Menulis ulang berarti setiap
 * sinkronisasi menghapus anggota yang tidak kita ketahui — persis kerusakan
 * yang pagar kedua di authentik-sync.ts berusaha cegah.
 */
export async function addUserToGroup(
  opts: AuthentikOptions,
  groupPk: string,
  userPk: number
): Promise<void> {
  await call(opts, `/core/groups/${encodeURIComponent(groupPk)}/add_user/`, {
    method: "POST",
    body: JSON.stringify({ pk: userPk }),
  });
}

export async function removeUserFromGroup(
  opts: AuthentikOptions,
  groupPk: string,
  userPk: number
): Promise<void> {
  await call(opts, `/core/groups/${encodeURIComponent(groupPk)}/remove_user/`, {
    method: "POST",
    body: JSON.stringify({ pk: userPk }),
  });
}

export interface AuthentikProbe {
  ok: boolean;
  userCount: number | null;
  groupCount: number | null;
  error: string | null;
}

/**
 * Uji koneksi: baca pengguna DAN grup.
 *
 * Keduanya diperiksa karena token bisa saja punya izin membaca pengguna
 * tetapi tidak grup — dan itulah izin yang benar-benar dipakai fitur ini.
 * "Terhubung" yang ternyata tidak bisa membaca grup adalah kabar baik yang
 * menyesatkan.
 */
export async function probeConnection(opts: AuthentikOptions): Promise<AuthentikProbe> {
  try {
    const users = await listUsers(opts);
    const groups = await listGroups(opts);
    return { ok: true, userCount: users.length, groupCount: groups.length, error: null };
  } catch (e) {
    return {
      ok: false,
      userCount: null,
      groupCount: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
