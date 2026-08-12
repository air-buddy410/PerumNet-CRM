import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  readApiKey,
  normalizeMailbox,
  assertNoApiError,
  getVersion,
  listMailboxes,
  setMailboxTags,
  probeConnection,
  MailcowError,
  type Fetcher,
} from "@/lib/mailcow";

const ENV = "MAILCOW_TEST_KEY";

/** Fetcher palsu: mencatat panggilan dan menjawab dari daftar yang disiapkan. */
function fakeFetcher(
  responses: Record<string, { status?: number; body: unknown; raw?: string }>
): Fetcher & { calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const key = Object.keys(responses).find((k) => url.includes(k));
    if (!key) return new Response("not found", { status: 404 });
    const r = responses[key];
    const text = r.raw ?? JSON.stringify(r.body);
    return new Response(text, { status: r.status ?? 200 });
  }) as Fetcher & { calls: { url: string; init: RequestInit }[] };
  f.calls = calls;
  return f;
}

const opts = (fetcher: Fetcher, baseUrl = "https://mail.perum.id") => ({
  baseUrl,
  credentialRef: ENV,
  fetcher,
});

afterEach(() => {
  delete process.env[ENV];
});

describe("readApiKey — rahasia tidak pernah dari database", () => {
  test("membaca dari env var yang namanya diberikan", () => {
    process.env[ENV] = "abc123";
    assert.equal(readApiKey(ENV), "abc123");
  });

  test("env var kosong ditolak dengan pesan yang menyebut namanya", () => {
    assert.throws(() => readApiKey(ENV), /MAILCOW_TEST_KEY belum di-set/);
  });

  test("env var berisi spasi saja tetap dianggap kosong", () => {
    process.env[ENV] = "   ";
    assert.throws(() => readApiKey(ENV), MailcowError);
  });
});

describe("assertNoApiError — HTTP 200 yang sebenarnya gagal", () => {
  test("jawaban bertipe error dilempar, bukan diloloskan", () => {
    // Jebakan klasik mailcow: status 200, isinya kegagalan.
    assert.throws(
      () => assertNoApiError([{ type: "error", msg: "authentication failed" }], "/edit/mailbox"),
      /menolak \/edit\/mailbox/
    );
  });

  test("tipe danger juga ditolak", () => {
    assert.throws(() => assertNoApiError([{ type: "danger", msg: "x" }], "/p"), MailcowError);
  });

  test("jawaban sukses lolos", () => {
    assert.doesNotThrow(() => assertNoApiError([{ type: "success", msg: "ok" }], "/p"));
  });

  test("daftar biasa tanpa field type lolos", () => {
    assert.doesNotThrow(() => assertNoApiError([{ username: "a@p.id" }], "/p"));
  });
});

describe("normalizeMailbox — bentuk tags berbeda antar versi", () => {
  test("tags berupa array", () => {
    const m = normalizeMailbox({ username: "A@Perum.ID", tags: ["vip", "divisi-mkt"] });
    assert.equal(m!.email, "a@perum.id");
    assert.deepEqual(m!.tags, ["vip", "divisi-mkt"]);
  });

  test("tags berupa string dipisah koma", () => {
    const m = normalizeMailbox({ username: "a@p.id", tags: "vip, divisi-mkt" });
    assert.deepEqual(m!.tags, ["vip", "divisi-mkt"]);
  });

  test("tanpa tags menghasilkan daftar kosong, bukan gagal", () => {
    assert.deepEqual(normalizeMailbox({ username: "a@p.id" })!.tags, []);
  });

  test("active dikirim sebagai 1/0 string", () => {
    assert.equal(normalizeMailbox({ username: "a@p.id", active: "1" })!.active, true);
    assert.equal(normalizeMailbox({ username: "a@p.id", active: "0" })!.active, false);
  });

  test("tanpa username dilewati, tidak menggagalkan seluruh sinkronisasi", () => {
    assert.equal(normalizeMailbox({ tags: ["vip"] }), null);
  });
});

describe("pemanggilan API", () => {
  test("API key dikirim di header X-API-Key", async () => {
    process.env[ENV] = "rahasia";
    const f = fakeFetcher({ "/get/status/version": { body: { version: "2025-01" } } });
    await getVersion(opts(f));
    const headers = f.calls[0].init.headers as Record<string, string>;
    assert.equal(headers["X-API-Key"], "rahasia");
  });

  test("baseUrl tanpa /api/v1 dilengkapi sendiri", async () => {
    process.env[ENV] = "k";
    const f = fakeFetcher({ "/get/status/version": { body: { version: "x" } } });
    await getVersion(opts(f, "https://mail.perum.id/"));
    assert.equal(f.calls[0].url, "https://mail.perum.id/api/v1/get/status/version");
  });

  test("baseUrl yang sudah memuat /api/v1 tidak digandakan", async () => {
    process.env[ENV] = "k";
    const f = fakeFetcher({ "/get/status/version": { body: { version: "x" } } });
    await getVersion(opts(f, "https://mail.perum.id/api/v1"));
    assert.equal(f.calls[0].url, "https://mail.perum.id/api/v1/get/status/version");
  });

  test("401 memberi pesan tentang API key, bukan galat mentah", async () => {
    process.env[ENV] = "salah";
    const f = fakeFetcher({ "/get/status/version": { status: 401, body: {} } });
    await assert.rejects(() => getVersion(opts(f)), /API key ditolak/);
  });

  test("404 menyebut kemungkinan versi berbeda", async () => {
    process.env[ENV] = "k";
    const f = fakeFetcher({ "/lain": { body: {} } });
    await assert.rejects(() => getVersion(opts(f)), /versi mailcow berbeda/);
  });

  test("jawaban HTML dianggap gagal, bukan berhasil", async () => {
    // Gejala khas API belum diaktifkan: halaman login dikirim sebagai 200.
    process.env[ENV] = "k";
    const f = fakeFetcher({ "/get/status/version": { body: null, raw: "<html>login</html>" } });
    await assert.rejects(() => getVersion(opts(f)), /bukan JSON/);
  });

  test("listMailboxes menormalkan dan membuang baris tanpa username", async () => {
    process.env[ENV] = "k";
    const f = fakeFetcher({
      "/get/mailbox/all": {
        body: [
          { username: "a@p.id", tags: ["divisi-mkt"] },
          { tags: ["rusak"] },
          { username: "B@P.ID", tags: "vip" },
        ],
      },
    });
    const rows = await listMailboxes(opts(f));
    assert.deepEqual(rows.map((r) => r.email), ["a@p.id", "b@p.id"]);
  });

  test("setMailboxTags mengirim seluruh daftar tag", async () => {
    process.env[ENV] = "k";
    const f = fakeFetcher({ "/edit/mailbox": { body: [{ type: "success" }] } });
    await setMailboxTags(opts(f), "a@p.id", ["vip", "divisi-fin"]);
    const sent = JSON.parse(String(f.calls[0].init.body));
    assert.deepEqual(sent, { items: ["a@p.id"], attr: { tags: ["vip", "divisi-fin"] } });
  });

  test("setMailboxTags melempar bila mailcow menolak dengan status 200", async () => {
    process.env[ENV] = "k";
    const f = fakeFetcher({ "/edit/mailbox": { body: [{ type: "error", msg: "nope" }] } });
    await assert.rejects(() => setMailboxTags(opts(f), "a@p.id", []), /menolak/);
  });
});

describe("probeConnection — versi saja tidak cukup", () => {
  test("berhasil bila versi DAN daftar mailbox terbaca", async () => {
    process.env[ENV] = "k";
    const f = fakeFetcher({
      "/get/status/version": { body: { version: "2025-08" } },
      "/get/mailbox/all": { body: [{ username: "a@p.id" }] },
    });
    const r = await probeConnection(opts(f));
    assert.equal(r.ok, true);
    assert.equal(r.version, "2025-08");
    assert.equal(r.mailboxCount, 1);
  });

  test("versi OK tapi mailbox gagal tetap dilaporkan GAGAL", async () => {
    // "Terhubung" yang ternyata tidak bisa membaca mailbox adalah kabar baik
    // yang menyesatkan.
    process.env[ENV] = "k";
    const f = fakeFetcher({ "/get/status/version": { body: { version: "2025-08" } } });
    const r = await probeConnection(opts(f));
    assert.equal(r.ok, false);
    assert.match(r.error ?? "", /tidak ada di server ini/);
  });

  test("env var belum di-set dilaporkan sebagai galat, bukan dilempar", async () => {
    const f = fakeFetcher({});
    const r = await probeConnection(opts(f));
    assert.equal(r.ok, false);
    assert.match(r.error ?? "", /belum di-set/);
  });

  test("pesan galat tidak pernah memuat API key", async () => {
    process.env[ENV] = "kunci-sangat-rahasia";
    const f = fakeFetcher({ "/get/status/version": { status: 500, body: {} } });
    const r = await probeConnection(opts(f));
    assert.equal(r.ok, false);
    assert.equal(r.error!.includes("kunci-sangat-rahasia"), false);
  });
});
