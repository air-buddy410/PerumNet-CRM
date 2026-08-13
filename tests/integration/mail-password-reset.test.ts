import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { db, makeUser, tag, ensureMasterData, resetTransactionalData } from "./fixtures";
import { resetMailPasswordFor, MAILCOW_CODE } from "@/lib/mailserver";
import type { Fetcher } from "@/lib/mailcow";

// IT mereset password email seseorang (Fase 56).
//
// Di sini TIDAK ADA password lama — memang begitu, yang dilayani adalah orang
// yang lupa. Karena bukti kepemilikan tidak ada, jejaknya jadi satu-satunya
// pengaman: setiap reset harus tercatat lengkap dengan siapa pelakunya.

const ENV = "MAILCOW_RESET_KEY";

function fakeMailcow(opts: { tolak?: boolean } = {}) {
  const writes: { email: string; password?: string }[] = [];
  const fetcher: Fetcher = async (url, init) => {
    if (url.includes("/get/status/version")) return new Response(JSON.stringify({ version: "2026-08" }), { status: 200 });
    if (url.includes("/get/mailbox/all")) return new Response(JSON.stringify([]), { status: 200 });
    if (url.includes("/edit/mailbox")) {
      if (opts.tolak) {
        // Bentuk penolakan mailcow yang sesungguhnya: HTTP 200 dengan
        // type "error" di dalam badannya.
        return new Response(JSON.stringify([{ type: "error", msg: "insufficient privileges" }]), { status: 200 });
      }
      const body = JSON.parse(String(init.body));
      writes.push({ email: body.items[0], password: body.attr?.password });
      return new Response(JSON.stringify([{ type: "success", msg: "ok" }]), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  };
  return { fetcher, writes };
}

async function setupIntegration() {
  process.env[ENV] = "kunci-uji";
  await db.integration.upsert({
    where: { code: MAILCOW_CODE },
    update: { isEnabled: true, baseUrl: "https://mail.test.local", credentialRef: ENV },
    create: {
      code: MAILCOW_CODE, name: "Mailserver mailcow", category: "ITOPS", provider: "MAILCOW",
      baseUrl: "https://mail.test.local", authType: "API_KEY", credentialRef: ENV,
      isEnabled: true, webhookToken: "reset-token",
    },
  });
}

describe("IT mereset password email", () => {
  let petugas: { id: string; name: string };
  let target: { id: string; name: string; username: string; email: string };

  before(async () => {
    await resetTransactionalData();
    await ensureMasterData();
    await setupIntegration();
    const a = await makeUser(tag("it").toLowerCase(), "Petugas IT");
    petugas = { id: a.id, name: a.name };
    const t = await makeUser(tag("lupa").toLowerCase(), "Orang Lupa");
    target = { id: t.id, name: t.name, username: t.username, email: t.email };
  });
  after(async () => {
    await resetTransactionalData();
    delete process.env[ENV];
    await db.$disconnect();
  });

  test("berhasil, dan yang direset adalah alamat TARGET", async () => {
    const mc = fakeMailcow();
    const r = await resetMailPasswordFor(petugas, target, "SementaraDariIT99", { fetcher: mc.fetcher });
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    assert.equal(mc.writes.length, 1);
    assert.equal(mc.writes[0].email, target.email);
    assert.equal(mc.writes[0].password, "SementaraDariIT99");
  });

  test("SIAPA yang mereset tercatat — ini satu-satunya pengaman di sini", async () => {
    // Tidak ada password lama yang membuktikan kepemilikan, jadi jejaknya
    // yang harus lengkap: siapa pelakunya, dan kepada siapa.
    const log = await db.auditLog.findFirst({
      where: { action: "MAIL_PASSWORD_RESET" },
      orderBy: { createdAt: "desc" },
    });
    assert.notEqual(log, null);
    assert.equal(log!.userId, petugas.id, "pelakunya harus petugas IT, bukan targetnya");
    assert.equal(log!.entityId, target.id);
    assert.match(log!.description, new RegExp(petugas.name));
    assert.match(log!.description, new RegExp(target.email));
  });

  test("password sementara yang LEMAH ditolak", async () => {
    // Password sementara tetap password email — dan justru yang paling
    // sering dibiarkan terpakai berbulan-bulan.
    const mc = fakeMailcow();
    const r = await resetMailPasswordFor(petugas, target, "singkat", { fetcher: mc.fetcher });
    assert.equal(r.ok, false);
    assert.equal(mc.writes.length, 0);
  });

  test("target TANPA email ditolak dengan sebutan namanya", async () => {
    const mc = fakeMailcow();
    const r = await resetMailPasswordFor(petugas, { ...target, email: "" }, "SementaraDariIT99", {
      fetcher: mc.fetcher,
    });
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, new RegExp(target.username));
    assert.equal(mc.writes.length, 0);
  });

  test("mailcow MENOLAK (mis. kunci read-only) dilaporkan, bukan dianggap berhasil", async () => {
    const mc = fakeMailcow({ tolak: true });
    const r = await resetMailPasswordFor(petugas, target, "SementaraDariIT99", { fetcher: mc.fetcher });
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, /Mailserver menolak/);
    const gagal = await db.integrationEvent.count({
      where: { eventType: "MAILCOW_PASSWORD_RESET", status: "ERROR" },
    });
    assert.equal(gagal > 0, true, "kegagalannya harus tercatat");
  });

  test("PASSWORD tidak pernah tercatat di AuditLog", async () => {
    const rahasia = "SangatRahasiaSekali1";
    const mc = fakeMailcow();
    await resetMailPasswordFor(petugas, target, rahasia, { fetcher: mc.fetcher });
    assert.equal(await db.auditLog.count({ where: { description: { contains: rahasia } } }), 0);
  });
});
