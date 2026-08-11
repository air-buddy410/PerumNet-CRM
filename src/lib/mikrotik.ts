// ── Adapter MikroTik RouterOS v7 (Fase 24, PRD-NOC-TOOLS N2) ────
//
// RouterOS v7 menyediakan REST API di atas HTTPS, jadi cukup fetch bawaan —
// tidak ada pustaka pihak ketiga yang masuk ke sistem yang memegang data
// keuangan.
//
// Aturan yang dipegang di sini:
//  - ADAPTER INI READ-ONLY. Tidak ada satu pun jalur tulis ke router.
//    Perintah yang mengubah layanan (isolir/buka blokir) tetap lewat
//    NetworkAccessJob (Fase 10) yang auditable dan bisa diulang.
//  - Kredensial dibaca dari environment lewat NAMA env var yang disimpan di
//    database (`credentialRef`), bukan nilainya — pola yang sama dengan
//    OltDevice di Fase 13.
//  - Klasifikasi status dipisah sebagai fungsi murni supaya bisa diuji tanpa
//    router sungguhan.

export interface RouterOsActive {
  name?: string;
  address?: string;
  "caller-id"?: string;
  uptime?: string;
}

export interface RouterOsSecret {
  name?: string;
  profile?: string;
  disabled?: string | boolean;
}

export type PppoeStatus = "ONLINE" | "OFFLINE" | "DISABLED";

export interface PppoeSnapshot {
  username: string;
  status: PppoeStatus;
  address: string | null;
  callerId: string | null;
  uptimeSeconds: number | null;
}

export interface PppoeCounts {
  total: number;
  online: number;
  offline: number;
  disabled: number;
}

/** RouterOS mengirim boolean sebagai string "true"/"false". */
function isDisabled(value: string | boolean | undefined): boolean {
  return value === true || value === "true" || value === "yes";
}

/**
 * Uptime RouterOS berbentuk "1w2d03:04:05" — dikonversi ke detik.
 * Nilai yang tidak dikenali menghasilkan null, bukan 0, agar "tidak tahu"
 * tidak tersamar sebagai "baru saja naik".
 */
export function parseRouterOsUptime(raw: string | undefined): number | null {
  if (!raw || typeof raw !== "string") return null;
  const m = raw.match(
    /^(?:(\d+)w)?(?:(\d+)d)?(?:(\d+):)?(?:(\d+):)?(\d+)?$/,
  );
  if (!m) return null;
  const [, w, d, h, mi, s] = m;
  if (!w && !d && !h && !mi && !s) return null;
  // Bila hanya dua kelompok jam yang muncul, RouterOS menulis "hh:mm:ss".
  const hours = h ? Number(h) : 0;
  const minutes = mi ? Number(mi) : 0;
  const seconds = s ? Number(s) : 0;
  return (
    (w ? Number(w) * 604800 : 0) +
    (d ? Number(d) * 86400 : 0) +
    hours * 3600 +
    minutes * 60 +
    seconds
  );
}

/**
 * Menggabungkan daftar sesi aktif dan daftar secret menjadi satu keadaan.
 *
 *   ONLINE   = ada di /ppp/active
 *   DISABLED = ada di /ppp/secret dengan disabled=true
 *   OFFLINE  = ada di secret, aktif diizinkan, tapi tidak sedang tersambung
 *
 * Sesi aktif yang tidak punya secret (mis. dial-in sementara) tetap dihitung
 * ONLINE — kalau dibuang, jumlah di layar tidak akan cocok dengan kenyataan.
 */
export function classifyPppoe(
  actives: RouterOsActive[],
  secrets: RouterOsSecret[],
): { sessions: PppoeSnapshot[]; counts: PppoeCounts } {
  const activeByName = new Map<string, RouterOsActive>();
  for (const a of actives) {
    if (a.name) activeByName.set(a.name, a);
  }

  const sessions: PppoeSnapshot[] = [];
  const seen = new Set<string>();

  for (const secret of secrets) {
    const username = secret.name;
    if (!username) continue;
    seen.add(username);
    const active = activeByName.get(username);
    const status: PppoeStatus = active
      ? "ONLINE"
      : isDisabled(secret.disabled)
        ? "DISABLED"
        : "OFFLINE";
    sessions.push({
      username,
      status,
      address: active?.address ?? null,
      callerId: active?.["caller-id"] ?? null,
      uptimeSeconds: parseRouterOsUptime(active?.uptime),
    });
  }

  for (const [username, active] of activeByName) {
    if (seen.has(username)) continue;
    sessions.push({
      username,
      status: "ONLINE",
      address: active.address ?? null,
      callerId: active["caller-id"] ?? null,
      uptimeSeconds: parseRouterOsUptime(active.uptime),
    });
  }

  const counts: PppoeCounts = {
    total: sessions.length,
    online: sessions.filter((s) => s.status === "ONLINE").length,
    offline: sessions.filter((s) => s.status === "OFFLINE").length,
    disabled: sessions.filter((s) => s.status === "DISABLED").length,
  };
  return { sessions, counts };
}

// ── Sisi jaringan ───────────────────────────────────────────────

export class MikrotikError extends Error {
  constructor(message: string, public readonly status: number | null = null) {
    super(message);
    this.name = "MikrotikError";
  }
}

/** Kredensial dibaca dari env var yang NAMANYA disimpan di database. */
export function readCredential(credentialRef: string): { user: string; password: string } {
  const raw = process.env[credentialRef];
  if (!raw) {
    throw new MikrotikError(
      `Env var ${credentialRef} belum di-set — kredensial router tidak tersedia.`,
    );
  }
  const idx = raw.indexOf(":");
  if (idx <= 0) {
    throw new MikrotikError(
      `Isi ${credentialRef} harus berbentuk "user:password".`,
    );
  }
  return { user: raw.slice(0, idx), password: raw.slice(idx + 1) };
}

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;


// ── Sertifikat self-signed ──────────────────────────────────────
// RouterOS biasanya memakai sertifikat yang dibuat sendiri, dan fetch Node
// menolaknya. Melewati verifikasi TLS berarti koneksi bisa disadap atau
// dibajak di tengah jalan, jadi ini MATI secara default dan hanya menyala
// bila dinyalakan sadar lewat MIKROTIK_INSECURE_TLS=1.
//
// Jalan yang benar tetap: pasang sertifikat tepercaya di router. Opsi ini
// untuk jaringan manajemen tertutup, bukan untuk kenyamanan.

export function insecureTlsEnabled(): boolean {
  return process.env.MIKROTIK_INSECURE_TLS === "1";
}

/** Fetcher berbasis node:https yang melewati verifikasi sertifikat. */
export const insecureFetcher: Fetcher = async (url, init) => {
  const https = await import("node:https");
  const target = new URL(url);
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(init.headers ?? {})) headers[k] = String(v);

  return new Promise<Response>((resolve, reject) => {
    const req = https.request(
      {
        hostname: target.hostname,
        port: target.port || 443,
        path: target.pathname + target.search,
        method: init.method ?? "GET",
        headers,
        rejectUnauthorized: false,
        timeout: 10_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c as Buffer));
        res.on("end", () =>
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode ?? 500,
              headers: { "content-type": res.headers["content-type"] ?? "application/json" },
            })
          )
        );
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout menghubungi router")));
    req.on("error", reject);
    req.end();
  });
};

/** Fetcher yang dipakai bila pemanggil tidak menyuntikkan sendiri. */
export function defaultFetcher(): Fetcher | undefined {
  return insecureTlsEnabled() ? insecureFetcher : undefined;
}

export interface RouterOsClientOptions {
  baseUrl: string;
  credentialRef: string;
  timeoutMs?: number;
  /** Disuntik saat pengujian agar tidak perlu router sungguhan. */
  fetcher?: Fetcher;
}

async function routerOsGet<T>(
  path: string,
  options: RouterOsClientOptions,
): Promise<T> {
  if (typeof window !== "undefined") {
    throw new MikrotikError("Adapter MikroTik hanya boleh dipakai di server.");
  }
  const { user, password } = readCredential(options.credentialRef);
  const url = `${options.baseUrl.replace(/\/+$/, "")}/rest${path}`;
  const auth = Buffer.from(`${user}:${password}`).toString("base64");

  const doFetch = options.fetcher ?? defaultFetcher() ?? fetch;
  let response: Response;
  try {
    response = await doFetch(url, {
      method: "GET",
      headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      cache: "no-store",
    });
  } catch (error) {
    // Pesan error tidak pernah memuat kredensial.
    throw new MikrotikError(
      `Gagal menghubungi router ${options.baseUrl}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!response.ok) {
    throw new MikrotikError(
      `Router menjawab HTTP ${response.status} untuk ${path}`,
      response.status,
    );
  }
  return (await response.json()) as T;
}

/** Menarik keadaan PPPoE satu router. Read-only. */
export async function fetchPppoeState(options: RouterOsClientOptions) {
  const [actives, secrets] = await Promise.all([
    routerOsGet<RouterOsActive[]>("/ppp/active", options),
    routerOsGet<RouterOsSecret[]>("/ppp/secret", options),
  ]);
  return classifyPppoe(actives ?? [], secrets ?? []);
}
