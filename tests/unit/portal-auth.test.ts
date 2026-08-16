import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  bolehMencoba, setelahGagal, setelahBerhasil, rapikanNamaMasuk, sandiLemah,
  BATAS_GAGAL, PESAN_GAGAL,
} from "@/lib/portal-auth";

const SEKARANG = new Date("2026-08-17T07:00:00Z");
const nanti = (menit: number) => new Date(SEKARANG.getTime() + menit * 60_000);
const tadi = (menit: number) => new Date(SEKARANG.getTime() - menit * 60_000);

describe("bolehMencoba", () => {
  test("akun nonaktif menghasilkan kalimat yang SAMA dengan nomor tak dikenal", () => {
    // Membedakan keduanya memberi tahu penebak nomor layanan mana yang punya
    // akun — dan nomor layanan tercetak di setiap tagihan, jadi ia bukan
    // rahasia yang bisa diandalkan.
    const h = bolehMencoba({ isActive: false, failedCount: 0, lockedUntil: null }, SEKARANG);
    assert.equal(h.boleh, false);
    assert.equal(h.boleh === false && h.pesan, PESAN_GAGAL);
  });

  test("akun terkunci menyebut sisa waktunya", () => {
    // Ini BOLEH disebutkan: yang sampai di sini sudah memasukkan nama yang
    // benar berkali-kali, jadi tidak ada yang bocor — dan tanpa penjelasan ini
    // ia akan mengira akunnya rusak.
    const h = bolehMencoba({ isActive: true, failedCount: 5, lockedUntil: nanti(10) }, SEKARANG);
    assert.equal(h.boleh, false);
    assert.match(h.boleh === false ? h.pesan : "", /10 menit/);
  });

  test("kunci yang sudah lewat tidak menahan", () => {
    const h = bolehMencoba({ isActive: true, failedCount: 5, lockedUntil: tadi(1) }, SEKARANG);
    assert.equal(h.boleh, true);
  });
});

describe("setelahGagal", () => {
  test("mengunci tepat pada percobaan ke-lima", () => {
    const empat = setelahGagal({ isActive: true, failedCount: 3, lockedUntil: null }, SEKARANG);
    assert.equal(empat.lockedUntil, null);
    const lima = setelahGagal({ isActive: true, failedCount: BATAS_GAGAL - 1, lockedUntil: null }, SEKARANG);
    assert.ok(lima.lockedUntil);
  });

  test("hitungan direset setelah kunci lama kedaluwarsa", () => {
    // Tanpa ini, akun yang pernah terkunci akan terkunci lagi hanya karena
    // satu salah ketik berbulan-bulan kemudian.
    const h = setelahGagal({ isActive: true, failedCount: 5, lockedUntil: tadi(60) }, SEKARANG);
    assert.equal(h.failedCount, 1);
    assert.equal(h.lockedUntil, null);
  });

  test("berhasil membersihkan hitungan", () => {
    assert.deepEqual(setelahBerhasil(), { failedCount: 0, lockedUntil: null });
  });
});

describe("rapikanNamaMasuk", () => {
  test("spasi, huruf kecil, dan tanda tak terlihat tidak menghalangi", () => {
    // Orang menyalin nomor dari tagihan berikut tanda arah teks — kekeliruan
    // yang sama sudah menggigit di rekonsiliasi Fase 83.
    assert.equal(rapikanNamaMasuk(" pn100012524 "), "PN100012524");
    assert.equal(rapikanNamaMasuk("‎PN100012524"), "PN100012524");
  });
});

describe("sandiLemah", () => {
  test("panjang minimum, dan bukan angka semua", () => {
    assert.ok(sandiLemah("abc123"));
    assert.ok(sandiLemah("12345678"));
    assert.equal(sandiLemah("perumnet2026"), null);
  });
});
