import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  readApiToken,
  baseUrlFromIssuer,
  normalizeUser,
  normalizeGroup,
  listUsers,
  listGroups,
  addUserToGroup,
  probeConnection,
  AuthentikError,
  type Fetcher,
} from "@/lib/authentik";

const ENV = "AUTHENTIK_TEST_TOKEN";

/** Authentik palsu: mencatat panggilan, menjawab dari daftar yang disiapkan. */
function fake(
  responses: Record<string, { status?: number; body?: unknown; raw?: string }>
): Fetcher & { calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const key = Object.keys(responses).find((k) => url.includes(k));
    if (!key) return new Response(JSON.stringify({ detail: "not found" }), { status: 404 });
    const r = responses[key];
    return new Response(r.raw ?? JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
  }) as Fetcher & { calls: { url: string; init: RequestInit }[] };
  f.calls = calls;
  return f;
}

const opts = (fetcher: Fetcher) => ({
  baseUrl: "https://auth.perumnet.id",
  credentialRef: ENV,
  fetcher,
});

afterEach(() => {
  delete process.env[ENV];
});

describe("readApiToken — rahasia hanya dari env", () => {
  test("membaca dari env var yang namanya diberikan", () => {
    process.env[ENV] = "tok123";
    assert.equal(readApiToken(ENV), "tok123");
  });

  test("kosong ditolak dengan pesan yang menyebut nama variabelnya", () => {
    assert.throws(() => readApiToken(ENV), /AUTHENTIK_TEST_TOKEN belum di-set/);
  });
});

describe("baseUrlFromIssuer", () => {
  test("mengambil origin dari issuer OIDC", () => {
    assert.equal(
      baseUrlFromIssuer("https://auth.perumnet.id/application/o/perumnet-crm/"),
      "https://auth.perumnet.id"
    );
  });

  test("issuer tidak valid → null, bukan melempar", () => {
    assert.equal(baseUrlFromIssuer("bukan-url"), null);
  });
});

describe("401 dan 403 dibedakan", () => {
  // Keduanya "ditolak", tetapi perbaikannya berlawanan: yang satu soal nilai
  // token, yang satu soal izin pemiliknya. Menyamakannya membuat orang
  // memeriksa hal yang salah — dan itu benar-benar terjadi saat integrasi ini
  // pertama kali dicoba terhadap Authentik sungguhan.
  test("401 menunjuk ke nilai token di .env", async () => {
    process.env[ENV] = "salah";
    const f = fake({ "/core/users/": { status: 401 } });
    await assert.rejects(() => listUsers(opts(f)), /tidak dikenali.*401.*AUTHENTIK_TEST_TOKEN/s);
  });

  test("403 menunjuk ke izin service account, bukan ke tokennya", async () => {
    process.env[ENV] = "benar";
    const f = fake({ "/core/groups/": { status: 403 } });
    await assert.rejects(
      () => listGroups(opts(f)),
      /berizin.*403.*view_user, view_group, add_group, change_group/s
    );
  });
});

describe("normalisasi balasan", () => {
  test("pengguna dinormalkan, email jadi huruf kecil", () => {
    const u = normalizeUser({ pk: 3, email: "Teguh@Perum.ID", username: "teguh" });
    assert.equal(u!.email, "teguh@perum.id");
    assert.equal(u!.pk, 3);
  });

  test("pengguna tanpa email TETAP dikenali, tidak dibuang", () => {
    // Akun layanan sering tanpa email. Membuangnya justru berbahaya: ia bisa
    // menjadi anggota grup, dan yang tak dikenali akan dianggap "tak dikenal
    // CRM" lalu masuk daftar peringatan — bukan dikeluarkan, tapi tetap
    // membingungkan.
    const u = normalizeUser({ pk: 5, username: "svc-crm-sync" });
    assert.equal(u!.email, "");
    assert.equal(u!.username, "svc-crm-sync");
  });

  test("pengguna tanpa username dilewati", () => {
    assert.equal(normalizeUser({ pk: 1 }), null);
  });

  test("grup dinormalkan beserta daftar anggotanya", () => {
    const g = normalizeGroup({ pk: "abc", name: "crm-divisi-mkt", users: [1, 2] });
    assert.deepEqual(g!.users, [1, 2]);
  });

  test("grup tanpa users menghasilkan daftar kosong, bukan gagal", () => {
    assert.deepEqual(normalizeGroup({ pk: "abc", name: "x" })!.users, []);
  });
});

describe("paginasi", () => {
  test("menarik seluruh halaman sampai habis", async () => {
    process.env[ENV] = "t";
    let call = 0;
    const f: Fetcher = async () => {
      call++;
      const body =
        call === 1
          ? { pagination: { next: 2 }, results: [{ pk: 1, username: "a" }] }
          : { pagination: {}, results: [{ pk: 2, username: "b" }] };
      return new Response(JSON.stringify(body), { status: 200 });
    };
    const users = await listUsers(opts(f));
    assert.deepEqual(users.map((u) => u.pk), [1, 2]);
  });

  test("next yang menunjuk halaman yang sama tidak membuat loop abadi", async () => {
    process.env[ENV] = "t";
    let call = 0;
    const f: Fetcher = async () => {
      call++;
      return new Response(
        JSON.stringify({ pagination: { next: 1 }, results: [{ pk: 1, username: "a" }] }),
        { status: 200 }
      );
    };
    await listUsers(opts(f));
    assert.equal(call, 1, "harus berhenti saat next tidak maju");
  });
});

describe("keanggotaan grup", () => {
  test("memakai endpoint per-anggota, bukan menulis ulang daftar users", async () => {
    // Menulis ulang seluruh daftar berarti tiap sinkronisasi menghapus
    // anggota yang tidak kita ketahui.
    process.env[ENV] = "t";
    const f = fake({ "/add_user/": { body: {} } });
    await addUserToGroup(opts(f), "grup-1", 7);
    assert.match(f.calls[0].url, /\/core\/groups\/grup-1\/add_user\/$/);
    assert.deepEqual(JSON.parse(String(f.calls[0].init.body)), { pk: 7 });
  });

  test("token dikirim sebagai Bearer", async () => {
    process.env[ENV] = "rahasia";
    const f = fake({ "/add_user/": { body: {} } });
    await addUserToGroup(opts(f), "g", 1);
    const h = f.calls[0].init.headers as Record<string, string>;
    assert.equal(h.Authorization, "Bearer rahasia");
  });
});

describe("probeConnection — pengguna DAN grup", () => {
  test("berhasil bila keduanya terbaca", async () => {
    process.env[ENV] = "t";
    const f = fake({
      "/core/users/": { body: { results: [{ pk: 1, username: "a" }] } },
      "/core/groups/": { body: { results: [{ pk: "g", name: "x" }] } },
    });
    const r = await probeConnection(opts(f));
    assert.equal(r.ok, true);
    assert.equal(r.userCount, 1);
    assert.equal(r.groupCount, 1);
  });

  test("pengguna terbaca tapi grup ditolak tetap GAGAL", async () => {
    // Persis keadaan nyata saat token belum diberi izin grup. "Terhubung"
    // yang tidak bisa membaca grup adalah kabar baik yang menyesatkan.
    process.env[ENV] = "t";
    const f = fake({
      "/core/users/": { body: { results: [] } },
      "/core/groups/": { status: 403 },
    });
    const r = await probeConnection(opts(f));
    assert.equal(r.ok, false);
    assert.match(r.error ?? "", /berizin/);
  });

  test("pesan galat tidak pernah memuat tokennya", async () => {
    process.env[ENV] = "token-sangat-rahasia";
    const f = fake({ "/core/users/": { status: 500 } });
    const r = await probeConnection(opts(f));
    assert.equal(r.ok, false);
    assert.equal(r.error!.includes("token-sangat-rahasia"), false);
  });
});
