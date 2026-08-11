import { test, describe, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import {
  db,
  tag,
  makeUser,
  makeCustomerWithService,
  ensureMasterData,
  resetTransactionalData,
} from "./fixtures";
import { loadNetworkMap } from "@/lib/noc-map";

// Fase 37b — peta harus tahu siapa yang sedang offline MENURUT ROUTER, bukan
// menurut status langganan. Keduanya berbeda: pelanggan berstatus ACTIVE bisa
// saja jaringannya mati, dan itulah yang perlu terlihat di peta.

async function scenario(label: string) {
  const master = await ensureMasterData();
  const creator = await makeUser(`map-${label}`, `Map ${label}`);

  const site = await db.networkSite.create({
    data: { siteCode: `SITE-${label}`, name: `POP ${label}`, type: "POP", latitude: -8.6, longitude: 115.2 },
  });
  const device = await db.networkDevice.create({
    data: { hostname: `rtr-${label}`, deviceType: "ROUTER", siteId: site.id },
  });
  const router = await db.mikrotikRouter.create({
    data: {
      networkDeviceId: device.id,
      managementUrl: "https://127.0.0.1:8729",
      credentialRef: "TEST_CRED_ENV_NAME",
      lastPolledAt: new Date("2026-08-12T00:00:00Z"),
    },
  });
  const odp = await db.odp.create({
    data: { code: `ODP-${label}`, portCapacity: 8, latitude: -8.65, longitude: 115.21 },
  });

  async function attach(suffix: string, sessionStatus: string | null, lastSeen?: Date) {
    const { customer, subscription } = await makeCustomerWithService(
      creator.id,
      master.pkg.id,
      `${label}${suffix}`
    );
    await db.customer.update({
      where: { id: customer.id },
      data: { latitude: -8.66, longitude: 115.22 },
    });
    await db.odpPort.create({
      data: {
        odpId: odp.id,
        portNumber: Number(suffix),
        subscriptionId: subscription.id,
        status: "USED",
      },
    });
    if (sessionStatus) {
      await db.pppoeSession.create({
        data: {
          routerId: router.id,
          subscriptionId: subscription.id,
          username: `user-${label}${suffix}`,
          status: sessionStatus,
          lastSeenAt: lastSeen ?? null,
        },
      });
    }
    return subscription;
  }

  return { router, odp, attach };
}

describe("peta: status sambungan langsung (Fase 37b)", () => {
  before(async () => { await resetTransactionalData(); await ensureMasterData(); });
  beforeEach(async () => { await resetTransactionalData(); await ensureMasterData(); });
  after(async () => { await resetTransactionalData(); await db.$disconnect(); });

  test("status diambil dari sesi router, bukan dari status langganan", async () => {
    const s = await scenario(tag("A"));
    await s.attach("1", "ONLINE");
    await s.attach("2", "OFFLINE", new Date("2026-08-10T05:00:00Z"));

    const data = await loadNetworkMap();
    const byUser = new Map(data.customers.map((c) => [c.pppoeUsername, c]));

    // Kedua langganan berstatus ACTIVE, tetapi sambungannya berbeda.
    assert.equal(data.customers.every((c) => c.status === "ACTIVE"), true);
    assert.equal(byUser.get(`user-${s.odp.code.replace("ODP-", "")}1`)?.linkStatus ?? "-", "ONLINE");
    const offline = data.customers.find((c) => c.linkStatus === "OFFLINE");
    assert.ok(offline, "ada pelanggan yang tercatat offline");
    assert.equal(offline!.lastSeenAt, "2026-08-10T05:00:00.000Z");
  });

  test("tanpa sesi → UNKNOWN, dan TIDAK ikut terhitung offline", async () => {
    const s = await scenario(tag("B"));
    await s.attach("1", null);

    const data = await loadNetworkMap();
    assert.equal(data.customers[0].linkStatus, "UNKNOWN");
    assert.equal(data.linkCounts.OFFLINE, 0, "tidak boleh dituduh mati");
    assert.equal(data.linkCounts.UNKNOWN, 1);
  });

  test("rekap dihitung dari titik yang tampil, bukan seluruh tabel", async () => {
    const s = await scenario(tag("C"));
    await s.attach("1", "ONLINE");
    await s.attach("2", "OFFLINE");
    await s.attach("3", "DISABLED");

    const semua = await loadNetworkMap();
    assert.deepEqual(semua.linkCounts, { ONLINE: 1, OFFLINE: 1, DISABLED: 1, UNKNOWN: 0 });

    const hanyaOffline = await loadNetworkMap({ linkStatus: "OFFLINE" });
    assert.equal(hanyaOffline.customers.length, 1);
    assert.deepEqual(
      hanyaOffline.linkCounts,
      { ONLINE: 0, OFFLINE: 1, DISABLED: 0, UNKNOWN: 0 },
      "angka di layar harus cocok dengan yang bisa diklik"
    );
  });

  test("saringan router menyaring pelanggan, tetapi TIDAK menghapus topologi", async () => {
    const s = await scenario(tag("D"));
    await s.attach("1", "ONLINE");

    const lain = await loadNetworkMap({ routerId: "router-yang-tidak-ada" });
    assert.equal(lain.customers.length, 0, "pelanggan router lain tidak tampil");
    assert.ok(lain.odps.length > 0, "ODP tetap tampil — topologi bukan milik satu router");
  });

  test("daftar router dan waktu tarik terakhir ikut dikembalikan", async () => {
    const s = await scenario(tag("E"));
    await s.attach("1", "ONLINE");

    const data = await loadNetworkMap();
    assert.equal(data.routers.length, 1);
    assert.equal(data.routers[0].id, s.router.id);
    assert.equal(data.lastSyncedAt, "2026-08-12T00:00:00.000Z");
  });

  test("tanpa router sama sekali, lastSyncedAt null — bukan tanggal palsu", async () => {
    const master = await ensureMasterData();
    const creator = await makeUser(`map-${tag("F")}`, "Map F");
    const odp = await db.odp.create({
      data: { code: `ODP-${tag("F")}`, portCapacity: 4, latitude: -8.6, longitude: 115.2 },
    });
    const { subscription } = await makeCustomerWithService(creator.id, master.pkg.id, tag("F"));
    await db.odpPort.create({
      data: { odpId: odp.id, portNumber: 1, subscriptionId: subscription.id, status: "USED" },
    });

    const data = await loadNetworkMap();
    assert.equal(data.lastSyncedAt, null);
    assert.deepEqual(data.routers, []);
  });

  test("username PPPoE jatuh ke data langganan bila sesinya belum ada", async () => {
    const s = await scenario(tag("G"));
    await s.attach("1", null);
    const data = await loadNetworkMap();
    // makeCustomerWithService mengisi pppoeUsername pada langganan.
    assert.ok(data.customers[0].pppoeUsername, "tetap ada nama akun untuk ditampilkan");
  });
});
