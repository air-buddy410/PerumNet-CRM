import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  parseCustomerSheet,
  birthDateFromNik,
  normalizePhone,
  parseLooseDate,
  parseCoordinatePair,
  normalizeOdpCode,
  PHONE_RE,
} from "@/lib/customer-import";

const HEADER = [
  "Nama",
  "Customer Id (CID)",
  "PPPOE User",
  "PPPOE Password",
  "ID Card No KTP",
  "Phone No",
  "Date of Birth",
  "Email",
  "Sales",
  "Customer Address *",
  "Kordinat Client",
  "Paket",
  "Distribution Point (ODP)",
  "Billing Start Tanggal Pemasangan",
];

/** NIK yang tanggal lahirnya 31-07-1986 (hari 71 = 31 + 40, perempuan). */
const NIK = "5107057107860001";

function baris(ubah: Record<number, string> = {}): string[] {
  const r = [
    "Ni Made Darmini",
    "PN260801705",
    "PN260801705",
    "rahasia-tidak-boleh-terbaca",
    NIK,
    "081236023387",
    "1986-07-31",
    "darmini@gmail.com",
    "Jumroni",
    "Br. Dinas Sadimara",
    "-8.410412, 115.601331",
    "Paket-225k",
    "BSS 011204",
    "01/08/2026",
  ];
  for (const [i, v] of Object.entries(ubah)) r[Number(i)] = v;
  return r;
}

const sheet = (...rows: string[][]) => parseCustomerSheet([HEADER, ...rows], 2026);

describe("birthDateFromNik", () => {
  test("membaca enam digit tengah sebagai tanggal lahir", () => {
    assert.equal(birthDateFromNik("5107052611990002", 2026)!.toISOString().slice(0, 10), "1999-11-26");
  });

  test("hari di atas 40 berarti perempuan — dikurangi 40, bukan ditolak", () => {
    // Aturan Dukcapil. Tanpa ini, seluruh NIK perempuan akan terbaca sebagai
    // tanggal mustahil dan setengah pelanggan ditolak tanpa sebab.
    assert.equal(birthDateFromNik(NIK, 2026)!.toISOString().slice(0, 10), "1986-07-31");
  });

  test("dua digit tahun: melewati tahun ini berarti abad lalu", () => {
    assert.equal(birthDateFromNik("5107051306740001", 2026)!.getUTCFullYear(), 1974);
    assert.equal(birthDateFromNik("5107051306100001", 2026)!.getUTCFullYear(), 2010);
  });

  test("tanggal mustahil ditolak, bukan digeser diam-diam", () => {
    // 31 Februari akan menjadi 3 Maret kalau dibiarkan Date yang membetulkan.
    assert.equal(birthDateFromNik("5107053102990001", 2026), null);
    assert.equal(birthDateFromNik("5107050013990001", 2026), null);
  });

  test("nomor bukan 16 digit menghasilkan null", () => {
    assert.equal(birthDateFromNik("51070302079800002", 2026), null);
    assert.equal(birthDateFromNik("123", 2026), null);
  });
});

describe("normalizePhone", () => {
  test("membuang karakter tak terlihat yang ada di ekspor asli", () => {
    // U+202A ... U+2011 ... U+202C — tidak kelihatan di layar, tetapi membuat
    // pencocokan nomor gagal diam-diam.
    assert.equal(normalizePhone("‪0812‑4686‑4899‬"), "081246864899");
    assert.equal(normalizePhone("0812 3840 4056"), "081238404056");
  });

  test("tanda hubung dan kurung biasa juga dibuang", () => {
    assert.equal(normalizePhone("0812-3840-4056"), "081238404056");
    assert.equal(normalizePhone("(0361) 234567"), "0361234567");
  });

  test("nomor Indonesia dikenali dalam tiga bentuk awalan", () => {
    for (const n of ["081236023387", "6281236023387", "+6281236023387"]) {
      assert.ok(PHONE_RE.test(n), `${n} seharusnya sah`);
    }
    assert.ok(!PHONE_RE.test("12345"), "nomor terlalu pendek harus ditolak");
  });
});

describe("parseLooseDate", () => {
  test("menerima DD/MM/YYYY dan YYYY-M-D tanpa nol di depan", () => {
    assert.equal(parseLooseDate("01/08/2026")!.toISOString().slice(0, 10), "2026-08-01");
    assert.equal(parseLooseDate("1966-08-5")!.toISOString().slice(0, 10), "1966-08-05");
  });

  test("tanggal yang tidak ada ditolak", () => {
    assert.equal(parseLooseDate("31/02/2026"), null);
    assert.equal(parseLooseDate("2026-13-01"), null);
    assert.equal(parseLooseDate("kemarin"), null);
  });
});

describe("parseCoordinatePair", () => {
  test("satu sel berisi dua angka dipecah", () => {
    assert.deepEqual(parseCoordinatePair("-8.410412, 115.601331"), {
      latitude: -8.410412,
      longitude: 115.601331,
    });
  });

  test("bentuk yang bukan sepasang angka ditolak", () => {
    assert.equal(parseCoordinatePair("-8.410412"), null);
    assert.equal(parseCoordinatePair("dekat pura"), null);
  });
});

describe("normalizeOdpCode", () => {
  test("hanya huruf besar dan spasi tunggal — tidak lebih", () => {
    assert.equal(normalizeOdpCode(" bss  011204 "), "BSS 011204");
  });

  test("kode mirip TIDAK digabungkan", () => {
    // BSS dan BBS adalah dua tiang berbeda. Menyatukannya berarti menaruh
    // pelanggan pada tiang yang salah, dan tidak ada yang akan menyadarinya
    // sampai ada gangguan.
    assert.notEqual(normalizeOdpCode("BSS 011204"), normalizeOdpCode("BBS 011204"));
  });
});

describe("parseCustomerSheet", () => {
  test("baris sehat terbaca lengkap", () => {
    const h = sheet(baris());
    assert.equal(h.issues.length, 0);
    assert.equal(h.rows.length, 1);
    const r = h.rows[0];
    assert.equal(r.cid, "PN260801705");
    assert.equal(r.pppoeUsername, "PN260801705");
    assert.equal(r.identityNumber, NIK);
    assert.equal(r.birthDate!.toISOString().slice(0, 10), "1986-07-31");
    assert.equal(r.latitude, -8.410412);
    assert.equal(r.odpRef, "BSS 011204");
    assert.equal(r.packageRef, "Paket-225k");
  });

  test("PASSWORD TIDAK PERNAH ikut ke keluaran", () => {
    // Bukan dibaca lalu dibuang — memang tidak punya alias dan tidak punya
    // bidang. Kolomnya boleh ada di berkas; ia tidak punya jalan masuk.
    const h = sheet(baris());
    assert.ok(!JSON.stringify(h).includes("rahasia-tidak-boleh-terbaca"));
  });

  test("tanggal lahir yang cocok dengan NIK lolos", () => {
    assert.equal(sheet(baris({ 6: "31/07/1986" })).issues.length, 0);
  });

  test("tanpa kolom tanggal lahir, tanggalnya diambil dari NIK", () => {
    const h = sheet(baris({ 6: "" }));
    assert.equal(h.issues.length, 0);
    assert.equal(h.rows[0].birthDate!.toISOString().slice(0, 10), "1986-07-31");
  });

  test("NIK bukan 16 digit menggagalkan baris", () => {
    const h = sheet(baris({ 4: "51070302079800002" }));
    assert.equal(h.rows.length, 0);
    assert.equal(h.issues[0].column, "ID Card No KTP");
  });

  test("CID ganda ditolak pada kemunculan kedua", () => {
    const h = sheet(baris(), baris({ 0: "Orang Lain" }));
    assert.equal(h.rows.length, 1);
    assert.equal(h.rows[0].name, "Ni Made Darmini");
    assert.match(h.issues[0].message, /sudah dipakai di baris 2/);
  });

  test("koordinat (0,0) ditolak — itu GPS gagal, bukan lokasi", () => {
    const h = sheet(baris({ 10: "0, 0" }));
    assert.equal(h.rows.length, 0);
    assert.equal(h.issues[0].column, "Kordinat Client");
  });

  test("bidang opsional yang kosong jadi CATATAN, bukan penolakan", () => {
    const h = sheet(baris({ 8: "", 10: "", 12: "" }));
    assert.equal(h.issues.length, 0);
    assert.equal(h.rows.length, 1);
    const n = h.rows[0].notes.join(" ");
    assert.match(n, /Tanpa sales/);
    assert.match(n, /Tanpa koordinat/);
    assert.match(n, /Tanpa kode ODP/);
  });

  test("baris kosong dilewati diam-diam", () => {
    const h = sheet(baris(), new Array(14).fill(""));
    assert.equal(h.issues.length, 0);
    assert.equal(h.rows.length, 1);
    assert.equal(h.skipped, 1);
  });

  test("judul kolom lain tetap dikenali lewat alias — kesiapan Wifinetbill", () => {
    // Ekspor berikutnya datang dari sistem lain dengan judul berbeda. Kalau
    // ini gagal, seluruh parser harus ditulis ulang untuk sumber kedua.
    const lain = [["Nama Pelanggan", "ID Pelanggan", "Paket Internet", "No HP", "NIK"]];
    const h = parseCustomerSheet(
      [...lain, ["Budi", "PN26999", "Paket-175k", "081236023387", NIK]],
      2026
    );
    assert.equal(h.issues.length, 0);
    assert.equal(h.rows[0].cid, "PN26999");
    assert.equal(h.rows[0].packageRef, "Paket-175k");
    assert.equal(h.rows[0].identityNumber, NIK);
  });

  test("kolom wajib yang hilang menghentikan berkas dengan pesan yang bisa ditindaklanjuti", () => {
    const h = parseCustomerSheet([["Nama", "Email"], ["Budi", "b@x.id"]], 2026);
    assert.equal(h.rows.length, 0);
    assert.equal(h.issues.length, 1);
    assert.match(h.issues[0].message, /Kolom wajib tidak ditemukan/);
    assert.match(h.issues[0].message, /alias/);
  });

  test("berkas kosong tidak menghasilkan sukses senyap", () => {
    const h = parseCustomerSheet([], 2026);
    assert.equal(h.issues.length, 1);
  });
});

describe("perbaikan setelah adu dengan data asli", () => {
  test("nol di depan yang dimakan spreadsheet dikembalikan", () => {
    // Kolom telepon diperlakukan sebagai ANGKA, jadi `081236023387` tersimpan
    // sebagai `81236023387`. Tidak ada nomor Indonesia sah yang diawali 8
    // telanjang, jadi hanya satu bentuk yang mungkin dimaksud.
    assert.equal(normalizePhone("85738941976"), "085738941976");
    assert.equal(normalizePhone("81236023387"), "081236023387");
  });

  test("nomor yang sudah benar tidak diubah", () => {
    assert.equal(normalizePhone("081236023387"), "081236023387");
    assert.equal(normalizePhone("+6281236023387"), "+6281236023387");
    assert.equal(normalizePhone("6281236023387"), "6281236023387");
  });

  test("tanggal lahir bentrok kini jadi CATATAN dengan kedua nilainya", () => {
    // NIK menang — nomornya diterbitkan Dukcapil dan tanggalnya terkunci di
    // dalam strukturnya; kolom sebelahnya diketik ulang manusia. Tapi selisih
    // TIDAK disembunyikan, supaya peninjau bisa membalik keputusan per-orang.
    const h = sheet(baris({ 6: "1982-06-10" }));
    assert.equal(h.issues.length, 0);
    assert.equal(h.rows.length, 1);
    assert.equal(h.rows[0].birthDate!.toISOString().slice(0, 10), "1986-07-31");
    const n = h.rows[0].notes.join(" ");
    assert.match(n, /1986-07-31/);
    assert.match(n, /1982-06-10/);
  });

  test("tanpa NIK, tanggal ketikan tetap dipakai apa adanya", () => {
    const h = sheet(baris({ 4: "", 6: "1982-06-10" }));
    assert.equal(h.issues.length, 0);
    assert.equal(h.rows[0].birthDate!.toISOString().slice(0, 10), "1982-06-10");
    assert.equal(h.rows[0].identityNumber, null);
  });
});
