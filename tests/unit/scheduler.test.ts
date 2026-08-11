import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isDue, isLeaseExpired, LEASE_TIMEOUT_MS, TASKS } from "@/lib/scheduler";

const now = new Date("2026-08-11T10:00:00Z");

describe("isDue", () => {
  test("tugas nonaktif tidak pernah jatuh tempo", () => {
    assert.equal(
      isDue({ isEnabled: false, intervalSec: 60, lastRunAt: null }, now),
      false
    );
  });

  test("belum pernah jalan → langsung jatuh tempo", () => {
    assert.equal(isDue({ isEnabled: true, intervalSec: 60, lastRunAt: null }, now), true);
  });

  test("belum melewati interval → belum jatuh tempo", () => {
    const lastRunAt = new Date(now.getTime() - 30_000);
    assert.equal(isDue({ isEnabled: true, intervalSec: 60, lastRunAt }, now), false);
  });

  test("tepat pada interval → jatuh tempo", () => {
    const lastRunAt = new Date(now.getTime() - 60_000);
    assert.equal(isDue({ isEnabled: true, intervalSec: 60, lastRunAt }, now), true);
  });
});

describe("isLeaseExpired", () => {
  test("tanpa kunci berarti bebas diambil", () => {
    assert.equal(isLeaseExpired({ lockedAt: null }, now), true);
  });

  test("kunci yang baru dipasang belum kedaluwarsa", () => {
    assert.equal(isLeaseExpired({ lockedAt: new Date(now.getTime() - 1000) }, now), false);
  });

  test("kunci melewati batas sewa boleh direbut — worker mati tidak mengunci selamanya", () => {
    const stale = new Date(now.getTime() - LEASE_TIMEOUT_MS - 1000);
    assert.equal(isLeaseExpired({ lockedAt: stale }, now), true);
  });
});

describe("registry tugas", () => {
  test("kode tugas unik", () => {
    const codes = TASKS.map((t) => t.code);
    assert.equal(new Set(codes).size, codes.length);
  });

  test("setiap tugas punya interval masuk akal", () => {
    for (const t of TASKS) {
      assert.ok(t.defaultIntervalSec >= 30, `${t.code} terlalu sering`);
      assert.ok(t.defaultIntervalSec <= 86_400, `${t.code} terlalu jarang`);
    }
  });

  test("evaluasi dunning TIDAK aktif secara default", () => {
    // Memutus layanan pelanggan secara otomatis harus dinyalakan sadar.
    const dunning = TASKS.find((t) => t.code === "billing.dunning");
    assert.ok(dunning, "tugas dunning harus terdaftar");
    assert.equal(dunning!.enabledByDefault, false);
  });

  test("penerbitan tagihan TIDAK dijadwalkan sama sekali", () => {
    // Posting tagihan bagi ribuan pelanggan tetap keputusan manusia.
    assert.equal(
      TASKS.some((t) => t.code.includes("invoice")),
      false
    );
  });
});
