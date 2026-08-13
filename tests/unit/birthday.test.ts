import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isBirthdayToday,
  greetingFor,
  dayMonthOf,
  birthdayHeadline,
  OFFICE_TZ_OFFSET_HOURS,
} from "@/lib/birthday";
import { initialsOf, avatarPath, newAvatarToken, avatarRejection } from "@/lib/avatar";

const lahir = (iso: string) => new Date(iso);

describe("ulang tahun jatuh pada hari yang benar", () => {
  test("tanggal & bulan sama → hari ini", () => {
    assert.equal(isBirthdayToday(lahir("1990-08-13T00:00:00Z"), new Date("2026-08-13T04:00:00Z")), true);
  });

  test("bulan sama tapi tanggal beda → bukan hari ini", () => {
    assert.equal(isBirthdayToday(lahir("1990-08-12T00:00:00Z"), new Date("2026-08-13T04:00:00Z")), false);
  });

  test("tahun lahir tidak berpengaruh", () => {
    for (const th of ["1965", "1990", "2004"]) {
      assert.equal(isBirthdayToday(lahir(`${th}-08-13T00:00:00Z`), new Date("2026-08-13T04:00:00Z")), true);
    }
  });

  test("BERGANTI TENGAH MALAM WITA, bukan UTC", () => {
    // 13 Agustus 17:00 UTC sudah 14 Agustus di Bali. Memakai UTC membuat
    // ucapan selamat muncul sehari terlambat setiap kali — di sore hari,
    // ketika orangnya sudah pulang.
    assert.equal(OFFICE_TZ_OFFSET_HOURS, 8);
    const sore = new Date("2026-08-13T17:00:00Z"); // = 14 Agustus 01:00 WITA
    assert.equal(isBirthdayToday(lahir("1990-08-14T00:00:00Z"), sore), true);
    assert.equal(isBirthdayToday(lahir("1990-08-13T00:00:00Z"), sore), false);
  });

  test("dayMonthOf memakai jam kantor", () => {
    assert.deepEqual(dayMonthOf(new Date("2026-08-13T17:00:00Z")), { day: 14, month: 8 });
  });
});

describe("29 FEBRUARI tetap diucapkan selamat", () => {
  test("pada tahun kabisat, jatuh di 29 Februari", () => {
    assert.equal(isBirthdayToday(lahir("2000-02-29T00:00:00Z"), new Date("2028-02-29T04:00:00Z")), true);
  });

  test("pada tahun BIASA, jatuh di 28 Februari", () => {
    // Tanpa aturan ini, orang yang lahir di tanggal kabisat tidak pernah
    // diucapkan selamat selama tiga tahun berturut-turut — justru kebalikan
    // dari maksud fitur ini.
    assert.equal(isBirthdayToday(lahir("2000-02-29T00:00:00Z"), new Date("2026-02-28T04:00:00Z")), true);
    assert.equal(isBirthdayToday(lahir("2000-02-29T00:00:00Z"), new Date("2026-03-01T04:00:00Z")), false);
  });

  test("yang lahir 28 Februari tidak ikut bergeser", () => {
    assert.equal(isBirthdayToday(lahir("1990-02-28T00:00:00Z"), new Date("2028-02-29T04:00:00Z")), false);
  });

  test("tahun kelipatan 100 bukan kabisat, kecuali kelipatan 400", () => {
    assert.equal(isBirthdayToday(lahir("2000-02-29T00:00:00Z"), new Date("2100-02-28T04:00:00Z")), true);
  });
});

describe("ucapan selamat", () => {
  test("menyebut nama depan, bukan nama lengkap", () => {
    assert.match(greetingFor("I Dewa Gede Budi Dharma Prabhawa"), /\bI\b/);
    assert.match(greetingFor("Jumroni Ayubi"), /Jumroni/);
  });

  test("TETAP SAMA setiap kali dipanggil", () => {
    // Ucapan yang berganti tiap kali layar disegarkan terlihat seperti mesin,
    // bukan seperti perhatian.
    const a = greetingFor("Jumroni Ayubi");
    for (let i = 0; i < 5; i++) assert.equal(greetingFor("Jumroni Ayubi"), a);
  });

  test("orang berbeda tidak selalu mendapat kalimat sama", () => {
    const nama = ["Jumroni Ayubi", "Ratna Suari", "Supratman", "Ni Komang Ayu Tri Sentosa"];
    assert.equal(new Set(nama.map(greetingFor)).size > 1, true);
  });

  test("TIDAK PERNAH menyebut ANGKA usia", () => {
    // Umur di papan pengumuman kantor adalah bahan canggung yang tidak diminta
    // siapa pun, dan membuka pintu ke pembedaan berdasarkan usia.
    //
    // Yang dilarang ANGKA-nya, bukan katanya: "panjang umur" dan "bertambah
    // usia" adalah doa yang tidak membocorkan apa pun. Tes yang melarang
    // katanya akan memaksa ucapannya jadi kaku tanpa menambah perlindungan.
    for (const n of ["Jumroni Ayubi", "Ratna Suari", "Supratman", "Budi"]) {
      const u = greetingFor(n);
      assert.equal(/\d/.test(u), false, `ucapan tidak boleh memuat angka: "${u}"`);
    }
  });
});

describe("judul panel", () => {
  const orang = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      employeeId: `e${i}`, fullName: `Orang ${i}`, jobTitle: null,
      divisionName: null, avatarUrl: null,
    }));

  test("kosong → tidak ada judul, panel tidak perlu tampil", () => {
    assert.equal(birthdayHeadline([]), null);
  });

  test("satu orang → namanya disebut", () => {
    assert.match(birthdayHeadline(orang(1))!, /Orang 0/);
  });

  test("banyak orang → jumlahnya, bukan daftar nama di judul", () => {
    assert.match(birthdayHeadline(orang(3))!, /3 rekan/);
  });
});

describe("foto profil", () => {
  test("inisial dari nama, untuk saat foto belum ada", () => {
    // Jatuhnya HARUS ke inisial, bukan ke foto resmi kartu pegawai —
    // menampilkan foto resmi di tempat foto profil membuat orang mengira foto
    // kartunya bisa mereka ganti sendiri.
    assert.equal(initialsOf("Jumroni Ayubi"), "JA");
    assert.equal(initialsOf("I Dewa Gede Budi Dharma Prabhawa"), "IP");
    assert.equal(initialsOf("Supratman"), "SU");
    assert.equal(initialsOf("   "), "?");
  });

  test("alamat foto memakai token, bukan id pengguna", () => {
    assert.equal(avatarPath(null), null);
    assert.equal(avatarPath("abc"), "/api/avatar/abc");
  });

  test("token acak, panjang, dan tidak pernah sama", () => {
    const a = newAvatarToken();
    const b = newAvatarToken();
    assert.notEqual(a, b);
    assert.equal(a.length >= 32, true);
    assert.equal(/^[A-Za-z0-9_-]+$/.test(a), true, "aman dipakai di URL");
  });

  test("berkas yang bukan gambar ditolak", () => {
    assert.notEqual(avatarRejection({ type: "application/pdf", size: 1000 }), null);
    assert.notEqual(avatarRejection({ type: "image/jpeg", size: 0 }), null);
    assert.notEqual(avatarRejection({ type: "image/jpeg", size: 9_000_000 }), null);
    assert.equal(avatarRejection({ type: "image/jpeg", size: 200_000 }), null);
  });
});
