import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isContracted,
  contractRejection,
  contractRemainingDays,
  contractPhase,
  contractWarningThreshold,
  freezeBlocker,
  shouldFreeze,
  addMonths,
  archiveDueAt,
  isArchiveDue,
  accountState,
  FREEZE_GRACE_MONTHS,
  CONTRACT_WARNING_DAYS,
} from "@/lib/employment";

const d = (s: string) => new Date(s);

describe("contractRejection — jenis kontrak wajib punya tanggal berakhir", () => {
  test("kontrak tanpa tanggal berakhir ditolak", () => {
    assert.equal(
      contractRejection({ employeeType: "CONTRACT", contractStartAt: null, contractEndAt: null }),
      "Kontrak wajib memiliki tanggal berakhir."
    );
  });

  test("kontrak dengan tanggal berakhir diterima", () => {
    assert.equal(
      contractRejection({
        employeeType: "CONTRACT",
        contractStartAt: d("2026-01-01"),
        contractEndAt: d("2026-12-31"),
      }),
      null
    );
  });

  test("tanggal mulai boleh kosong — kontrak pertama memakai tanggal bergabung", () => {
    assert.equal(
      contractRejection({
        employeeType: "CONTRACT",
        contractStartAt: null,
        contractEndAt: d("2026-12-31"),
      }),
      null
    );
  });

  test("berakhir sebelum mulai ditolak", () => {
    const err = contractRejection({
      employeeType: "CONTRACT",
      contractStartAt: d("2026-12-31"),
      contractEndAt: d("2026-01-01"),
    });
    assert.match(err ?? "", /harus setelah tanggal mulai/);
  });

  test("berakhir SAMA DENGAN mulai ditolak — kontrak nol hari bukan kontrak", () => {
    const err = contractRejection({
      employeeType: "CONTRACT",
      contractStartAt: d("2026-01-01"),
      contractEndAt: d("2026-01-01"),
    });
    assert.match(err ?? "", /harus setelah tanggal mulai/);
  });
});

describe("contractRejection — bukan kontrak harus kosong", () => {
  // Ini bukan soal kerapian. Penyapu Fase 42 membekukan akun berdasarkan
  // contractEndAt; satu tanggal tertinggal pada karyawan tetap akan
  // membekukan akun orang yang masih bekerja.
  for (const type of ["FULL_TIME", "PART_TIME", "PROBATION"]) {
    test(`${type} dengan tanggal berakhir ditolak`, () => {
      const err = contractRejection({
        employeeType: type,
        contractStartAt: null,
        contractEndAt: d("2026-12-31"),
      });
      assert.match(err ?? "", /hanya berlaku untuk jenis Kontrak/);
    });
  }

  test("karyawan tetap tanpa tanggal apa pun diterima", () => {
    assert.equal(
      contractRejection({ employeeType: "FULL_TIME", contractStartAt: null, contractEndAt: null }),
      null
    );
  });

  test("jenis tak dikenal diperlakukan seperti bukan kontrak", () => {
    // Fail-closed: nilai asing tidak boleh diam-diam mendapat masa kontrak.
    assert.equal(isContracted("MAGANG"), false);
    const err = contractRejection({
      employeeType: "MAGANG",
      contractStartAt: null,
      contractEndAt: d("2026-12-31"),
    });
    assert.notEqual(err, null);
  });
});

describe("contractPhase", () => {
  const now = d("2026-08-12T00:00:00Z");

  test("karyawan tetap berfase NONE, bukan OK", () => {
    // Dibedakan supaya UI menyembunyikan bloknya, bukan menampilkan "aman"
    // pada orang yang tidak punya kontrak untuk diamankan.
    assert.equal(contractPhase({ employeeType: "FULL_TIME", contractEndAt: null }, now), "NONE");
  });

  test("kontrak masih jauh berfase OK", () => {
    assert.equal(
      contractPhase({ employeeType: "CONTRACT", contractEndAt: d("2027-01-01") }, now),
      "OK"
    );
  });

  test("kontrak dalam 30 hari berfase DUE_SOON", () => {
    assert.equal(
      contractPhase({ employeeType: "CONTRACT", contractEndAt: d("2026-09-01") }, now),
      "DUE_SOON"
    );
  });

  test("kontrak yang sudah lewat berfase ENDED", () => {
    assert.equal(
      contractPhase({ employeeType: "CONTRACT", contractEndAt: d("2026-08-01") }, now),
      "ENDED"
    );
  });

  test("tepat hari berakhir sudah dihitung ENDED", () => {
    assert.equal(
      contractPhase({ employeeType: "CONTRACT", contractEndAt: now }, now),
      "ENDED"
    );
  });
});

describe("contractWarningThreshold — hanya berbunyi tepat di ambangnya", () => {
  const end = d("2026-09-11T00:00:00Z");

  test("H-30 memicu dan mengembalikan angkanya", () => {
    const now = d("2026-08-12T00:00:00Z");
    assert.equal(contractRemainingDays(end, now), 30);
    assert.equal(contractWarningThreshold({ employeeType: "CONTRACT", contractEndAt: end }, now), 30);
  });

  test("H-7 memicu", () => {
    const now = d("2026-09-04T00:00:00Z");
    assert.equal(contractWarningThreshold({ employeeType: "CONTRACT", contractEndAt: end }, now), 7);
  });

  test("H-29 TIDAK memicu — supaya peringatan tidak diulang sebulan penuh", () => {
    const now = d("2026-08-13T00:00:00Z");
    assert.equal(contractWarningThreshold({ employeeType: "CONTRACT", contractEndAt: end }, now), null);
  });

  test("yang sudah lewat tidak memicu peringatan lagi", () => {
    const now = d("2026-10-01T00:00:00Z");
    assert.equal(contractWarningThreshold({ employeeType: "CONTRACT", contractEndAt: end }, now), null);
  });

  test("ambang yang dipakai memang 30 dan 7", () => {
    assert.deepEqual([...CONTRACT_WARNING_DAYS], [30, 7]);
  });
});

describe("freezeBlocker — kenapa sebuah akun tidak dibekukan", () => {
  const now = d("2026-08-12T00:00:00Z");
  const expired = {
    employeeType: "CONTRACT",
    contractEndAt: d("2026-08-01"),
    employeeActive: true,
    userId: "u1",
    userFrozenAt: null,
  };

  test("kontrak habis + akun ada + belum beku → dibekukan", () => {
    assert.equal(freezeBlocker(expired, now), null);
    assert.equal(shouldFreeze(expired, now), true);
  });

  test("kontrak belum berakhir tidak dibekukan", () => {
    const b = freezeBlocker({ ...expired, contractEndAt: d("2027-01-01") }, now);
    assert.equal(b, "Kontrak belum berakhir.");
  });

  test("karyawan tetap tidak pernah dibekukan otomatis", () => {
    const b = freezeBlocker({ ...expired, employeeType: "FULL_TIME" }, now);
    assert.equal(b, "Bukan karyawan kontrak.");
  });

  test("tanpa akun sistem tidak ada yang bisa dibekukan", () => {
    assert.equal(freezeBlocker({ ...expired, userId: null }, now), "Tidak memiliki akun sistem.");
  });

  test("yang sudah beku tidak dibekukan dua kali", () => {
    // Penting: pembekuan ulang akan menaikkan sessionEpoch setiap hari dan
    // menimpa alasan pembekuan yang mungkin diisi manusia.
    const b = freezeBlocker({ ...expired, userFrozenAt: d("2026-08-05") }, now);
    assert.equal(b, "Akun sudah beku.");
  });

  test("karyawan yang sudah dinonaktifkan manual dilewati", () => {
    assert.equal(
      freezeBlocker({ ...expired, employeeActive: false }, now),
      "Karyawan sudah dinonaktifkan manual."
    );
  });
});

describe("addMonths — akhir bulan tidak meluber", () => {
  test("31 Januari + 1 bulan = 28 Februari (tahun biasa)", () => {
    assert.equal(addMonths(d("2026-01-31T00:00:00Z"), 1).getMonth(), 1); // Februari
  });

  test("31 Januari + 1 bulan tidak jatuh ke Maret", () => {
    const r = addMonths(d("2026-01-31T00:00:00Z"), 1);
    assert.notEqual(r.getMonth(), 2);
  });

  test("30 November + 3 bulan = Februari", () => {
    assert.equal(addMonths(d("2025-11-30T00:00:00Z"), 3).getMonth(), 1);
  });
});

describe("archiveDueAt / isArchiveDue — masa tenggang 3 bulan", () => {
  test("masa tenggangnya memang 3 bulan", () => {
    assert.equal(FREEZE_GRACE_MONTHS, 3);
  });

  test("beku 1 Juni jatuh tempo arsip 1 September", () => {
    const due = archiveDueAt(d("2026-06-01T00:00:00Z"));
    assert.equal(due.getMonth(), 8); // September
  });

  test("belum 3 bulan belum diarsipkan", () => {
    assert.equal(isArchiveDue(d("2026-06-01T00:00:00Z"), d("2026-08-12T00:00:00Z")), false);
  });

  test("lewat 3 bulan sudah jatuh tempo", () => {
    assert.equal(isArchiveDue(d("2026-05-01T00:00:00Z"), d("2026-08-12T00:00:00Z")), true);
  });

  test("akun yang tidak beku tidak pernah jatuh tempo arsip", () => {
    assert.equal(isArchiveDue(null, d("2030-01-01T00:00:00Z")), false);
  });
});

describe("accountState — beku dan diarsipkan dibedakan", () => {
  test("aktif", () => {
    assert.equal(accountState({ isActive: true, frozenAt: null }), "ACTIVE");
  });

  test("beku", () => {
    assert.equal(accountState({ isActive: true, frozenAt: new Date() }), "FROZEN");
  });

  test("diarsipkan", () => {
    // Beku itu sementara dan dibalik satu tombol; diarsipkan sudah keluar
    // dari peredaran dan pemulihannya lewat halaman arsip.
    assert.equal(accountState({ isActive: false, frozenAt: new Date() }), "ARCHIVED");
  });
});
