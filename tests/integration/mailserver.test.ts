import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { db, actor, makeUser, ensureMasterData, resetTransactionalData, tag } from "./fixtures";
import {
  loadMailcowIntegration,
  mailcowBlocker,
  loadMailboxOverview,
  pushDivisionTag,
  pushAllDivisionTags,
  MAILCOW_CODE,
} from "@/lib/mailserver";
import type { Fetcher } from "@/lib/mailcow";

const ENV = "MAILCOW_ITEST_KEY";

let IT: ReturnType<typeof actor>;
let integrationId: string;

/** Mailserver palsu yang menyimpan tag di memori, seperti mailcow sungguhan. */
function fakeMailserver(initial: Record<string, string[]>) {
  const boxes = new Map(Object.entries(initial).map(([e, t]) => [e, [...t]]));
  const writes: { email: string; tags: string[] }[] = [];

  const fetcher: Fetcher = async (url, init) => {
    if (url.includes("/get/status/version")) {
      return new Response(JSON.stringify({ version: "2026-08" }), { status: 200 });
    }
    if (url.includes("/get/mailbox/all")) {
      const rows = [...boxes.entries()].map(([username, tags]) => ({ username, tags, active: "1" }));
      return new Response(JSON.stringify(rows), { status: 200 });
    }
    if (url.includes("/edit/mailbox")) {
      const body = JSON.parse(String(init.body));
      const email = body.items[0];
      const tags = body.attr.tags as string[];
      boxes.set(email, [...tags]);
      writes.push({ email, tags: [...tags] });
      return new Response(JSON.stringify([{ type: "success", msg: "ok" }]), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  };
  return { fetcher, boxes, writes };
}

async function setupIntegration(enabled = true) {
  const row = await db.integration.upsert({
    where: { code: MAILCOW_CODE },
    update: { isEnabled: enabled, baseUrl: "https://mail.test.local", credentialRef: ENV },
    create: {
      code: MAILCOW_CODE,
      name: "Mailserver mailcow",
      category: "ITOPS",
      provider: "MAILCOW",
      baseUrl: "https://mail.test.local",
      authType: "API_KEY",
      credentialRef: ENV,
      isEnabled: enabled,
      webhookToken: "itest-token",
    },
  });
  return row.id;
}

async function cleanupIntegration() {
  await db.integrationEvent.deleteMany({});
  await db.integration.deleteMany({ where: { provider: "MAILCOW" } });
}

describe("mailserver: setting & kesiapan", () => {
  before(async () => {
    await ensureMasterData();
    await resetTransactionalData();
    await cleanupIntegration();
    IT = actor((await makeUser(tag("it").toLowerCase(), "IT Uji")).id, "it");
  });
  after(async () => {
    await cleanupIntegration();
    await resetTransactionalData();
    delete process.env[ENV];
    await db.$disconnect();
  });

  test("tanpa integrasi terdaftar, blocker menyebutkannya", async () => {
    await cleanupIntegration();
    assert.equal(await loadMailcowIntegration(), null);
    assert.match(mailcowBlocker(null) ?? "", /belum didaftarkan/);
  });

  test("integrasi yang masih dimatikan tidak dianggap siap", async () => {
    integrationId = await setupIntegration(false);
    const cfg = await loadMailcowIntegration();
    assert.match(mailcowBlocker(cfg) ?? "", /masih dimatikan/);
  });

  test("integrasi aktif dan lengkap dianggap siap", async () => {
    integrationId = await setupIntegration(true);
    const cfg = await loadMailcowIntegration();
    assert.equal(mailcowBlocker(cfg), null);
  });

  test("credentialRef hanya menyimpan NAMA env var, bukan kuncinya", async () => {
    const cfg = await loadMailcowIntegration();
    assert.equal(cfg!.credentialRef, ENV);
    // Nilai sesungguhnya hanya ada di process.env, tidak pernah di baris ini.
    const raw = await db.integration.findUnique({ where: { id: cfg!.id } });
    assert.equal(JSON.stringify(raw).includes("rahasia-sekali"), false);
  });

  test("overview melaporkan galat bila env var belum di-set, bukan melempar", async () => {
    delete process.env[ENV];
    const { fetcher } = fakeMailserver({});
    const r = await loadMailboxOverview(fetcher);
    assert.match(r.error ?? "", /belum di-set/);
    assert.equal(r.rows.length, 0);
  });
});

describe("mailserver: CRM sebagai editor tag (keputusan E2)", () => {
  let mktDivisionId: string;
  let finDivisionId: string;

  before(async () => {
    await ensureMasterData();
    await resetTransactionalData();
    await cleanupIntegration();
    integrationId = await setupIntegration(true);
    IT = actor((await makeUser(tag("it").toLowerCase(), "IT Uji")).id, "it");
    const mkt = await db.division.upsert({
      where: { code: "MKT" }, update: {}, create: { code: "MKT", name: "Marketing" },
    });
    const fin = await db.division.upsert({
      where: { code: "FIN" }, update: {}, create: { code: "FIN", name: "Finance" },
    });
    mktDivisionId = mkt.id;
    finDivisionId = fin.id;
  });
  after(async () => {
    await cleanupIntegration();
    await resetTransactionalData();
    delete process.env[ENV];
    await db.$disconnect();
  });
  beforeEach(() => {
    process.env[ENV] = "rahasia-sekali";
  });

  async function makeAccount(username: string, divisionId: string | null) {
    return db.user.create({
      data: {
        username,
        email: `${username}@test.local`,
        name: username,
        passwordHash: "!integration-test-no-login",
        level: "STAFF",
        divisionId,
      },
    });
  }

  test("selisih tag dilaporkan tanpa mengubah apa pun", async () => {
    const u = await makeAccount(tag("a").toLowerCase(), mktDivisionId);
    const { fetcher, boxes } = fakeMailserver({ [u.email]: ["vip", "divisi-fin"] });

    const r = await loadMailboxOverview(fetcher);
    const row = r.rows.find((x) => x.email === u.email)!;
    assert.equal(row.state, "TAG_MISMATCH");
    assert.equal(row.crmDivisionCode, "MKT");
    assert.equal(row.tagDivisionCode, "FIN");

    // Tidak ada yang berubah — di kedua sisi.
    assert.deepEqual(boxes.get(u.email), ["vip", "divisi-fin"]);
    const still = await db.user.findUnique({ where: { id: u.id }, include: { division: true } });
    assert.equal(still!.division!.code, "MKT");
  });

  test("TAG MAILCOW TIDAK PERNAH MENGUBAH DIVISI DI CRM", async () => {
    // Inti keputusan E2, dan batas keamanannya: divisi menentukan siapa
    // approver supervisor. Kalau tag bisa mengubahnya, siapa pun yang bisa
    // mengedit mailbox bisa memindahkan orang ke divisi lain.
    const u = await makeAccount(tag("b").toLowerCase(), mktDivisionId);
    const { fetcher } = fakeMailserver({ [u.email]: ["divisi-fin"] });

    await loadMailboxOverview(fetcher);
    await pushDivisionTag(IT, u.email, fetcher);
    await pushAllDivisionTags(IT, fetcher);

    const after = await db.user.findUnique({ where: { id: u.id }, include: { division: true } });
    assert.equal(after!.divisionId, mktDivisionId);
    assert.equal(after!.division!.code, "MKT", "divisi CRM tidak boleh mengikuti tag mailcow");
  });

  test("mendorong divisi CRM menimpa tag divisi di mailcow", async () => {
    const u = await makeAccount(tag("c").toLowerCase(), finDivisionId);
    const { fetcher, boxes } = fakeMailserver({ [u.email]: ["divisi-mkt"] });

    const r = await pushDivisionTag(IT, u.email, fetcher);
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    assert.deepEqual(boxes.get(u.email), ["divisi-fin"]);
  });

  test("TAG MILIK IT DIPERTAHANKAN saat CRM menulis", async () => {
    // Menulis ulang seluruh daftar tag akan menghapus penanda yang dipasang
    // IT untuk keperluan mereka sendiri — kerusakan senyap.
    const u = await makeAccount(tag("d").toLowerCase(), mktDivisionId);
    const { fetcher, boxes } = fakeMailserver({
      [u.email]: ["vip", "no-quota-alert", "divisi-fin"],
    });

    await pushDivisionTag(IT, u.email, fetcher);
    const result = boxes.get(u.email)!;
    assert.equal(result.includes("vip"), true);
    assert.equal(result.includes("no-quota-alert"), true);
    assert.equal(result.includes("divisi-mkt"), true);
    assert.equal(result.includes("divisi-fin"), false);
  });

  test("tag divisi ganda diluruskan jadi satu", async () => {
    const u = await makeAccount(tag("e").toLowerCase(), mktDivisionId);
    const { fetcher, boxes } = fakeMailserver({ [u.email]: ["divisi-mkt", "divisi-fin"] });
    await pushDivisionTag(IT, u.email, fetcher);
    assert.deepEqual(boxes.get(u.email), ["divisi-mkt"]);
  });

  test("akun tanpa divisi di CRM DITOLAK — tidak menghapus tag yang mungkin benar", async () => {
    const u = await makeAccount(tag("f").toLowerCase(), null);
    const { fetcher, boxes } = fakeMailserver({ [u.email]: ["divisi-mkt"] });

    const r = await pushDivisionTag(IT, u.email, fetcher);
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, /belum punya divisi di CRM/);
    assert.deepEqual(boxes.get(u.email), ["divisi-mkt"], "tag lama tidak boleh terhapus");
  });

  test("mailbox bersama tanpa akun CRM dilaporkan, tidak ditindak", async () => {
    const { fetcher, writes } = fakeMailserver({ "info@test.local": [] });
    const r = await loadMailboxOverview(fetcher);
    const row = r.rows.find((x) => x.email === "info@test.local")!;
    assert.equal(row.state, "NO_CRM_ACCOUNT");
    assert.equal(row.actionable, false);

    await pushAllDivisionTags(IT, fetcher);
    assert.equal(writes.some((w) => w.email === "info@test.local"), false);
  });

  test("mendorong alamat yang tidak ada di mailserver ditolak dengan jujur", async () => {
    const u = await makeAccount(tag("g").toLowerCase(), mktDivisionId);
    const { fetcher } = fakeMailserver({});
    const r = await pushDivisionTag(IT, u.email, fetcher);
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, /tidak ada di mailserver/);
  });

  test("pushAllDivisionTags hanya menyentuh baris yang perlu ditindak", async () => {
    await resetTransactionalData();
    integrationId = await setupIntegration(true);
    IT = actor((await makeUser(tag("it").toLowerCase(), "IT Uji")).id, "it");
    const sesuai = await makeAccount(tag("h").toLowerCase(), mktDivisionId);
    const beda = await makeAccount(tag("i").toLowerCase(), finDivisionId);
    const { fetcher, writes } = fakeMailserver({
      [sesuai.email]: ["divisi-mkt"],
      [beda.email]: ["divisi-mkt"],
    });

    const r = await pushAllDivisionTags(IT, fetcher);
    assert.equal(r.pushed, 1);
    assert.equal(r.failed, 0);
    assert.deepEqual(writes.map((w) => w.email), [beda.email]);
  });

  test("perubahan tag tercatat di audit log beserta nilai lama dan barunya", async () => {
    const u = await makeAccount(tag("j").toLowerCase(), mktDivisionId);
    const { fetcher } = fakeMailserver({ [u.email]: ["vip"] });
    await pushDivisionTag(IT, u.email, fetcher);

    const log = await db.auditLog.findFirst({
      where: { action: "MAILCOW_TAG_PUSH", entityId: u.id },
      orderBy: { createdAt: "desc" },
    });
    assert.notEqual(log, null);
    assert.match(log!.metadata ?? "", /divisi-mkt/);
    assert.match(log!.metadata ?? "", /vip/);
  });

  test("lalu lintas ke mailserver tercatat sebagai IntegrationEvent", async () => {
    const events = await db.integrationEvent.findMany({
      where: { integrationId, eventType: "MAILCOW_TAG_PUSH" },
    });
    assert.equal(events.length > 0, true);
    assert.equal(events.every((e) => e.direction === "OUT"), true);
  });
});
