import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  readSheetRows,
  jumlahBerisi,
  parseCellDate,
  columnIndexOf,
  SERIAL_DATE_FLOOR,
  XlsxError,
} from "@/lib/xlsx-read";

const TEMPLATE = "docs/template/Template-Data-Pegawai.xlsx";

describe("columnIndexOf", () => {
  test("huruf kolom menjadi indeks", () => {
    assert.equal(columnIndexOf("A1"), 0);
    assert.equal(columnIndexOf("B5"), 1);
    assert.equal(columnIndexOf("Z1"), 25);
    assert.equal(columnIndexOf("AA1"), 26);
    assert.equal(columnIndexOf("AB12"), 27);
  });
});

describe("readSheetRows — terhadap template yang kita terbitkan sendiri", () => {
  const rows = readSheetRows(readFileSync(TEMPLATE));

  test("membaca seluruh baris", () => {
    assert.equal(rows.length > 200, true);
  });

  test("header terbaca pada posisi yang benar", () => {
    const header = rows[2];
    assert.equal(header[0], "NIK");
    assert.equal(header[1], "Nama Lengkap *");
    assert.equal(header[6], "Tanggal Bergabung *");
  });

  test("SEL KOSONG TETAP MENEMPATI KOLOMNYA", () => {
    // Ini penjaga terhadap kerusakan paling berbahaya pada impor: xlsx
    // menulis sel kosong sebagai tag self-closing, dan regex atribut yang
    // rakus akan membacanya melewati sel berikutnya sehingga SELURUH BARIS
    // bergeser satu kolom. Nama masuk ke kolom NIK, dan tidak ada yang
    // terlihat salah sampai datanya sudah tersimpan.
    //
    // Baris contoh sengaja punya NIK kosong, jadi ia menguji persis itu.
    const contoh = rows[3];
    assert.equal(contoh[0], "", "kolom NIK harus tetap kosong");
    assert.equal(contoh[1], "Teguh Santoso", "nama harus di kolom kedua");
    assert.equal(contoh[2], "Teknisi Lapangan");
    assert.equal(contoh[4], "Kontrak");
  });

  test("berkas bukan zip ditolak dengan pesan yang menyebut .xls", () => {
    assert.throws(
      () => readSheetRows(Buffer.from("ini teks biasa, bukan xlsx")),
      (e: unknown) => e instanceof XlsxError && /\.xls lama tidak didukung/.test((e as Error).message)
    );
  });
});

describe("parseCellDate — menerima dua bentuk", () => {
  test("teks ISO", () => {
    assert.equal(parseCellDate("2026-01-06")?.toISOString().slice(0, 10), "2026-01-06");
  });

  test("angka serial Excel menghasilkan tanggal yang SAMA", () => {
    // Sel bertipe tanggal disimpan sebagai angka; sel bertipe teks apa adanya.
    // Keduanya harus berujung sama, kalau tidak hasil impor bergantung pada
    // cara HRD mengetik.
    assert.equal(parseCellDate("46028")?.toISOString().slice(0, 10), "2026-01-06");
  });

  test("kosong menghasilkan null, bukan tanggal ngawur", () => {
    assert.equal(parseCellDate(""), null);
    assert.equal(parseCellDate("   "), null);
  });

  test("ANGKA TAHUN SENDIRIAN ditolak", () => {
    // "2026" juga berupa angka. Tanpa ambang bawah ia terbaca 18 Juli 1905 —
    // masuk akal bagi mesin, jelas salah bagi manusia.
    assert.equal(parseCellDate("2026"), null);
    assert.equal(parseCellDate(String(SERIAL_DATE_FLOOR - 1)), null);
  });

  test("serial tepat di ambang diterima", () => {
    assert.equal(parseCellDate(String(SERIAL_DATE_FLOOR))?.toISOString().slice(0, 10), "1970-01-01");
  });

  test("FORMAT AMBIGU DITOLAK, bukan ditebak", () => {
    // 06/01/2026 bisa berarti 6 Januari atau 1 Juni. Menebaknya berarti
    // memasukkan tanggal yang salah tanpa ada yang tahu.
    assert.equal(parseCellDate("06/01/2026"), null);
    assert.equal(parseCellDate("6 Januari 2026"), null);
  });

  test("tanggal tidak bergeser sehari karena zona waktu", () => {
    // Dinormalkan ke tengah hari UTC. Tanpa itu, zona waktu di sebelah barat
    // UTC memundurkan tanggalnya saat ditampilkan.
    const d = parseCellDate("2026-01-06")!;
    assert.equal(d.getUTCDate(), 6);
    assert.equal(d.getUTCHours(), 12);
  });
});

describe("batas baris menghitung yang BERISI saja", () => {
  test("padding kosong dari Google Sheets tidak menghabiskan jatah", () => {
    // Google Sheets memadatkan tiap lembar sampai seribu baris kosong atau
    // lebih saat diekspor. Menghitungnya membuat berkas berisi tiga ratus
    // material tertolak sebagai "terlalu besar" — dan pesannya menyesatkan
    // sepenuhnya, sebab berkasnya kecil, yang besar hanya bingkainya.
    const isi = Array.from({ length: 20 }, (_, i) => [`KODE-${i}`, `Nama ${i}`]);
    const kosong = Array.from({ length: 6000 }, () => ["", "", ""]);
    assert.equal(jumlahBerisi([...isi, ...kosong]), 20);
  });

  test("baris yang selnya berisi spasi saja tetap dianggap kosong", () => {
    assert.equal(jumlahBerisi([["", ""], ["", "x"]]), 1);
  });
});
