import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { db, tag, ensureMasterData, resetTransactionalData } from "./fixtures";
import { ingestMonitoringAlert } from "@/lib/integrations";

// Alarm monitoring masuk lewat webhook (PRD §30–31), dipakai LibreNMS (Fase 66).
//
// Yang dijaga di sini terutama PENAUTANNYA ke perangkat dan site. Alarm yang
// terbit tanpa tertaut tetap terlihat "berhasil" — tidak ada galat, statusnya
// OK — padahal pertanyaan yang paling penting saat jaringan bermasalah,
// "pelanggan mana yang terdampak", dijawab kosong.

const KODE = "librenms-uji";

describe("alarm monitoring dari webhook", () => {
  let siteId: string;
  let deviceId: string;
  let token: string;

  before(async () => {
    await resetTransactionalData();
    await ensureMasterData();
    await db.integration.deleteMany({ where: { code: KODE } });
    await db.networkDevice.deleteMany({ where: { hostname: { contains: "UJI_NAGA" } } });
    await db.networkSite.deleteMany({ where: { siteCode: "UJINGB" } });

    const site = await db.networkSite.create({
      data: { siteCode: "UJINGB", name: "Nagabasukih Uji", type: "POP" },
    });
    siteId = site.id;
    // Didaftarkan HURUF BESAR, seperti kebiasaan penamaan perangkat di sini.
    const dev = await db.networkDevice.create({
      data: { hostname: "UJI_NAGA_D", deviceType: "ROUTER", siteId: site.id },
    });
    deviceId = dev.id;

    token = tag("tok");
    await db.integration.create({
      data: {
        code: KODE,
        name: "LibreNMS Uji",
        category: "NETWORK",
        provider: "LIBRENMS",
        webhookToken: token,
        isEnabled: true,
      },
    });
  });

  after(async () => {
    await db.networkAlarm.deleteMany({ where: { source: KODE } });
    await db.integrationEvent.deleteMany({ where: { integration: { code: KODE } } });
    await db.integration.deleteMany({ where: { code: KODE } });
    await db.networkDevice.deleteMany({ where: { id: deviceId } });
    await db.networkSite.deleteMany({ where: { id: siteId } });
    await db.$disconnect();
  });

  async function kirim(over: Record<string, unknown> = {}, tok: string | null = token) {
    return ingestMonitoringAlert(KODE, tok, {
      message: "Port sfp-sfpplus1 down",
      ...over,
    } as never);
  }

  test("HURUF BESAR-KECIL TIDAK MENGHALANGI penautan perangkat", async () => {
    // Inilah bug yang membuat tes ini ada. Pencocokan dulu mengecilkan huruf
    // lalu mencari persis; perangkat didaftarkan huruf besar, jadi tidak pernah
    // ketemu. Nama perangkat datang dari sistem lain — LibreNMS memakai
    // sysName, yang di RouterOS otomatis huruf kecil — jadi menuntut keduanya
    // sama persis berarti menaruh syarat tak terlihat di antara dua sistem.
    const r = await kirim({ deviceHostname: "uji_naga_d", dedupKey: tag("d1") });
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    const alarm = await db.networkAlarm.findFirst({
      where: { source: KODE },
      orderBy: { createdAt: "desc" },
    });
    assert.equal(alarm?.deviceId, deviceId, "alarm TIDAK tertaut ke perangkat");
  });

  test("site juga tertaut tanpa peduli besar-kecil huruf", async () => {
    const r = await kirim({ siteCode: "ujingb", dedupKey: tag("d2") });
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    const alarm = await db.networkAlarm.findFirst({
      where: { source: KODE },
      orderBy: { createdAt: "desc" },
    });
    assert.equal(alarm?.siteId, siteId);
  });

  test("spasi di ujung nama tidak menggagalkan penautan", async () => {
    const r = await kirim({ deviceHostname: "  UJI_NAGA_D  ", dedupKey: tag("d3") });
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    const alarm = await db.networkAlarm.findFirst({
      where: { source: KODE },
      orderBy: { createdAt: "desc" },
    });
    assert.equal(alarm?.deviceId, deviceId);
  });

  test("perangkat yang TIDAK dikenal tetap menerbitkan alarm, tidak ditelan", async () => {
    // Perangkat baru sering muncul di monitoring sebelum sempat didaftarkan di
    // CRM. Menolak alarmnya berarti jaringan bermasalah tanpa ada yang tahu.
    const r = await kirim({ deviceHostname: "belum-terdaftar", dedupKey: tag("d4") });
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    const alarm = await db.networkAlarm.findFirst({
      where: { source: KODE },
      orderBy: { createdAt: "desc" },
    });
    assert.equal(alarm?.deviceId, null);
    assert.notEqual(alarm, null, "alarmnya tetap harus ada");
  });

  test("TOKEN SALAH ditolak, dan tidak ada alarm yang terbit", async () => {
    const sebelum = await db.networkAlarm.count({ where: { source: KODE } });
    const r = await kirim({ dedupKey: tag("d5") }, "token-ngawur");
    assert.equal(r.ok, false);
    assert.equal(await db.networkAlarm.count({ where: { source: KODE } }), sebelum);
  });

  test("integrasi NONAKTIF ditolak", async () => {
    await db.integration.update({ where: { code: KODE }, data: { isEnabled: false } });
    const r = await kirim({ dedupKey: tag("d6") });
    assert.equal(r.ok, false);
    await db.integration.update({ where: { code: KODE }, data: { isEnabled: true } });
  });

  test("payload tanpa message ditolak", async () => {
    const r = await ingestMonitoringAlert(KODE, token, { message: "  " } as never);
    assert.equal(r.ok, false);
  });

  test("RESOLVED menutup alarm yang cocok", async () => {
    const kunci = tag("d7");
    await kirim({ deviceHostname: "UJI_NAGA_D", dedupKey: kunci });
    const aktif = await db.networkAlarm.findFirst({ where: { dedupKey: kunci } });
    assert.equal(aktif?.clearedAt, null);

    const r = await kirim({ status: "RESOLVED", dedupKey: kunci });
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    const sesudah = await db.networkAlarm.findFirstOrThrow({ where: { dedupKey: kunci } });
    assert.notEqual(sesudah.clearedAt, null, "alarm harus tertutup sendiri saat pulih");
  });

  test("RESOLVED tanpa alarm aktif bukan kegagalan", async () => {
    // Monitoring sering mengirim pemulihan untuk sesuatu yang tidak pernah
    // tercatat di sini. Menjadikannya galat berarti log integrasi penuh oleh
    // hal yang tidak perlu diperbaiki siapa pun.
    const r = await kirim({ status: "RESOLVED", dedupKey: tag("tidak-ada") });
    assert.equal(r.ok, true, r.ok ? "" : r.error);
  });

  test("setiap kiriman tercatat di IntegrationEvent", async () => {
    // Webhook adalah jalur yang tidak dilihat siapa pun sampai ada yang salah.
    // Tanpa jejak, "alarm tidak muncul" mustahil ditelusuri.
    const n = await db.integrationEvent.count({ where: { integration: { code: KODE } } });
    assert.equal(n > 0, true);
  });
});
