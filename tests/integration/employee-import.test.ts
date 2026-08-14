import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { db, actor, makeUser, tag, ensureMasterData, resetTransactionalData } from "./fixtures";
import { xlsxFile } from "./_xlsx-write";
import { previewEmployeeImport, applyEmployeeImport } from "@/lib/employee-import-service";
import { saveEmployee } from "@/lib/hrd";
import { PERMISSIONS } from "@/lib/constants";

// Seluruh berkas ini menempuh jalur yang SAMA dengan HRD: berkas xlsx nyata →
// zip → XML → tabel → basis data. Tidak ada jalan pintas yang menyuntikkan
// baris langsung ke pengurai.

const HEADER = [
  "NIK", "Nama Lengkap *", "Jabatan", "Jenjang Jabatan *", "Status Kepegawaian *",
  "Pola Kerja *", "Tanggal Bergabung *", "Kontrak Mulai", "Kontrak Berakhir",
  "Alamat", "NIK Atasan", "Email Akun CRM", "Aktif *", "Divisi *",
];

interface R {
  nik?: string; nama: string; jabatan?: string; jenjang?: string; status?: string;
  pola?: string; gabung?: string; kMulai?: string; kAkhir?: string; alamat?: string;
  atasan?: string; email?: string; aktif?: string; divisi?: string;
}

function baris(r: R): string[] {
  return [
    r.nik ?? "", r.nama, r.jabatan ?? "", r.jenjang ?? "Staff", r.status ?? "Karyawan Tetap",
    r.pola ?? "Non-Shift", r.gabung ?? "2026-01-06", r.kMulai ?? "", r.kAkhir ?? "",
    r.alamat ?? "", r.atasan ?? "", r.email ?? "", r.aktif ?? "Ya", r.divisi ?? "NOC",
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
    // Divisi dibuat sendiri, tidak menumpang apa pun yang kebetulan tertinggal
    // di database tes dari berkas lain — divisi itu master data dan tidak ikut
    // dibersihkan resetTransactionalData().
    for (const [code, name] of [
      ["NOC", "NOC"],
      ["MKT", "Marketing"],
      ["FIN", "Finance"],
      ["WH", "Warehouse"],
      ["SLS", "Sales"],
    ]) {
      await db.division.upsert({ where: { code }, update: { name }, create: { code, name } });
    }
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

  test("divisi dari berkas tersimpan di data pegawai", async () => {
    const r = await applyEmployeeImport(HRD, berkas({ nama: "Punya Divisi", divisi: "Marketing" }));
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    const emp = await db.employee.findFirst({
      where: { fullName: "Punya Divisi" },
      select: { division: { select: { code: true } } },
    });
    assert.equal(emp!.division?.code, "MKT");
  });

  test("KODE divisi juga diterima, bukan cuma namanya", async () => {
    const r = await applyEmployeeImport(HRD, berkas({ nama: "Pakai Kode", divisi: "FIN" }));
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    const emp = await db.employee.findFirst({
      where: { fullName: "Pakai Kode" },
      select: { division: { select: { code: true } } },
    });
    assert.equal(emp!.division?.code, "FIN");
  });

  test("divisi yang TIDAK ADA di sistem ditolak, bukan dikosongkan", async () => {
    const p = await previewEmployeeImport(HRD, berkas({ nama: "Divisi Ngawur", divisi: "Divisi Rahasia" }));
    assert.equal(p.ok && p.data.ok, false);
    assert.match(p.ok ? p.data.issues[0].message : "", /tidak dikenal/);
    // Pesannya menyebut pilihan yang sah supaya HRD tidak perlu menebak.
    assert.match(p.ok ? p.data.issues[0].message : "", /Marketing/);

    const a = await applyEmployeeImport(HRD, berkas({ nama: "Divisi Ngawur", divisi: "Divisi Rahasia" }));
    assert.equal(a.ok, false);
    assert.equal(await db.employee.count({ where: { fullName: "Divisi Ngawur" } }), 0);
  });

  test("DIVISI AKUN CRM TIDAK IKUT BERUBAH — hanya dilaporkan", async () => {
    // Ini batas yang paling penting di seluruh impor ini. User.divisionId
    // menentukan ke mana persetujuan cuti berjalan dan grup Authentik mana
    // yang diikuti. Mengubahnya sebagai efek samping mengunggah spreadsheet
    // berarti memindahkan kewenangan orang tanpa ada yang memutuskan.
    const div = await db.division.findFirst({ where: { code: "WH" } });
    const akun = await makeUser(tag("beda").toLowerCase(), "HRD");
    await db.user.update({ where: { id: akun.id }, data: { divisionId: div!.id } });

    const f = () => berkas({ nama: "Divisi Beda", email: akun.email, divisi: "Sales" });
    const p = await previewEmployeeImport(HRD, f());
    assert.equal(p.ok && p.data.ok, true, "perbedaan divisi BUKAN penghalang");
    assert.match(p.ok ? p.data.rows[0].notes.join(" ") : "", /Akun TIDAK diubah/);

    assert.equal((await applyEmployeeImport(HRD, f())).ok, true);
    const sesudah = await db.user.findUnique({
      where: { id: akun.id },
      select: { division: { select: { code: true } } },
    });
    assert.equal(sesudah!.division?.code, "WH", "divisi akun harus tetap seperti semula");

    const emp = await db.employee.findFirst({
      where: { fullName: "Divisi Beda" },
      select: { division: { select: { code: true } } },
    });
    assert.equal(emp!.division?.code, "SLS", "sedangkan data pegawai memakai isi berkas");
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

// ── Data diri lewat impor massal (Fase 60) ──────────────────────
//
// Menempuh jalur yang SAMA: xlsx nyata → zip → XML → tabel → basis data.
// Yang dibuktikan di sini bukan "pengurainya membaca", melainkan nilainya
// benar-benar SAMPAI ke kolom Employee — sebab pengurai yang benar dengan
// penerapan yang lupa meneruskan bidangnya akan lulus seluruh tes unit dan
// tetap menyimpan data kosong.

const HEADER_DIRI = [...HEADER, "Tempat Lahir", "Tanggal Lahir", "Pendidikan Terakhir", "Golongan Darah"];

interface D extends R {
  lahir?: string;
  tglLahir?: string;
  didik?: string;
  darah?: string;
}

function berkasDiri(...rows: D[]): File {
  return xlsxFile([
    ["Data Pegawai PerumNet"],
    ["petunjuk"],
    HEADER_DIRI,
    ...rows.map((r) => [...baris(r), r.lahir ?? "", r.tglLahir ?? "", r.didik ?? "", r.darah ?? ""]),
  ]);
}

describe("data diri ikut tersimpan lewat impor", () => {
  // Setup SENDIRI, tidak menumpang blok di atas: blok itu menutup dengan
  // resetTransactionalData() + disconnect, jadi akun HRD-nya sudah tidak ada
  // saat blok ini berjalan — dan jejak audit yang menunjuk pengguna terhapus
  // menggagalkan impor dengan galat yang sama sekali tidak menyebut sebabnya.
  //
  // Sengaja TIDAK memanggil resetTransactionalData() di sini: memanggilnya
  // berarti blok ini ikut menghapus kerja blok lain, persis kesalahan yang
  // baru saja terjadi.
  let PETUGAS: ReturnType<typeof actor>;
  before(async () => {
    await ensureMasterData();
    await db.division.upsert({ where: { code: "NOC" }, update: {}, create: { code: "NOC", name: "NOC" } });
    PETUGAS = actor((await makeUser(tag("hrddiri").toLowerCase(), "HRD")).id, "hrd");
  });

  test("keempatnya SAMPAI ke basis data, bukan hanya terbaca pengurai", async () => {
    const r = await applyEmployeeImport(
      PETUGAS,
      berkasDiri({
        nama: "Komang Data Diri",
        email: "",
        lahir: "Singaraja",
        tglLahir: "1993-11-02",
        didik: "D3",
        darah: "AB−",
      })
    );
    assert.equal(r.ok, true, r.ok ? "" : r.error);

    const e = await db.employee.findFirst({ where: { fullName: "Komang Data Diri" } });
    assert.notEqual(e, null);
    assert.equal(e!.birthPlace, "Singaraja");
    assert.equal(e!.birthDate?.toISOString().slice(0, 10), "1993-11-02");
    assert.equal(e!.education, "D3");
    assert.equal(e!.bloodType, "AB_NEG", "kode, bukan label yang diketik HRD");
  });

  test("STRIP BIASA dari papan ketik sama dengan minus di dropdown", async () => {
    // Label resminya memakai minus (U+2212); papan ketik menghasilkan strip
    // (U+002D). Kalau hanya satu yang diterima, HRD mengetik sendiri lalu
    // ditolak tanpa tahu bedanya di mana.
    const r = await applyEmployeeImport(
      PETUGAS,
      berkasDiri({ nama: "Nyoman Strip Biasa", darah: "O-" })
    );
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    const e = await db.employee.findFirst({ where: { fullName: "Nyoman Strip Biasa" } });
    assert.equal(e!.bloodType, "O_NEG");
  });

  test("golongan TANPA TANDA menggagalkan seluruh impor — tidak ada yang tersimpan setengah", async () => {
    const sebelum = await db.employee.count();
    const r = await applyEmployeeImport(
      PETUGAS,
      berkasDiri(
        { nama: "Gede Benar", darah: "B+" },
        { nama: "Putu Tanpa Tanda", darah: "A" }
      )
    );
    assert.equal(r.ok, false);
    assert.equal(await db.employee.count(), sebelum, "impor bersifat semua-atau-tidak sama sekali");
  });

  test("berkas TANPA empat kolom itu tetap diterima", async () => {
    // Berkas yang HRD sudah mulai isi sebelum kolom ini ada tidak boleh
    // mendadak ditolak setelah kita menambahkannya.
    const r = await applyEmployeeImport(PETUGAS, berkas({ nama: "Wayan Berkas Lama" }));
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    const e = await db.employee.findFirst({ where: { fullName: "Wayan Berkas Lama" } });
    assert.equal(e!.bloodType, null);
    assert.equal(e!.birthDate, null);
  });
});

// ── Melengkapi data diri pegawai yang SUDAH ada (Fase 60) ───────
//
// Kejadian yang memaksa ini ada: 23 pegawai sudah terdaftar, lalu template
// diisikan data mereka supaya HRD tinggal melengkapi empat kolom. Sebelum
// perubahan ini seluruh baris itu DILEWATI — HRD mengisi 23 baris, mengunggah,
// dan tidak ada satu pun yang tersimpan, tanpa galat apa pun.

describe("melengkapi data diri lewat impor ulang", () => {
  let PETUGAS: ReturnType<typeof actor>;
  let NIK: string;

  before(async () => {
    await ensureMasterData();
    await db.division.upsert({ where: { code: "NOC" }, update: {}, create: { code: "NOC", name: "NOC" } });
    PETUGAS = actor((await makeUser(tag("hrdlengkap").toLowerCase(), "HRD")).id, "hrd");

    const r = await applyEmployeeImport(PETUGAS, berkas({ nama: "Ketut Sudah Ada", jabatan: "Teknisi" }));
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    NIK = (await db.employee.findFirstOrThrow({ where: { fullName: "Ketut Sudah Ada" } })).employeeNo;
  });

  test("pratinjau menyebutnya LENGKAPI dan menuliskan apa yang berubah", async () => {
    const p = await previewEmployeeImport(
      PETUGAS,
      berkasDiri({ nik: NIK, nama: "Ketut Sudah Ada", lahir: "Tabanan", darah: "B+" })
    );
    assert.equal(p.ok, true, p.ok ? "" : p.error);
    const baris = p.ok ? p.data.rows[0] : null;
    assert.equal(baris!.action, "LENGKAPI");
    assert.equal(p.ok && p.data.willComplete, 1);
    assert.equal(p.ok && p.data.willCreate, 0);
    // Perubahan yang tidak terlihat di pratinjau sama saja dengan perubahan
    // yang tidak diputuskan siapa pun.
    assert.equal(baris!.notes.some((n) => /Tempat Lahir: \(kosong\) → Tabanan/.test(n)), true, baris!.notes.join(" | "));
  });

  test("nilainya benar-benar tersimpan", async () => {
    const r = await applyEmployeeImport(
      PETUGAS,
      berkasDiri({ nik: NIK, nama: "Ketut Sudah Ada", lahir: "Tabanan", tglLahir: "1990-06-05", didik: "S1", darah: "B+" })
    );
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    assert.equal(r.ok && r.data.completed.length, 1);
    const e = await db.employee.findFirstOrThrow({ where: { employeeNo: NIK } });
    assert.equal(e.birthPlace, "Tabanan");
    assert.equal(e.birthDate?.toISOString().slice(0, 10), "1990-06-05");
    assert.equal(e.education, "S1");
    assert.equal(e.bloodType, "B_POS");
  });

  test("SEL KOSONG TIDAK MENGHAPUS yang sudah terisi", async () => {
    // Orang mengosongkan sel karena tidak tahu, jauh lebih sering daripada
    // karena ingin menghapus. Kalau kosong berarti hapus, satu berkas lama
    // yang diunggah ulang akan menghapus data diri semua orang sekaligus.
    const r = await applyEmployeeImport(PETUGAS, berkasDiri({ nik: NIK, nama: "Ketut Sudah Ada" }));
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    const e = await db.employee.findFirstOrThrow({ where: { employeeNo: NIK } });
    assert.equal(e.birthPlace, "Tabanan", "data lama harus bertahan");
    assert.equal(e.bloodType, "B_POS");
  });

  test("tanpa perubahan kembali menjadi SKIP, bukan penulisan sia-sia", async () => {
    const p = await previewEmployeeImport(
      PETUGAS,
      berkasDiri({ nik: NIK, nama: "Ketut Sudah Ada", lahir: "Tabanan", darah: "B+" })
    );
    assert.equal(p.ok && p.data.rows[0].action, "SKIP");
    assert.equal(p.ok && p.data.willComplete, 0);
  });

  test("KOLOM LAIN TIDAK IKUT BERUBAH meski berbeda di berkas", async () => {
    // Inti pengamanannya. Divisi menentukan ke mana persetujuan cuti berjalan
    // dan grup Authentik mana yang diikuti; kontrak menentukan kapan akun
    // dibekukan. Mengubahnya sebagai efek samping mengunggah spreadsheet
    // berarti memindahkan kewenangan orang tanpa ada yang memutuskan.
    const sebelum = await db.employee.findFirstOrThrow({ where: { employeeNo: NIK } });
    const r = await applyEmployeeImport(
      PETUGAS,
      berkasDiri({
        nik: NIK,
        nama: "Ketut Nama Diubah",
        jabatan: "Manajer Baru",
        jenjang: "Supervisor",
        divisi: "MKT",
        alamat: "Alamat Baru",
        didik: "S2",
      })
    );
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    const sesudah = await db.employee.findFirstOrThrow({ where: { employeeNo: NIK } });
    assert.equal(sesudah.education, "S2", "hanya data diri yang berubah");
    assert.equal(sesudah.fullName, sebelum.fullName, "nama TIDAK berubah");
    assert.equal(sesudah.jobTitle, sebelum.jobTitle, "jabatan TIDAK berubah");
    assert.equal(sesudah.jobLevel, sebelum.jobLevel, "jenjang TIDAK berubah");
    assert.equal(sesudah.divisionId, sebelum.divisionId, "divisi TIDAK berubah");
    assert.equal(sesudah.address, sebelum.address, "alamat TIDAK berubah");
  });

  test("nama yang berbeda DICATAT, supaya tidak dikira ikut terbetulkan", async () => {
    const p = await previewEmployeeImport(
      PETUGAS,
      berkasDiri({ nik: NIK, nama: "Ketut Salah Ketik", darah: "O−" })
    );
    assert.equal(p.ok && p.data.rows[0].notes.some((n) => /TIDAK diubah/.test(n)), true);
  });

  test("perubahannya tercatat di AuditLog lengkap dengan nilainya", async () => {
    // Golongan darah yang salah baru ketahuan saat dibutuhkan, dan saat itu
    // yang menolong hanya jejak siapa mengubah apa.
    const log = await db.auditLog.findFirst({
      where: { action: "EMPLOYEE_PERSONAL_UPDATE" },
      orderBy: { createdAt: "desc" },
    });
    assert.notEqual(log, null);
    assert.equal(log!.userId, PETUGAS.id);
    assert.match(log!.description, /Golongan Darah|Pendidikan|Tempat Lahir/);
  });
});

// ── Menyimpan formulir tidak boleh MENGHAPUS yang tidak disebutnya ──
//
// Kejadian nyata 14 Agustus 2026: satu menit setelah impor 23 pegawai
// berhasil, satu penyimpanan formulir pegawai mengosongkan divisi, tempat &
// tanggal lahir, pendidikan, dan golongan darah seorang pegawai. Tanpa satu
// pun galat.
//
// Sebabnya payload saveEmployee() dibangun tanpa syarat, sementara formulir
// HRD memang tidak punya input untuk kelima kolom itu. Kolom yang tidak
// dikirim menjadi null — terhapus diam-diam.

describe("saveEmployee: yang TIDAK DISEBUT tidak boleh hilang", () => {
  let PETUGAS: ReturnType<typeof actor>;
  let id: string;

  before(async () => {
    await ensureMasterData();
    await db.division.upsert({ where: { code: "NOC" }, update: {}, create: { code: "NOC", name: "NOC" } });
    PETUGAS = actor((await makeUser(tag("hrdsave").toLowerCase(), "HRD")).id, "hrd");
    const noc = await db.division.findFirstOrThrow({ where: { code: "NOC" } });
    const r = await saveEmployee(PETUGAS, {
      employeeNo: "10009201",
      fullName: "Lengkap Sejak Awal",
      employeeType: "FULL_TIME",
      joinedAt: new Date("2026-01-06"),
      jobTitle: "Teknisi",
      address: "Jl. Uji 1",
      divisionId: noc.id,
      birthPlace: "Denpasar",
      birthDate: new Date("1990-06-05"),
      education: "S1",
      bloodType: "O_POS",
    });
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    id = r.id!;
  });

  test("MENGUBAH NAMA SAJA tidak menghapus divisi dan data diri", async () => {
    // Ini persis bentuk panggilan formulir HRD: ia tidak mengirim divisionId
    // maupun keempat kolom data diri sama sekali.
    const r = await saveEmployee(PETUGAS, {
      id,
      employeeNo: "10009201",
      fullName: "Nama Sudah Diperbaiki",
      employeeType: "FULL_TIME",
      joinedAt: new Date("2026-01-06"),
      jobTitle: "Teknisi",
      isActive: true,
      address: "Jl. Uji 1",
      supervisorId: null,
      userId: null,
      contractStartAt: null,
      contractEndAt: null,
    });
    assert.equal(r.ok, true, r.ok ? "" : r.error);

    const e = await db.employee.findUniqueOrThrow({ where: { id } });
    assert.equal(e.fullName, "Nama Sudah Diperbaiki", "yang disebut memang berubah");
    assert.notEqual(e.divisionId, null, "DIVISI hilang — inilah bug-nya");
    assert.equal(e.birthPlace, "Denpasar");
    assert.equal(e.birthDate?.toISOString().slice(0, 10), "1990-06-05");
    assert.equal(e.education, "S1");
    assert.equal(e.bloodType, "O_POS");
  });

  test("MENGIRIM null memang mengosongkan — 'tidak tahu' beda dari 'hapus'", async () => {
    const r = await saveEmployee(PETUGAS, {
      id,
      employeeNo: "10009201",
      fullName: "Nama Sudah Diperbaiki",
      employeeType: "FULL_TIME",
      joinedAt: new Date("2026-01-06"),
      bloodType: null,
    });
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    const e = await db.employee.findUniqueOrThrow({ where: { id } });
    assert.equal(e.bloodType, null, "null yang dikirim sengaja harus menghapus");
    assert.equal(e.birthPlace, "Denpasar", "yang lain tetap tidak tersentuh");
  });

  test("isActive yang tidak disebut TIDAK menghidupkan kembali orang yang keluar", async () => {
    await db.employee.update({ where: { id }, data: { isActive: false } });
    await saveEmployee(PETUGAS, {
      id,
      employeeNo: "10009201",
      fullName: "Nama Sudah Diperbaiki",
      employeeType: "FULL_TIME",
      joinedAt: new Date("2026-01-06"),
    });
    const e = await db.employee.findUniqueOrThrow({ where: { id } });
    assert.equal(e.isActive, false, "satu penyimpanan tanpa kotak centang tidak boleh menghidupkannya");
  });

  test("aturan kontrak diperiksa terhadap HASIL AKHIR, bukan hanya masukan", async () => {
    // Kalau hanya masukan yang diperiksa, mengubah jenis karyawan menjadi
    // Tetap tanpa menyebut tanggal kontrak akan lolos — dan tanggal lama
    // tertinggal di barisnya. Penyapu Fase 42 kemudian membekukan orang yang
    // masih bekerja, berdasarkan tanggal yang seharusnya sudah tidak ada.
    const k = await saveEmployee(PETUGAS, {
      employeeNo: "10009202",
      fullName: "Karyawan Kontrak Uji",
      employeeType: "CONTRACT",
      joinedAt: new Date("2026-01-06"),
      contractStartAt: new Date("2026-01-06"),
      contractEndAt: new Date("2026-12-31"),
    });
    assert.equal(k.ok, true, k.ok ? "" : k.error);

    const ubah = await saveEmployee(PETUGAS, {
      id: k.id!,
      employeeNo: "10009202",
      fullName: "Karyawan Kontrak Uji",
      employeeType: "FULL_TIME", // jadi karyawan tetap, tanggal tidak disebut
      joinedAt: new Date("2026-01-06"),
    });
    assert.equal(ubah.ok, false, "harus ditolak: tanggal kontrak lama masih menempel");
    assert.match(ubah.ok ? "" : ubah.error, /kontrak/i);
  });
});
