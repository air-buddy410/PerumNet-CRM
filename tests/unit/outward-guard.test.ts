import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  isOutwardBlocked,
  outwardBlocked,
  outwardBlockedMessage,
  outwardMode,
} from "@/lib/outward-guard";
import { runOutboundQueue } from "@/lib/channels";
import { runQueuedJobs, suspendSubscription, restoreSubscription } from "@/lib/dunning";
import { postInvoiceRun } from "@/lib/billing";
import { applyDueTerminations } from "@/lib/termination";
import { sweepEmploymentLifecycle } from "@/lib/employment-lifecycle";

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

// ── Tiga jalur susulan (Fase 94b) ───────────────────────────────
//
// Sama seperti di atas, keempat fungsi ini menolak SEBELUM query pertama.
// Itu yang membuat tesnya bisa berjalan tanpa database sama sekali — dan
// kalau kelak penjaganya digeser ke bawah query, tes ini yang pertama
// memberi tahu.

describe("isolir & pemulihan langganan", () => {
  test("suspendSubscription menolak — termasuk lewat tombol manual", async () => {
    const hasil = await suspendSubscription(null, {
      subscriptionId: "sub-tidak-penting",
      reason: "OVERDUE",
      triggeredBy: "USER",
      note: "catatan cukup panjang",
    });
    assert.equal(hasil.ok, false);
    if (!hasil.ok) assert.match(hasil.error, /mode baca-saja/);
  });

  test("restoreSubscription juga ditolak, meski arahnya memulihkan", async () => {
    const hasil = await restoreSubscription(null, "suspensi-tidak-penting");
    assert.equal(hasil.ok, false);
    if (!hasil.ok) assert.match(hasil.error, /mode baca-saja/);
  });

  // Membuktikan penjaganya yang menahan, bukan kebetulan alasan lain.
  // Alasan isolir divalidasi SEBELUM query pertama, jadi kasus ini pun
  // tidak menyentuh database.
  test("dengan ALLOWED, yang menolak adalah alasan domain", async () => {
    process.env.OUTWARD_ACTIONS = "ALLOWED";
    const hasil = await suspendSubscription(null, {
      subscriptionId: "sub-tidak-penting",
      reason: "ALASAN-NGAWUR",
      triggeredBy: "SYSTEM",
    });
    assert.equal(hasil.ok, false);
    if (!hasil.ok) {
      assert.doesNotMatch(hasil.error, /mode baca-saja/);
      assert.match(hasil.error, /Alasan isolir tidak dikenal/);
    }
  });
});

describe("terminasi jatuh tempo", () => {
  test("applyDueTerminations menolak", async () => {
    const hasil = await applyDueTerminations();
    assert.equal(hasil.applied, 0);
    assert.match(hasil.summary, /mode baca-saja/);
  });

  // Ini bukan sekadar kelengkapan. Pemanggilnya di scheduler menjalankan
  // assertNotTotalFailure(applied, attempted, summary): attempted > 0 dengan
  // applied = 0 berarti GAGAL TOTAL, dan tugasnya jadi merah tiap jam.
  // Penjaga yang bekerja dengan benar tidak boleh terlihat seperti kerusakan.
  test("attempted HARUS 0 — kalau tidak, penjaganya tampil sebagai tugas gagal", async () => {
    const hasil = await applyDueTerminations();
    assert.equal(hasil.attempted, 0);
  });
});

describe("daur hidup akun pegawai", () => {
  test("sweepEmploymentLifecycle menolak, seluruh hitungannya nol", async () => {
    const hasil = await sweepEmploymentLifecycle();
    assert.equal(hasil.frozen, 0);
    assert.equal(hasil.archived, 0);
    assert.equal(hasil.warned, 0);
    assert.equal(hasil.attemptedFreeze, 0);
    assert.match(hasil.summary, /mode baca-saja/);
  });
});

describe("label aksi baru", () => {
  test("keduanya punya label yang menyebut apa yang ditahan", () => {
    assert.match(outwardBlockedMessage("subscription.terminate"), /terminasi/i);
    assert.match(
      outwardBlockedMessage("hrd.account-lifecycle"),
      /akun pegawai/i,
    );
  });
});
