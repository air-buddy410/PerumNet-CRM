import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEmployeeSheet, normalizeEmployeeNo } from "@/lib/employee-import";
import { readSheetRows, XlsxError } from "@/lib/xlsx-read";

const HEADER = [
  "NIK",
  "Nama Lengkap *",
  "Jabatan",
  "Jenjang Jabatan *",
  "Status Kepegawaian *",
  "Pola Kerja *",
  "Tanggal Bergabung *",
  "Kontrak Mulai",
  "Kontrak Berakhir",
  "Alamat",
  "NIK Atasan",
  "Email Akun CRM",
  "Aktif *",
  "Divisi *",
  "Cek",
];

/** Satu baris sah; bidang mana pun bisa ditimpa untuk menguji satu aturan. */
function row(over: Partial<Record<string, string>> = {}): string[] {
  const base: Record<string, string> = {
    NIK: "",
    Nama: "Wayan Sudira",
    Jabatan: "Teknisi",
    Jenjang: "Staff",
    Status: "Karyawan Tetap",
    Pola: "Non-Shift",
    Gabung: "2026-01-06",
    KMulai: "",
    KAkhir: "",
    Alamat: "",
    Atasan: "",
    Email: "",
    Aktif: "Ya",
    Divisi: "NOC",
    Cek: "OK",
    ...over,
  };
  return [
    base.NIK, base.Nama, base.Jabatan, base.Jenjang, base.Status, base.Pola,
    base.Gabung, base.KMulai, base.KAkhir, base.Alamat, base.Atasan,
    base.Email, base.Aktif, base.Divisi, base.Cek,
  ];
}

function sheet(...dataRows: string[][]): string[][] {
  return [["Data Pegawai PerumNet"], ["petunjuk"], HEADER, ...dataRows];
}

describe("parseEmployeeSheet — jalur normal", () => {
  test("baris sah terbaca lengkap", () => {
    const r = parseEmployeeSheet(sheet(row({ Alamat: "Jl. Melati 7", Email: "Wayan@Perumnet.ID " })));
    assert.equal(r.issues.length, 0, JSON.stringify(r.issues));
    assert.equal(r.rows.length, 1);
    const e = r.rows[0];
    assert.equal(e.fullName, "Wayan Sudira");
    assert.equal(e.employeeType, "FULL_TIME");
    assert.equal(e.workPattern, "NON_SHIFT");
    assert.equal(e.jobLevel, "STAFF");
    assert.equal(e.joinedAt.toISOString().slice(0, 10), "2026-01-06");
    assert.equal(e.isActive, true);
    assert.equal(e.address, "Jl. Melati 7");
    assert.equal(e.accountEmail, "wayan@perumnet.id", "email dinormalkan huruf kecil");
    assert.equal(e.rowNumber, 4, "nomor baris seperti yang dilihat HRD");
  });

  test("baris kosong DILEWATI, bukan jadi galat", () => {
    // Template menyediakan 200 baris kosong. Kalau tiap baris kosong
    // menghasilkan galat "wajib diisi", pratinjaunya tidak bisa dibaca.
    const r = parseEmployeeSheet(sheet(row(), new Array(14).fill(""), new Array(14).fill("")));
    assert.equal(r.issues.length, 0);
    assert.equal(r.rows.length, 1);
    assert.equal(r.skipped, 2);
  });

  test("label maupun kode diterima", () => {
    const r = parseEmployeeSheet(
      sheet(row({ Status: "CONTRACT", Pola: "SHIFT", Jenjang: "LEADER", KMulai: "2026-01-06", KAkhir: "2026-12-31" }))
    );
    assert.equal(r.issues.length, 0, JSON.stringify(r.issues));
    assert.equal(r.rows[0].employeeType, "CONTRACT");
    assert.equal(r.rows[0].workPattern, "SHIFT");
    assert.equal(r.rows[0].jobLevel, "LEADER");
  });

  test("ejaan longgar diterima — 'non shift' sama dengan 'Non-Shift'", () => {
    const r = parseEmployeeSheet(sheet(row({ Pola: "non shift" })));
    assert.equal(r.rows[0]?.workPattern, "NON_SHIFT");
  });

  test("NIK kosong dibiarkan kosong — sistem yang menerbitkannya", () => {
    const r = parseEmployeeSheet(sheet(row()));
    assert.equal(r.rows[0].employeeNo, "");
  });
});

describe("nilai yang tidak dikenal DITOLAK, bukan ditebak", () => {
  test("status kepegawaian salah ketik", () => {
    // "Kontark" yang diam-diam menjadi Karyawan Tetap akan mematikan seluruh
    // pengingat masa kontraknya — orangnya bekerja tanpa kontrak tercatat.
    const r = parseEmployeeSheet(sheet(row({ Status: "Kontark" })));
    assert.equal(r.rows.length, 0);
    assert.equal(r.issues[0].column, "Status Kepegawaian");
    assert.match(r.issues[0].message, /tidak dikenal/);
    assert.match(r.issues[0].message, /Kontrak/, "pesannya menyebut pilihan yang sah");
  });

  test("kolom Aktif kosong DITOLAK, tidak dianggap aktif", () => {
    // Menganggap "aktif" pada sel yang tak terbaca berarti menghidupkan orang
    // yang sudah keluar — lengkap dengan akses dan kartunya.
    const r = parseEmployeeSheet(sheet(row({ Aktif: "" })));
    assert.equal(r.rows.length, 0);
    assert.equal(r.issues[0].column, "Aktif");
  });

  test("Aktif dengan kata tak dikenal juga ditolak", () => {
    const r = parseEmployeeSheet(sheet(row({ Aktif: "mungkin" })));
    assert.equal(r.rows.length, 0);
  });

  test("Tidak / No / 0 dibaca sebagai nonaktif", () => {
    for (const kata of ["Tidak", "No", "0", "FALSE", "Nonaktif"]) {
      const r = parseEmployeeSheet(sheet(row({ Aktif: kata })));
      assert.equal(r.rows[0]?.isActive, false, `"${kata}" harus nonaktif`);
    }
  });

  test("tanggal bergabung ambigu ditolak dengan contoh penulisan", () => {
    const r = parseEmployeeSheet(sheet(row({ Gabung: "06/01/2026" })));
    assert.equal(r.rows.length, 0);
    assert.match(r.issues[0].message, /2026-01-31/);
  });

  test("tanggal kontrak terisi tapi tak terbaca TIDAK boleh hilang diam-diam", () => {
    const r = parseEmployeeSheet(sheet(row({ Status: "Kontrak", KMulai: "2026-01-06", KAkhir: "akhir tahun" })));
    assert.equal(r.rows.length, 0);
    assert.equal(r.issues.some((i) => i.column === "Kontrak Berakhir"), true);
  });

  test("email tak sah ditolak", () => {
    const r = parseEmployeeSheet(sheet(row({ Email: "wayan(at)perumnet" })));
    assert.equal(r.rows.length, 0);
    assert.equal(r.issues[0].column, "Email Akun CRM");
  });
});

describe("aturan kontrak dipinjam dari employment.ts", () => {
  test("tanggal kontrak pada karyawan TETAP ditolak", () => {
    // Penyapu Fase 42 membekukan akun berdasarkan contractEndAt. Tanggal yang
    // tertinggal pada karyawan tetap akan membekukan orang yang masih bekerja.
    const r = parseEmployeeSheet(sheet(row({ Status: "Karyawan Tetap", KAkhir: "2026-12-31" })));
    assert.equal(r.rows.length, 0);
    assert.equal(r.issues.length, 1);
  });

  test("karyawan kontrak TANPA tanggal ditolak", () => {
    const r = parseEmployeeSheet(sheet(row({ Status: "Kontrak" })));
    assert.equal(r.rows.length, 0);
  });

  test("kontrak dengan tanggal lengkap diterima", () => {
    const r = parseEmployeeSheet(sheet(row({ Status: "Kontrak", KMulai: "2026-01-06", KAkhir: "2026-12-31" })));
    assert.equal(r.issues.length, 0, JSON.stringify(r.issues));
    assert.equal(r.rows[0].contractEndAt?.toISOString().slice(0, 10), "2026-12-31");
  });
});

describe("keunikan DI DALAM berkas, bukan hanya terhadap basis data", () => {
  test("NIK kembar ditolak dan menyebut baris pertamanya", () => {
    // Dua baris ber-NIK sama lolos pemeriksaan basis data satu per satu, lalu
    // yang kedua menimpa yang pertama tanpa jejak.
    const r = parseEmployeeSheet(sheet(row({ NIK: "10000001" }), row({ NIK: "10000001", Nama: "Orang Lain" })));
    assert.equal(r.rows.length, 1);
    assert.equal(r.issues[0].rowNumber, 5);
    assert.match(r.issues[0].message, /baris 4/);
  });

  test("email kembar ditolak", () => {
    const r = parseEmployeeSheet(
      sheet(row({ Email: "a@perumnet.id" }), row({ Nama: "Beda Orang", Email: "A@Perumnet.id" }))
    );
    assert.equal(r.rows.length, 1);
    assert.match(r.issues[0].message, /baris 4/);
  });

  test("NIK dinormalkan sama di kedua tempat", () => {
    // Penaut atasan mencocokkan teks; dua penyeragaman yang sedikit berbeda
    // berarti atasan yang ada tidak ketemu dan hierarkinya diam-diam kosong.
    assert.equal(normalizeEmployeeNo(" emp-7 "), "EMP-7");
    const r = parseEmployeeSheet(sheet(row({ NIK: " 10000001 " })));
    assert.equal(r.rows[0].employeeNo, "10000001");
  });
});

describe("hierarki atasan", () => {
  test("atasan diri sendiri ditolak", () => {
    const r = parseEmployeeSheet(sheet(row({ NIK: "10000001", Atasan: "10000001" })));
    assert.equal(r.rows.length, 0);
    assert.equal(r.issues[0].column, "NIK Atasan");
  });

  test("atasan diri sendiri lewat NAMA juga ditolak", () => {
    const r = parseEmployeeSheet(sheet(row({ Nama: "Wayan Sudira", Atasan: "Wayan Sudira" })));
    assert.equal(r.rows.length, 0);
  });

  test("NAMA diterima sebagai rujukan atasan", () => {
    // Pada impor PERTAMA belum ada satu pun NIK yang terbit. Tanpa ini,
    // seluruh hierarki dari impor perdana kosong dan harus diisi ulang satu
    // per satu lewat CRM.
    const r = parseEmployeeSheet(
      sheet(row({ Nama: "Bawahan", Atasan: "Ketut Leader" }), row({ Nama: "Ketut Leader", Jenjang: "Leader" }))
    );
    assert.equal(r.issues.length, 0, JSON.stringify(r.issues));
    assert.equal(r.rows[0].supervisorRowNumber, 5, "menunjuk baris atasannya");
    assert.equal(r.rows[1].supervisorRowNumber, null);
  });

  test("NAMA GANDA ditolak, bukan diambil yang pertama", () => {
    // Mengambil yang pertama berarti separuh tim melapor kepada orang yang
    // salah, dan tidak ada yang tahu.
    const r = parseEmployeeSheet(
      sheet(
        row({ Nama: "Bawahan", Atasan: "Made Dwi" }),
        row({ Nama: "Made Dwi", NIK: "10000001" }),
        row({ Nama: "Made Dwi", NIK: "10000002" })
      )
    );
    assert.equal(r.issues.length, 1);
    assert.match(r.issues[0].message, /Tulis NIK-nya/);
    assert.equal(r.rows.length, 2, "hanya baris yang ambigu yang ditahan");
  });

  test("NIK menang atas nama saat keduanya bisa cocok", () => {
    const r = parseEmployeeSheet(
      sheet(
        row({ Nama: "Bawahan", Atasan: "10000002" }),
        row({ Nama: "Made Dwi", NIK: "10000001" }),
        row({ Nama: "Made Dwi", NIK: "10000002" })
      )
    );
    assert.equal(r.issues.length, 0, JSON.stringify(r.issues));
    assert.equal(r.rows[0].supervisorRowNumber, 6);
  });

  test("SIKLUS di dalam berkas tertangkap SEBELUM apa pun tersimpan", () => {
    // Penerapan berjalan dua tahap; pada tahap kedua saveEmployee memang
    // menolak siklus, tapi saat itu separuh datanya sudah masuk.
    const r = parseEmployeeSheet(
      sheet(
        row({ NIK: "10000001", Nama: "A", Atasan: "10000002" }),
        row({ NIK: "10000002", Nama: "B", Atasan: "10000001" })
      )
    );
    assert.equal(r.rows.length, 0, "kedua baris ditahan");
    assert.equal(r.issues.length, 2);
    assert.match(r.issues[0].message, /berputar kembali/);
  });

  test("siklus tiga langkah juga tertangkap", () => {
    const r = parseEmployeeSheet(
      sheet(
        row({ NIK: "10000001", Nama: "A", Atasan: "10000002" }),
        row({ NIK: "10000002", Nama: "B", Atasan: "10000003" }),
        row({ NIK: "10000003", Nama: "C", Atasan: "10000001" })
      )
    );
    assert.equal(r.rows.length, 0);
  });

  test("rantai atasan yang WAJAR tidak dianggap siklus", () => {
    const r = parseEmployeeSheet(
      sheet(
        row({ NIK: "10000001", Nama: "A", Atasan: "10000002" }),
        row({ NIK: "10000002", Nama: "B", Atasan: "10000003" }),
        row({ NIK: "10000003", Nama: "C" })
      )
    );
    assert.equal(r.issues.length, 0, JSON.stringify(r.issues));
    assert.equal(r.rows.length, 3);
  });

  test("atasan yang TIDAK ada di berkas bukan galat", () => {
    // Orangnya bisa sudah terdaftar lebih dulu; pencocokannya saat penerapan.
    const r = parseEmployeeSheet(sheet(row({ NIK: "10000009", Atasan: "10000001" })));
    assert.equal(r.issues.length, 0);
    assert.equal(r.rows[0].supervisorRef, "10000001");
    assert.equal(r.rows[0].supervisorRowNumber, null, "dibiarkan untuk dicocokkan ke basis data");
  });

  test("atasan boleh berada di baris BAWAH", () => {
    const r = parseEmployeeSheet(
      sheet(row({ NIK: "10000001", Nama: "Bawahan", Atasan: "10000002" }), row({ NIK: "10000002", Nama: "Atasan" }))
    );
    assert.equal(r.issues.length, 0);
    assert.equal(r.rows.length, 2);
    assert.equal(r.rows[0].supervisorRowNumber, 5);
  });
});

describe("kolom Divisi — boleh tidak ada, tapi kalau ada wajib diisi", () => {
  test("nilainya dibawa apa adanya untuk dicocokkan saat penerapan", () => {
    // Daftar divisi itu DATA di tabel Division, bukan konstanta kode — jadi
    // lapisan murni tidak boleh berpura-pura tahu isinya.
    const r = parseEmployeeSheet(sheet(row({ Divisi: "Customer Service" })));
    assert.equal(r.issues.length, 0, JSON.stringify(r.issues));
    assert.equal(r.rows[0].divisionRef, "Customer Service");
  });

  test("BERKAS LAMA tanpa kolom Divisi tetap bisa diimpor", () => {
    // HRD sudah mulai mengisi sebelum kolom ini ada. Menolak berkas mereka
    // berarti menyuruh mengulang dua ratus baris.
    const idx = HEADER.indexOf("Divisi *");
    const lama = HEADER.filter((_, i) => i !== idx);
    const isi = row().filter((_, i) => i !== idx);
    const r = parseEmployeeSheet([["judul"], ["petunjuk"], lama, isi]);
    assert.equal(r.issues.length, 0, JSON.stringify(r.issues));
    assert.equal(r.rows[0].divisionRef, null);
  });

  test("kolomnya ADA tapi selnya kosong → DITOLAK", () => {
    // Sel kosong berarti seseorang terlewat. Pegawai tanpa divisi tidak bisa
    // dibuatkan akun maupun dilabeli kotak emailnya, dan itu baru ketahuan
    // jauh belakangan kalau dibiarkan lewat.
    const r = parseEmployeeSheet(sheet(row({ Divisi: "" })));
    assert.equal(r.rows.length, 0);
    assert.equal(r.issues[0].column, "Divisi");
  });
});

describe("bentuk berkas", () => {
  test("kolom dipetakan lewat JUDUL, bukan urutan", () => {
    // Menyisipkan kolom catatan adalah hal paling wajar yang dilakukan orang
    // pada spreadsheet; pembaca berbasis urutan akan menyimpan seluruh sisa
    // kolom pada bidang yang salah tanpa satu pun galat.
    const geser = ["Catatan", ...HEADER];
    const r = parseEmployeeSheet([["judul"], ["petunjuk"], geser, ["nb", ...row()]]);
    assert.equal(r.issues.length, 0, JSON.stringify(r.issues));
    assert.equal(r.rows[0].fullName, "Wayan Sudira");
  });

  test('"Jabatan" dan "Jenjang Jabatan" tidak tertukar', () => {
    const r = parseEmployeeSheet(sheet(row({ Jabatan: "Teknisi Lapangan", Jenjang: "Leader" })));
    assert.equal(r.rows[0].jobTitle, "Teknisi Lapangan");
    assert.equal(r.rows[0].jobLevel, "LEADER");
  });

  test("baris judul dicari, tidak dianggap selalu baris ketiga", () => {
    const r = parseEmployeeSheet([["catatan"], ["lagi"], ["lagi"], ["lagi"], HEADER, row()]);
    assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0].rowNumber, 6);
  });

  test("kolom wajib yang hilang menggagalkan SELURUH berkas", () => {
    const tanpaAktif = HEADER.filter((h) => h !== "Aktif *");
    assert.throws(
      () => parseEmployeeSheet([["judul"], ["petunjuk"], tanpaAktif, []]),
      (e: unknown) => e instanceof XlsxError && /Aktif/.test((e as Error).message)
    );
  });

  test("berkas tanpa baris judul ditolak dengan arahan yang jelas", () => {
    assert.throws(
      () => parseEmployeeSheet([["a", "b"], ["c", "d"]]),
      (e: unknown) => e instanceof XlsxError && /template resmi/.test((e as Error).message)
    );
  });

  test("kolom opsional yang hilang tidak menggagalkan apa pun", () => {
    const idx = HEADER.indexOf("Alamat");
    const tanpaAlamat = HEADER.filter((_, i) => i !== idx);
    const isi = row().filter((_, i) => i !== idx);
    const r = parseEmployeeSheet([["judul"], ["petunjuk"], tanpaAlamat, isi]);
    assert.equal(r.issues.length, 0, JSON.stringify(r.issues));
    assert.equal(r.rows[0].address, null);
  });
});

describe("terhadap template asli yang kita kirim ke HRD", () => {
  const rows = readSheetRows(readFileSync("docs/template/Template-Data-Pegawai.xlsx"));

  test("BARIS CONTOH ditolak, tidak ikut terimpor", () => {
    // Kalau lolos, PerumNet punya seorang "Teguh Santoso" berkontrak setahun
    // yang tidak ada orangnya — lengkap dengan pengingat kontrak dan kartu.
    const r = parseEmployeeSheet(rows);
    assert.equal(r.rows.length, 0, "template kosong tidak menghasilkan pegawai");
    assert.equal(r.issues.length, 1);
    assert.match(r.issues[0].message, /baris contoh/i);
    assert.equal(r.issues[0].rowNumber, 4);
  });

  test("200 baris kosong template terlewati semua", () => {
    const r = parseEmployeeSheet(rows);
    assert.equal(r.skipped > 190, true, `hanya ${r.skipped} baris terlewati`);
  });

  test("judul template cocok dengan yang diharapkan pembaca", () => {
    // Penjaga terhadap perubahan sepihak: kalau judul kolom di template
    // digeser tanpa memperbarui COLUMNS, ini yang gagal lebih dulu.
    assert.deepEqual(rows[2], HEADER);
  });
});
