import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isRecoverable,
  recoveryExclusionReason,
  RECOVERY_TERMINAL_STATUSES,
  notReturnedBlocker,
  canDeclareNotReturned,
  isOverdue,
  slaPhase,
  coordinateRejection,
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

describe("slaPhase — H-1 vs sudah terlewat", () => {
  const due = new Date("2026-08-11T12:00:00Z");
  const dri = { status: "ASSIGNED", slaDueAt: due };

  test("jauh sebelum batas → aman", () => {
    assert.equal(slaPhase(dri, new Date("2026-08-09T12:00:00Z")), "OK");
  });

  test("tepat 24 jam sebelum batas → sudah masuk peringatan", () => {
    assert.equal(slaPhase(dri, new Date("2026-08-10T12:00:00Z")), "DUE_SOON");
  });

  test("sedetik sebelum ambang peringatan → masih aman", () => {
    assert.equal(slaPhase(dri, new Date("2026-08-10T11:59:59Z")), "OK");
  });

  test("sudah lewat batas → BREACHED, bukan DUE_SOON", () => {
    assert.equal(slaPhase(dri, new Date("2026-08-11T12:00:01Z")), "BREACHED");
  });

  test("tepat pada batas → BREACHED", () => {
    // Tidak boleh ada titik waktu yang tidak masuk fase mana pun.
    assert.equal(slaPhase(dri, due), "BREACHED");
  });

  test("yang sudah selesai tidak pernah berbunyi", () => {
    for (const status of ["COMPLETED", "CLOSED_UNRECOVERED"]) {
      assert.equal(slaPhase({ status, slaDueAt: due }, new Date("2026-08-20T00:00:00Z")), "OK", status);
    }
  });

  test("tanpa batas SLA → aman, bukan dianggap terlambat", () => {
    assert.equal(slaPhase({ status: "ASSIGNED", slaDueAt: null }, due), "OK");
  });

  test("ambang peringatan bisa disetel", () => {
    assert.equal(slaPhase(dri, new Date("2026-08-09T13:00:00Z"), 48), "DUE_SOON");
    assert.equal(slaPhase(dri, new Date("2026-08-09T13:00:00Z"), 12), "OK");
  });

  test("isOverdue tetap sejalan dengan slaPhase", () => {
    for (const at of ["2026-08-09T12:00:00Z", "2026-08-10T18:00:00Z", "2026-08-12T00:00:00Z"]) {
      const now = new Date(at);
      assert.equal(isOverdue(dri, now), slaPhase(dri, now) === "BREACHED", at);
    }
  });
});

describe("coordinateRejection", () => {
  test("koordinat wajar diterima", () => {
    assert.equal(coordinateRejection({ latitude: -8.65, longitude: 115.21 }), null);
  });

  test("tanpa koordinat bukan kesalahan — GPS boleh tidak tersedia", () => {
    assert.equal(coordinateRejection({}), null);
    assert.equal(coordinateRejection({ latitude: undefined, longitude: undefined }), null);
  });

  test("di luar rentang ditolak", () => {
    assert.match(String(coordinateRejection({ latitude: 91, longitude: 0 })), /Lintang/);
    assert.match(String(coordinateRejection({ latitude: 0, longitude: 181 })), /Bujur/);
  });

  test("batas rentang masih diterima", () => {
    assert.equal(coordinateRejection({ latitude: 90, longitude: 180 }), null);
    assert.equal(coordinateRejection({ latitude: -90, longitude: -180 }), null);
  });

  test("titik nol ditolak — itu GPS gagal mengunci, bukan lokasi", () => {
    assert.match(String(coordinateRejection({ latitude: 0, longitude: 0 })), /gagal mengunci/i);
  });

  test("NaN ditolak", () => {
    assert.match(String(coordinateRejection({ latitude: NaN, longitude: 0 })), /angka/i);
  });
});
