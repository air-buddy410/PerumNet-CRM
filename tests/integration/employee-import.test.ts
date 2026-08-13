import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { db, actor, makeUser, tag, ensureMasterData, resetTransactionalData } from "./fixtures";
import { xlsxFile } from "./_xlsx-write";
import { previewEmployeeImport, applyEmployeeImport } from "@/lib/employee-import-service";
import { PERMISSIONS } from "@/lib/constants";

// Seluruh berkas ini menempuh jalur yang SAMA dengan HRD: berkas xlsx nyata →
// zip → XML → tabel → basis data. Tidak ada jalan pintas yang menyuntikkan
// baris langsung ke pengurai.

const HEADER = [
  "NIK", "Nama Lengkap *", "Jabatan", "Jenjang Jabatan *", "Status Kepegawaian *",
  "Pola Kerja *", "Tanggal Bergabung *", "Kontrak Mulai", "Kontrak Berakhir",
  "Alamat", "NIK Atasan", "Email Akun CRM", "Aktif *",
];

interface R {
  nik?: string; nama: string; jabatan?: string; jenjang?: string; status?: string;
  pola?: string; gabung?: string; kMulai?: string; kAkhir?: string; alamat?: string;
  atasan?: string; email?: string; aktif?: string;
}

function baris(r: R): string[] {
  return [
    r.nik ?? "", r.nama, r.jabatan ?? "", r.jenjang ?? "Staff", r.status ?? "Karyawan Tetap",
    r.pola ?? "Non-Shift", r.gabung ?? "2026-01-06", r.kMulai ?? "", r.kAkhir ?? "",
    r.alamat ?? "", r.atasan ?? "", r.email ?? "", r.aktif ?? "Ya",
  ];
}

function berkas(...rows: R[]): File {
  return xlsxFile([["Data Pegawai PerumNet"], ["petunjuk"], HEADER, ...rows.map(baris)]);
}

let HRD: ReturnType<typeof actor>;
let BUKAN_HRD: ReturnType<typeof actor>;

describe("impor pegawai dari Excel", () => {
  before(async () => {
    await resetTransactionalData();
    await ensureMasterData();
    HRD = actor((await makeUser(tag("hrd").toLowerCase(), "HRD")).id, "hrd");
    const orang = await makeUser(tag("gudang").toLowerCase(), "GUDANG");
    BUKAN_HRD = actor(orang.id, "gudang");
    BUKAN_HRD.permissions = new Set([PERMISSIONS.INVENTORY_VIEW]);
  });
  after(async () => {
    await resetTransactionalData();
    await db.$disconnect();
  });

  test("izin: yang bukan HRD tidak bisa mengimpor sama sekali", async () => {
    const f = berkas({ nama: "Siapa Saja" });
    const p = await previewEmployeeImport(BUKAN_HRD, f);
    assert.equal(p.ok, false);
    const a = await applyEmployeeImport(BUKAN_HRD, f);
    assert.equal(a.ok, false);
    assert.equal(await db.employee.count({ where: { fullName: "Siapa Saja" } }), 0);
  });

  test("pratinjau TIDAK menulis apa pun", async () => {
    const p = await previewEmployeeImport(HRD, berkas({ nama: "Belum Jadi" }));
    assert.equal(p.ok, true);
    assert.equal(p.ok && p.data.willCreate, 1);
    assert.equal(await db.employee.count({ where: { fullName: "Belum Jadi" } }), 0, "pratinjau harus bersih");
  });

  test("penerapan menyimpan seluruh baris dan menerbitkan NIK", async () => {
    const r = await applyEmployeeImport(
      HRD,
      berkas(
        { nama: "Kadek Satu", jabatan: "Teknisi", pola: "Shift", alamat: "Jl. A 1" },
        { nama: "Kadek Dua", jenjang: "Leader", status: "Kontrak", kMulai: "2026-01-06", kAkhir: "2026-12-31" }
      )
    );
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    assert.equal(r.ok && r.data.created.length, 2);

    const satu = await db.employee.findFirst({ where: { fullName: "Kadek Satu" } });
    assert.match(satu!.employeeNo, /^1\d{7}$/, "NIK diterbitkan sistem");
    assert.equal(satu!.workPattern, "SHIFT");
    assert.equal(satu!.jobTitle, "Teknisi");
    assert.equal(satu!.address, "Jl. A 1");
    assert.equal(satu!.isActive, true);

    const dua = await db.employee.findFirst({ where: { fullName: "Kadek Dua" } });
    assert.equal(dua!.jobLevel, "LEADER");
    assert.equal(dua!.employeeType, "CONTRACT");
    assert.equal(dua!.contractEndAt?.toISOString().slice(0, 10), "2026-12-31");
  });

  test("MENJALANKAN ULANG berkas yang sama tidak menggandakan siapa pun", async () => {
    // Baris tanpa NIK selalu mendapat nomor baru, jadi tanpa penjaga ini tidak
    // ada yang menabrak dan tidak ada yang mengeluh — cukup jadi dua orang.
    const f = () => berkas({ nama: "Kadek Satu", jabatan: "Teknisi", pola: "Shift", alamat: "Jl. A 1" });
    const p = await previewEmployeeImport(HRD, f());
    assert.equal(p.ok && p.data.willCreate, 0);
    assert.equal(p.ok && p.data.willSkip, 1);
    assert.match(p.ok ? p.data.rows[0].reason! : "", /sudah terdaftar/i);

    await applyEmployeeImport(HRD, f());
    assert.equal(await db.employee.count({ where: { fullName: "Kadek Satu" } }), 1);
  });

  test("NIK yang sudah terdaftar dilewati, bukan menimpa", async () => {
    const ada = await db.employee.findFirst({ where: { fullName: "Kadek Dua" } });
    const p = await previewEmployeeImport(HRD, berkas({ nik: ada!.employeeNo, nama: "Nama Yang Beda" }));
    assert.equal(p.ok, true);
    assert.equal(p.ok && p.data.rows[0].action, "SKIP");
    assert.match(p.ok ? p.data.rows[0].reason! : "", /Kadek Dua/);

    await applyEmployeeImport(HRD, berkas({ nik: ada!.employeeNo, nama: "Nama Yang Beda" }));
    const setelah = await db.employee.findUnique({ where: { id: ada!.id } });
    assert.equal(setelah!.fullName, "Kadek Dua", "data lama tidak boleh tertimpa");
  });

  test("SATU baris bermasalah menahan SELURUH berkas", async () => {
    // Impor separuh jauh lebih sulit dibereskan daripada impor yang ditolak.
    const r = await applyEmployeeImport(
      HRD,
      berkas(
        { nama: "Sah Satu" },
        { nama: "Sah Dua" },
        { nama: "Rusak", status: "Kontark" }
      )
    );
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, /tidak ada data yang disimpan/i);
    assert.equal(await db.employee.count({ where: { fullName: { in: ["Sah Satu", "Sah Dua"] } } }), 0);
  });

  test("atasan ditaut lewat NAMA di berkas yang sama", async () => {
    // Pada impor pertama belum ada satu pun NIK, jadi ini satu-satunya cara
    // hierarki bisa terbentuk sekaligus.
    const r = await applyEmployeeImport(
      HRD,
      berkas(
        { nama: "Anak Buah", atasan: "Bos Besar" },
        { nama: "Bos Besar", jenjang: "Leader" }
      )
    );
    assert.equal(r.ok, true, r.ok ? "" : r.error);

    const anak = await db.employee.findFirst({
      where: { fullName: "Anak Buah" },
      select: { supervisor: { select: { fullName: true } } },
    });
    assert.equal(anak!.supervisor?.fullName, "Bos Besar");
  });

  test("atasan ditaut ke pegawai yang SUDAH ada lewat NIK", async () => {
    const bos = await db.employee.findFirst({ where: { fullName: "Bos Besar" } });
    const r = await applyEmployeeImport(HRD, berkas({ nama: "Anak Baru", atasan: bos!.employeeNo }));
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    const anak = await db.employee.findFirst({ where: { fullName: "Anak Baru" } });
    assert.equal(anak!.supervisorId, bos!.id);
  });

  test("ATASAN YANG TIDAK ADA ditolak, bukan dibiarkan kosong diam-diam", async () => {
    // Membiarkannya kosong berarti tidak ada yang tahu sampai persetujuan
    // cuti pertama tidak tahu harus ke mana.
    const p = await previewEmployeeImport(HRD, berkas({ nama: "Yatim", atasan: "10099999" }));
    assert.equal(p.ok && p.data.ok, false);
    assert.match(p.ok ? p.data.issues[0].message : "", /tidak ditemukan/);
    const a = await applyEmployeeImport(HRD, berkas({ nama: "Yatim", atasan: "10099999" }));
    assert.equal(a.ok, false);
    assert.equal(await db.employee.count({ where: { fullName: "Yatim" } }), 0);
  });

  test("email menautkan pegawai ke akun CRM yang ada", async () => {
    const akun = await makeUser(tag("pegawai").toLowerCase(), "HRD");
    const r = await applyEmployeeImport(HRD, berkas({ nama: "Punya Akun", email: akun.email.toUpperCase() }));
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    const emp = await db.employee.findFirst({ where: { fullName: "Punya Akun" } });
    assert.equal(emp!.userId, akun.id, "pencocokan email tidak boleh peka huruf besar-kecil");
  });

  test("email yang belum punya akun jadi CATATAN, bukan penghalang", async () => {
    const p = await previewEmployeeImport(HRD, berkas({ nama: "Akun Nanti", email: "belum.ada@perumnet.id" }));
    assert.equal(p.ok && p.data.ok, true, "tidak menghalangi");
    assert.match(p.ok ? p.data.rows[0].notes[0] : "", /belum ada/);
  });

  test("akun yang SUDAH tertaut ke pegawai lain ditolak", async () => {
    const emp = await db.employee.findFirst({ where: { fullName: "Punya Akun" }, select: { userId: true } });
    const akun = await db.user.findUnique({ where: { id: emp!.userId! } });
    const p = await previewEmployeeImport(HRD, berkas({ nama: "Orang Lain", email: akun!.email }));
    assert.equal(p.ok && p.data.ok, false);
    assert.match(p.ok ? p.data.issues[0].message : "", /sudah tertaut/);
  });

  test("SEL KOSONG tidak menggeser kolom — lewat berkas zip sungguhan", async () => {
    // Excel menghilangkan sel kosong dari XML. Baris di bawah punya lubang di
    // NIK, Jabatan, dan Alamat sekaligus.
    const r = await applyEmployeeImport(HRD, berkas({ nama: "Banyak Lubang", jenjang: "Leader", pola: "Shift" }));
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    const emp = await db.employee.findFirst({ where: { fullName: "Banyak Lubang" } });
    assert.equal(emp!.jobLevel, "LEADER");
    assert.equal(emp!.workPattern, "SHIFT");
    assert.equal(emp!.jobTitle, null);
    assert.match(emp!.employeeNo, /^1\d{7}$/);
  });

  test("berkas yang bukan xlsx ditolak dengan pesan yang bisa dipahami", async () => {
    const bukan = new File([new TextEncoder().encode("halo, ini bukan excel")], "data.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const r = await applyEmployeeImport(HRD, bukan);
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, /\.xls lama tidak didukung|bukan \.xlsx/i);
  });

  test("impor tercatat di AuditLog", async () => {
    const log = await db.auditLog.findFirst({
      where: { action: "EMPLOYEE_IMPORT" },
      orderBy: { createdAt: "desc" },
    });
    assert.notEqual(log, null);
    assert.match(log!.description, /Mengimpor \d+ pegawai dari berkas/);
  });
});
