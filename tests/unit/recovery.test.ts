import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isRecoverable,
  recoveryExclusionReason,
  RECOVERY_TERMINAL_STATUSES,
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
