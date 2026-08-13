import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { db, actor, makeUser, tag, ensureMasterData, resetTransactionalData } from "./fixtures";
import { saveEmployee, generateEmployeeNo, EMPLOYEE_NO_BASE } from "@/lib/hrd";

// NIK diterbitkan sistem karena PerumNet belum punya penomoran sendiri.
// Bentuknya DELAPAN ANGKA diawali 1 — 10000001, 10000002, ...
//
// Diawali 1 berarti tidak pernah ada nol di depan, dan itu penting: Excel
// membuang nol di depan, sedangkan kolom "NIK Atasan" pada template HRD
// justru tempat nomor itu diketik ulang.

let HRD: ReturnType<typeof actor>;

describe("penerbitan NIK otomatis", () => {
  before(async () => {
    await resetTransactionalData();
    await ensureMasterData();
    HRD = actor((await makeUser(tag("hrd").toLowerCase(), "HRD")).id, "hrd");
  });
  after(async () => {
    await resetTransactionalData();
    await db.$disconnect();
  });

  test("NIK kosong saat membuat → diterbitkan sistem", async () => {
    const r = await saveEmployee(HRD, {
      employeeNo: "",
      fullName: "Tanpa NIK",
      employeeType: "FULL_TIME",
      joinedAt: new Date("2026-01-06"),
    });
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    const emp = await db.employee.findUnique({ where: { id: (r as { id: string }).id } });
    // Bentuk yang diminta: delapan angka, diawali 1.
    assert.match(emp!.employeeNo, /^1\d{7}$/, "harus 8 angka diawali 1");
    assert.equal(Number(emp!.employeeNo) > EMPLOYEE_NO_BASE, true);
  });

  test("lebarnya tetap 8 angka untuk banyak penerbitan berturut-turut", () => {
    // Selama masih di rentang 10000001-19999999, lebarnya tidak pernah
    // berubah — jadi kolom NIK di laporan dan kartu tidak pernah bergeser.
    for (const n of [1, 2, 999, 100_000, 9_999_999]) {
      const nik = String(EMPLOYEE_NO_BASE + n);
      assert.equal(nik.length, 8, `${nik} harus 8 angka`);
      assert.equal(nik.startsWith("1"), true);
    }
  });

  test("TIDAK ADA NOL DI DEPAN — Excel akan membuangnya", async () => {
    // Kalau NIK "0001", Excel mengubahnya jadi "1" saat HRD mengetiknya di
    // kolom NIK Atasan, lalu impor tidak menemukan orangnya.
    const r = await saveEmployee(HRD, {
      employeeNo: "",
      fullName: "Cek Nol",
      employeeType: "FULL_TIME",
      joinedAt: new Date("2026-01-06"),
    });
    const emp = await db.employee.findUnique({ where: { id: (r as { id: string }).id } });
    assert.equal(emp!.employeeNo.startsWith("0"), false);
    // Bolak-balik lewat Number() harus menghasilkan teks yang sama persis —
    // itulah yang dilakukan Excel pada sel bernilai angka.
    assert.equal(String(Number(emp!.employeeNo)), emp!.employeeNo);
  });

  test("nomor selalu maju, tidak pernah terulang", async () => {
    const a = await generateEmployeeNo();
    const b = await generateEmployeeNo();
    assert.notEqual(a, b);
    assert.equal(Number(b) > Number(a), true);
  });

  test("penerbitan BERSAMAAN tidak pernah menghasilkan nomor kembar", async () => {
    // Dua HRD menyimpan pada detik yang sama. Penomoran memakai satu UPDATE
    // bersyarat, bukan baca-lalu-tulis.
    const hasil = await Promise.all(Array.from({ length: 10 }, () => generateEmployeeNo()));
    assert.equal(new Set(hasil).size, 10, "sepuluh permintaan harus menghasilkan sepuluh nomor berbeda");
  });

  test("NIK yang diketik manusia tetap dihormati", async () => {
    const r = await saveEmployee(HRD, {
      employeeNo: "EMP-LAMA-7",
      fullName: "Punya NIK Sendiri",
      employeeType: "FULL_TIME",
      joinedAt: new Date("2026-01-06"),
    });
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    const emp = await db.employee.findUnique({ where: { id: (r as { id: string }).id } });
    assert.equal(emp!.employeeNo, "EMP-LAMA-7");
  });

  test("nomor yang sudah dipakai manusia DILEWATI, bukan menggagalkan", async () => {
    // Seseorang mengetik nomor yang belum sampai gilirannya. Counter harus
    // maju melewatinya, bukan berhenti dengan galat unique constraint.
    const berikut = String(EMPLOYEE_NO_BASE + 99);
    await db.documentSequence.upsert({
      where: { docType_periodKey: { docType: "EMPLOYEE_NO", periodKey: "ALL" } },
      create: { docType: "EMPLOYEE_NO", periodKey: "ALL", lastNumber: 98 },
      update: { lastNumber: 98 },
    });
    await saveEmployee(HRD, {
      employeeNo: berikut,
      fullName: "Diketik Duluan",
      employeeType: "FULL_TIME",
      joinedAt: new Date("2026-01-06"),
    });
    const next = await generateEmployeeNo();
    assert.notEqual(next, berikut, "nomor yang sudah dipakai harus dilewati");
  });

  test("mengosongkan NIK saat MENGUBAH ditolak", async () => {
    // Nomor yang sudah terbit menempel di dokumen lain; menggantinya diam-diam
    // memutus jejak orang dengan berkasnya sendiri.
    const dibuat = await saveEmployee(HRD, {
      employeeNo: "",
      fullName: "Mau Diubah",
      employeeType: "FULL_TIME",
      joinedAt: new Date("2026-01-06"),
    });
    const r = await saveEmployee(HRD, {
      id: (dibuat as { id: string }).id,
      employeeNo: "",
      fullName: "Sudah Diubah",
      employeeType: "FULL_TIME",
      joinedAt: new Date("2026-01-06"),
    });
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, /tidak boleh dikosongkan saat mengubah/);
  });
});
