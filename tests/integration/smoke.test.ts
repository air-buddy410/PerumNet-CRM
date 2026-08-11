import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { db, ensureMasterData, resetTransactionalData } from "./fixtures";
import { databaseNameOf } from "./db";

describe("penyiapan database tes", () => {
  before(async () => { await resetTransactionalData(); await ensureMasterData(); });
  after(async () => { await resetTransactionalData(); await db.$disconnect(); });

  test("berjalan di database tes, bukan dev", () => {
    assert.match(databaseNameOf(process.env.DATABASE_URL!), /_test$/);
  });

  test("master data siap", async () => {
    assert.ok(await db.warehouse.findFirst({ where: { code: "WH-TEST" } }));
    assert.ok(await db.item.findFirst({ where: { code: "ITM-TEST-ONT" } }));
  });

  test("reset mengosongkan data transaksional", async () => {
    assert.equal(await db.customer.count(), 0);
    assert.equal(await db.serializedDevice.count(), 0);
  });
});
