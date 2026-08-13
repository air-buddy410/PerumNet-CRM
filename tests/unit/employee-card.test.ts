import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  cardNumberFor,
  tokenRejection,
  cardInvalidReason,
  isCardValid,
  statusChangeRejection,
  publicVerification,
  verificationUrl,
  CARD_STATUS_LABELS,
} from "@/lib/employee-card";

const NOW = new Date("2026-08-13T10:00:00");

const valid = {
  status: "ACTIVE",
  expiresAt: null as Date | null,
  employeeActive: true,
  userFrozenAt: null as Date | null,
  userArchived: false,
};

describe("cardNumberFor", () => {
  test("nomor tercetak memuat NIK dan urutan", () => {
    assert.equal(cardNumberFor("EMP-001", 1), "KP-EMP-001-01");
    assert.equal(cardNumberFor("emp-002", 12), "KP-EMP-002-12");
  });
});

describe("tokenRejection — isi QR tidak boleh bermakna", () => {
  const emp = { employeeNo: "EMP-001", fullName: "Teguh Santoso" };

  test("token acak panjang diterima", () => {
    assert.equal(tokenRejection("k7Jd8xQm2VpL9nRt4YwZ0aBcEfGhIjKlMnOpQrSt", emp), null);
  });

  test("token pendek ditolak — mudah ditebak", () => {
    assert.match(tokenRejection("abc123", emp) ?? "", /terlalu pendek/);
  });

  test("token yang memuat NIK DITOLAK", () => {
    // Kartu dipakai di tempat umum sepanjang hari. Kode yang bermakna membuat
    // siapa pun yang memotretnya bisa menyusun data pegawai tanpa menyentuh
    // sistem kita.
    const r = tokenRejection("xxxxxxxxxxxxxxxxEMP-001xxxxxxxxxxxxxxxx", emp);
    assert.match(r ?? "", /tidak boleh memuat NIK/);
  });

  test("token yang memuat nama depan DITOLAK", () => {
    const r = tokenRejection("aaaaaaaaaaaaaaaateguhaaaaaaaaaaaaaaaaaaa", emp);
    assert.match(r ?? "", /tidak boleh memuat nama/);
  });

  test("nama depan sangat pendek tidak memicu penolakan palsu", () => {
    // "Bu" akan cocok dengan terlalu banyak token acak.
    const pendek = { employeeNo: "EMP-009", fullName: "Bu Sri" };
    assert.equal(tokenRejection("k7Jd8xQm2VpL9nRt4YwZ0aBcEfGhIjKlMnOpQrSt", pendek), null);
  });
});

describe("cardInvalidReason — kapan kartu berhenti berlaku", () => {
  test("kartu aktif tanpa masa berlaku → berlaku", () => {
    assert.equal(cardInvalidReason(valid, NOW), null);
    assert.equal(isCardValid(valid, NOW), true);
  });

  test("status selain ACTIVE tidak berlaku", () => {
    for (const s of ["LOST", "REVOKED", "REPLACED"]) {
      const r = cardInvalidReason({ ...valid, status: s }, NOW);
      assert.notEqual(r, null, `${s} harus tidak berlaku`);
      assert.match(r ?? "", new RegExp(CARD_STATUS_LABELS[s as "LOST"]));
    }
  });

  test("kartu kedaluwarsa tidak berlaku", () => {
    const r = cardInvalidReason({ ...valid, expiresAt: new Date("2026-08-01") }, NOW);
    assert.match(r ?? "", /Masa berlaku kartu habis/);
  });

  test("masa berlaku yang belum lewat tetap berlaku", () => {
    assert.equal(cardInvalidReason({ ...valid, expiresAt: new Date("2027-01-01") }, NOW), null);
  });

  test("pegawai nonaktif → kartunya mati", () => {
    assert.match(cardInvalidReason({ ...valid, employeeActive: false }, NOW) ?? "", /tidak aktif/);
  });

  test("AKUN BEKU (Fase 42) otomatis mematikan kartu", () => {
    // Inilah yang paling sering terlewat pada sistem akses: orangnya sudah
    // tidak bekerja, kartunya masih membuka pintu berbulan-bulan.
    const r = cardInvalidReason({ ...valid, userFrozenAt: new Date("2026-07-01") }, NOW);
    assert.match(r ?? "", /beku sejak/);
  });

  test("AKUN DIARSIPKAN (Fase 47) otomatis mematikan kartu", () => {
    assert.match(cardInvalidReason({ ...valid, userArchived: true }, NOW) ?? "", /diarsipkan/);
  });

  test("pegawai tanpa akun sistem tetap bisa berkartu", () => {
    // Banyak pegawai lapangan memang tidak punya akun CRM.
    assert.equal(cardInvalidReason({ ...valid, userFrozenAt: null, userArchived: false }, NOW), null);
  });
});

describe("statusChangeRejection — status akhir tidak bisa dibalik", () => {
  test("kartu aktif boleh dinyatakan hilang", () => {
    assert.equal(statusChangeRejection("ACTIVE", "LOST"), null);
  });

  test("kartu yang sudah hilang TIDAK bisa diubah lagi", () => {
    // Mengaktifkan kembali kartu hilang membuat dua kartu fisik berlaku
    // bersamaan — dan yang satu ada di tangan entah siapa.
    const r = statusChangeRejection("LOST", "REVOKED");
    assert.match(r ?? "", /status akhir tidak bisa diubah/);
  });

  test("kartu yang sudah diganti tidak bisa dicabut lagi", () => {
    assert.notEqual(statusChangeRejection("REPLACED", "REVOKED"), null);
  });
});

describe("publicVerification — hanya yang perlu, tidak lebih", () => {
  const emp = { fullName: "Teguh Santoso", jobTitle: "Teknisi", photoUrl: "/api/files/p1" };
  const card = { ...valid, cardNumber: "KP-EMP-001-01" };

  test("kartu berlaku → nama, jabatan, foto, nomor kartu", () => {
    const v = publicVerification(card, emp, NOW);
    assert.equal(v.valid, true);
    assert.equal(v.employeeName, "Teguh Santoso");
    assert.equal(v.jobTitle, "Teknisi");
    assert.equal(v.cardNumber, "KP-EMP-001-01");
  });

  test("KARTU TIDAK BERLAKU tidak membocorkan nama pemiliknya", () => {
    // Kalau kartunya dicuri, halaman verifikasi tidak boleh berubah menjadi
    // cara mengetahui milik siapa kartu itu.
    const v = publicVerification({ ...card, status: "LOST" }, emp, NOW);
    assert.equal(v.valid, false);
    assert.equal(v.employeeName, null);
    assert.equal(v.photoUrl, null);
    assert.match(v.reason ?? "", /Hilang/);
    // Nomor kartu tetap ditampilkan — itu tercetak di kartunya sendiri, jadi
    // pemindainya sudah melihatnya.
    assert.equal(v.cardNumber, "KP-EMP-001-01");
  });

  test("token tak dikenal dijawab, bukan didiamkan", () => {
    // Pelanggan justru perlu tahu bahwa kartu yang ditunjukkan tidak dikenali.
    const v = publicVerification(null, null, NOW);
    assert.equal(v.valid, false);
    assert.match(v.reason ?? "", /tidak dikenal/);
    assert.equal(v.employeeName, null);
  });

  test("jawaban TIDAK PERNAH memuat medan data pribadi lain", () => {
    // Penjaga bentuk: kalau kelak ada yang menambahkan alamat atau telepon ke
    // sini, tes ini gagal.
    const v = publicVerification(card, emp, NOW);
    assert.deepEqual(
      Object.keys(v).sort(),
      ["cardNumber", "employeeName", "jobTitle", "photoUrl", "reason", "valid"]
    );
  });
});

describe("verificationUrl", () => {
  test("menyusun alamat halaman verifikasi", () => {
    assert.equal(verificationUrl("https://crm.perumnet.id", "tok123"), "https://crm.perumnet.id/verify/tok123");
  });

  test("garis miring berlebih di appUrl tidak menghasilkan alamat ganda", () => {
    assert.equal(verificationUrl("https://crm.perumnet.id/", "tok123"), "https://crm.perumnet.id/verify/tok123");
  });
});
