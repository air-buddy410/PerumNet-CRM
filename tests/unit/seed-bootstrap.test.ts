import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { localLoginBlocker } from "@/lib/oidc-rules";

// Menjaga satu sifat yang tidak bisa diuji dengan menjalankan apa pun: apakah
// pemasangan BARU bisa dimasuki sama sekali.
//
// Ini pernah menggigit sungguhan. Pemasangan pertama di server (2026-08-13)
// terkunci total: AUTH_PROVIDER=MAILSERVER, login admin dialihkan ke
// mailserver, sementara alamat mailserver-nya hanya bisa didaftarkan lewat
// halaman yang butuh login. Buntu di kedua ujung. Jalan keluarnya cuma
// menyunting database langsung.
//
// Di laptop tidak pernah kelihatan — di sana nilainya kebetulan sudah disetel
// manual sejak Fase 45, jadi seluruh pengembangan berjalan di atas keadaan
// yang tidak pernah dihasilkan seed.

describe("pemasangan baru harus bisa dimasuki", () => {
  const seed = readFileSync("prisma/seed.ts", "utf8");
  // Batas akhirnya dicari MULAI dari blok admin — `userRole.upsert` muncul
  // beberapa kali di berkas ini, dan yang pertama justru sebelum blok admin.
  const mulai = seed.indexOf('where: { username: "admin" }');
  const blokAdmin = seed.slice(mulai, seed.indexOf("userRole.upsert", mulai));

  test("seed memberi admin jalur darurat sejak awal", () => {
    // Pintu darurat harus ada sejak menit pertama — bukan dipasang setelah
    // rumahnya terkunci.
    assert.match(blokAdmin, /allowLocalLogin:\s*true/, "admin harus allowLocalLogin sejak seed");
  });

  test("berlaku juga saat seed dijalankan ULANG pada database lama", () => {
    // Cabang `update` ikut menyetelnya. Tanpa itu, pemasangan yang terlanjur
    // punya admin tanpa jalur darurat tetap terkunci meski seed diulang.
    const update = blokAdmin.slice(blokAdmin.indexOf("update:"), blokAdmin.indexOf("create:"));
    assert.match(update, /allowLocalLogin:\s*true/, "cabang update harus ikut menyetelnya");
  });

  test("dan jalur itu memang tidak diblokir di mode MAILSERVER", () => {
    // Dua hal harus benar bersamaan: akunnya ditandai darurat, DAN aturannya
    // mengizinkan. Salah satu saja hilang, pemasangan baru terkunci lagi.
    assert.equal(localLoginBlocker("MAILSERVER", { allowLocalLogin: true }), null);
    assert.equal(localLoginBlocker("OIDC", { allowLocalLogin: true }), null);
  });
});

describe("divisi di seed mengikuti organisasi yang sebenarnya", () => {
  const seed = readFileSync("prisma/seed.ts", "utf8");
  const daftar = seed.slice(seed.indexOf("const DIVISIONS"), seed.indexOf("RETIRED_DIVISIONS"));

  test("memuat divisi PerumNet yang nyata", () => {
    // Divisi menentukan grup Authentik dan tag kotak surat. Daftar yang tidak
    // mencerminkan organisasi akan terus terasa janggal di kedua sistem itu —
    // dan pemasangan baru mana pun akan menolak berkas kepegawaian dari HRD
    // karena nama divisinya tidak dikenal.
    for (const nama of [
      "Network Operation Center",
      "Network Operation Field",
      "Operation Access & Customer",
      "Finance & Accounting",
    ]) {
      assert.match(daftar, new RegExp(nama.replace(/[&]/g, "\\&")), `"${nama}" hilang dari seed`);
    }
  });

  test("nama tebakan lama tidak dihidupkan lagi", () => {
    // IT/DevOps, Project, dan Warehouse tidak ada orangnya sama sekali.
    for (const usang of ["IT/DevOps", "Project", "Warehouse", "Customer Service"]) {
      assert.equal(daftar.includes(`"${usang}"`), false, `"${usang}" seharusnya sudah pensiun`);
    }
  });

  test("yang pensiun DINONAKTIFKAN, bukan dihapus", () => {
    // Menghapus tidak bisa dibatalkan, dan akan ditolak foreign key di tengah
    // seed bila ada baris yang terlanjur menunjuknya.
    assert.match(seed, /RETIRED_DIVISIONS[\s\S]{0,200}isActive:\s*false/);
    assert.equal(/division\.delete/.test(seed), false, "seed tidak boleh menghapus divisi");
  });
});
