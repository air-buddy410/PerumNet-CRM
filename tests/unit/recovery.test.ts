import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isRecoverable,
  recoveryExclusionReason,
  RECOVERY_TERMINAL_STATUSES,
  notReturnedBlocker,
  canDeclareNotReturned,
  isOverdue,
} from "@/lib/recovery";

describe("isRecoverable", () => {
  test("perangkat PERUMNET yang terpasang boleh ditarik", () => {
    assert.equal(isRecoverable({ ownership: "COMPANY", status: "INSTALLED" }), true);
  });

  test("perangkat milik pelanggan TIDAK boleh ditarik", () => {
    assert.equal(isRecoverable({ ownership: "CUSTOMER", status: "INSTALLED" }), false);
  });

  test("kepemilikan tak dikenal ditolak — bukan dianggap milik perusahaan", () => {
    // Fail-closed: nilai asing tidak boleh lolos jadi "boleh ditarik".
    assert.equal(isRecoverable({ ownership: "", status: "INSTALLED" }), false);
    assert.equal(isRecoverable({ ownership: "company", status: "INSTALLED" }), false);
  });

  test("perangkat hilang / dimusnahkan tidak bisa ditarik", () => {
    for (const status of RECOVERY_TERMINAL_STATUSES) {
      assert.equal(
        isRecoverable({ ownership: "COMPANY", status }),
        false,
        `status ${status} seharusnya tidak bisa ditarik`
      );
    }
  });

  test("status non-final lain tetap bisa ditarik", () => {
    for (const status of ["IN_CUSTODY", "AVAILABLE", "UNDER_INSPECTION", "DAMAGED"]) {
      assert.equal(
        isRecoverable({ ownership: "COMPANY", status }),
        true,
        `status ${status} seharusnya masih bisa ditarik`
      );
    }
  });
});

describe("recoveryExclusionReason", () => {
  test("perangkat yang layak tidak punya alasan pengecualian", () => {
    assert.equal(recoveryExclusionReason({ ownership: "COMPANY", status: "INSTALLED" }), null);
  });

  test("milik pelanggan menyebut PRD sebagai dasar", () => {
    const reason = recoveryExclusionReason({ ownership: "CUSTOMER", status: "INSTALLED" });
    assert.match(String(reason), /pelanggan/i);
  });

  test("kepemilikan asing meminta koreksi lebih dulu", () => {
    const reason = recoveryExclusionReason({ ownership: "LEASED", status: "INSTALLED" });
    assert.match(String(reason), /koreksi/i);
  });

  test("setiap status final punya alasan sendiri", () => {
    assert.match(String(recoveryExclusionReason({ ownership: "COMPANY", status: "LOST" })), /hilang/i);
    assert.match(
      String(recoveryExclusionReason({ ownership: "COMPANY", status: "SCRAPPED" })),
      /musnah/i
    );
  });

  test("alasan dan kelayakan selalu konsisten", () => {
    const cases = [
      { ownership: "COMPANY", status: "INSTALLED" },
      { ownership: "CUSTOMER", status: "INSTALLED" },
      { ownership: "COMPANY", status: "LOST" },
      { ownership: "COMPANY", status: "SCRAPPED" },
      { ownership: "LEASED", status: "AVAILABLE" },
    ];
    for (const c of cases) {
      assert.equal(
        isRecoverable(c) === (recoveryExclusionReason(c) === null),
        true,
        `tidak konsisten untuk ${JSON.stringify(c)}`
      );
    }
  });
});

describe("notReturnedBlocker — syarat vonis tidak kembali", () => {
  const base = { slaDueAt: new Date("2026-08-01T00:00:00Z"), attempts: 3, minAttempts: 3 };
  const now = new Date("2026-08-11T00:00:00Z");

  test("SLA terlewat + percobaan cukup → boleh", () => {
    assert.equal(notReturnedBlocker({ ...base, now }), null);
    assert.equal(canDeclareNotReturned({ ...base, now }), true);
  });

  test("tanpa batas SLA → ditolak, bukan dianggap lewat", () => {
    const reason = notReturnedBlocker({ ...base, slaDueAt: null, now });
    assert.match(String(reason), /tidak memiliki batas SLA/i);
  });

  test("SLA belum lewat → ditolak meski percobaan banyak", () => {
    const reason = notReturnedBlocker({
      ...base,
      slaDueAt: new Date("2026-09-01T00:00:00Z"),
      attempts: 99,
      now,
    });
    assert.match(String(reason), /belum terlewat/i);
  });

  test("percobaan kurang → ditolak meski SLA sudah lewat", () => {
    const reason = notReturnedBlocker({ ...base, attempts: 2, now });
    assert.match(String(reason), /minimal 3/i);
  });

  test("tepat pada batas SLA sudah dianggap terlewat", () => {
    // Batas yang sama persis dengan waktu sekarang TIDAK boleh menggantung:
    // kalau tidak, ada satu titik waktu yang tak masuk kedua sisi aturan.
    assert.equal(notReturnedBlocker({ ...base, slaDueAt: now, now }), null);
  });

  test("kedua syarat kurang → keluhan tentang SLA lebih dulu", () => {
    const reason = notReturnedBlocker({
      ...base,
      slaDueAt: new Date("2026-09-01T00:00:00Z"),
      attempts: 0,
      now,
    });
    assert.match(String(reason), /belum terlewat/i);
  });
});

describe("isOverdue", () => {
  const now = new Date("2026-08-11T00:00:00Z");
  const past = new Date("2026-08-01T00:00:00Z");
  const future = new Date("2026-08-20T00:00:00Z");

  test("berjalan dan lewat batas → terlambat", () => {
    assert.equal(isOverdue({ status: "ASSIGNED", slaDueAt: past }, now), true);
  });

  test("belum lewat batas → tidak terlambat", () => {
    assert.equal(isOverdue({ status: "ASSIGNED", slaDueAt: future }, now), false);
  });

  test("tanpa batas SLA → tidak pernah terlambat", () => {
    assert.equal(isOverdue({ status: "ASSIGNED", slaDueAt: null }, now), false);
  });

  test("yang sudah selesai tidak dihitung terlambat", () => {
    // Kalau ini salah, daftar eskalasi akan terus menampilkan kasus yang
    // sudah tuntas dan petugas berhenti mempercayainya.
    for (const status of ["COMPLETED", "CLOSED_UNRECOVERED"]) {
      assert.equal(isOverdue({ status, slaDueAt: past }, now), false, status);
    }
  });
});
