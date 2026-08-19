import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  isOutwardBlocked,
  outwardBlocked,
  outwardBlockedMessage,
  outwardMode,
} from "@/lib/outward-guard";
import { runOutboundQueue } from "@/lib/channels";
import { runQueuedJobs } from "@/lib/dunning";
import { postInvoiceRun } from "@/lib/billing";

const asli = process.env.OUTWARD_ACTIONS;
beforeEach(() => { delete process.env.OUTWARD_ACTIONS; });
afterEach(() => {
  if (asli === undefined) delete process.env.OUTWARD_ACTIONS;
  else process.env.OUTWARD_ACTIONS = asli;
});

describe("outwardMode — bawaannya memblokir", () => {
  test("tidak diisi → BLOCKED", () => {
    assert.equal(outwardMode(), "BLOCKED");
    assert.equal(isOutwardBlocked(), true);
  });

  test("ALLOWED (juga huruf kecil & berspasi) → ALLOWED", () => {
    for (const nilai of ["ALLOWED", "allowed", "  ALLOWED  "]) {
      process.env.OUTWARD_ACTIONS = nilai;
      assert.equal(outwardMode(), "ALLOWED", `nilai: ${nilai}`);
    }
  });

  // Nilai yang NIATNYA membuka tapi salah tulis harus jatuh ke sisi yang aman,
  // bukan ke sisi yang menerbitkan tagihan senilai ratusan juta.
  test("salah ketik & nilai tak dikenal → BLOCKED", () => {
    for (const nilai of ["ALOWED", "true", "yes", "1", ""]) {
      process.env.OUTWARD_ACTIONS = nilai;
      assert.equal(outwardMode(), "BLOCKED", `nilai: ${nilai}`);
    }
  });

  test("pesannya menyebut aksi & alasannya, bukan sekadar ditolak", () => {
    const pesan = outwardBlockedMessage("billing.post-invoice");
    assert.match(pesan, /Menerbitkan tagihan/);
    assert.match(pesan, /ALUS/);
    assert.equal(outwardBlocked("channels.send").ok, false);
  });
});

// Ketiganya menolak SEBELUM menyentuh database — itulah sebabnya tes ini bisa
// murni. Kalau suatu saat penjaganya digeser ke bawah query, tes ini akan
// menggantung/gagal, dan itu memang peringatannya.
describe("jalur manual ikut terjaga", () => {
  test("runOutboundQueue menolak", async () => {
    const hasil = await runOutboundQueue(null);
    assert.equal(hasil.ok, false);
    if (!hasil.ok) assert.match(hasil.error, /mode baca-saja/);
  });

  test("runQueuedJobs menolak", async () => {
    const hasil = await runQueuedJobs(null);
    assert.equal(hasil.ok, false);
    if (!hasil.ok) assert.match(hasil.error, /mode baca-saja/);
  });

  test("postInvoiceRun menolak", async () => {
    const hasil = await postInvoiceRun(
      { id: "u-1" } as never,
      "run-tidak-penting",
    );
    assert.equal(hasil.ok, false);
    if (!hasil.ok) assert.match(hasil.error, /mode baca-saja/);
  });

  test("dengan ALLOWED, penjaga tidak lagi yang menolak", async () => {
    process.env.OUTWARD_ACTIONS = "ALLOWED";
    const hasil = await postInvoiceRun(
      { id: "u-1" } as never,
      "run-tidak-ada",
    );
    // Lolos penjaga, lalu ditolak alasan domain (run tidak ditemukan) —
    // membuktikan penjaganya benar-benar yang menahan pada kasus di atas.
    assert.equal(hasil.ok, false);
    if (!hasil.ok) assert.doesNotMatch(hasil.error, /mode baca-saja/);
  });
});
