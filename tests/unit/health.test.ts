import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Berkas pemasangan tidak bisa diuji dengan menjalankannya di sini — yang bisa
// dijaga adalah sifat-sifat yang kalau hilang menimbulkan kerusakan diam-diam.
// Ketiganya pernah benar-benar terjadi atau nyaris terjadi di proyek ini.

describe("docker-compose menjaga tiga hal yang pernah menggigit", () => {
  const compose = readFileSync("docker-compose.yml", "utf8");

  test("NAMA PROYEK ditulis eksplisit", () => {
    // Tanpa `name:`, Compose menurunkan nama proyek dari NAMA FOLDER. Folder
    // proyek ini SUDAH PERNAH pindah (ke APP-Perumnet/), dan di mesin
    // pengembangan masih tersisa volume `prtgperumnet_perumnet-pgdata` dari
    // zaman namanya "PRTG PerumNet" — bekas kejadian yang sama: database naik
    // seolah-olah seluruh datanya lenyap.
    assert.match(compose, /^name:\s*perumnet-crm\s*$/m);
  });

  test("port database TIDAK dipetakan ke host", () => {
    // Yang perlu menghubungi database cuma app, lewat jaringan internal
    // Compose. Membuka 5432 berarti membuka database ke seluruh jaringan
    // tempat VPS itu berada.
    const blokDb = compose.slice(compose.indexOf("db:"), compose.indexOf("app:"));
    assert.equal(/^\s*-\s*"?\d*:?5432/m.test(blokDb), false, "5432 tidak boleh terpetakan");
  });

  test("lampiran punya volume — bukan hilang tiap kali citra diperbarui", () => {
    // Isinya foto pegawai, bukti pekerjaan, dan tanda tangan. Itu DATA, dan
    // tidak ada salinannya di tempat lain.
    assert.match(compose, /uploads:\/app\/uploads/);
  });
});

describe("Dockerfile tidak memanggang rahasia dan tidak menyentuh skema", () => {
  const dockerfile = readFileSync("Dockerfile", "utf8");
  const dockerignore = readFileSync(".dockerignore", "utf8");

  test(".env TIDAK ikut masuk citra", () => {
    // Citra berpindah tangan — registry, VPS, laptop orang lain — dan apa pun
    // yang ikut di dalamnya ikut berpindah. .env memuat sandi mailserver,
    // kunci mailcow, dan kredensial database.
    assert.match(dockerignore, /^\.env$/m);
    assert.match(dockerignore, /^\.env\.\*$/m);
  });

  test("folder uploads TIDAK ikut masuk citra", () => {
    assert.match(dockerignore, /^uploads$/m);
  });

  test("TIDAK ada migrasi skema yang berjalan sendiri saat kontainer menyala", () => {
    // Kalau ada, setiap restart — termasuk restart otomatis saat kontainer
    // mati — ikut menyentuh skema database. Perubahan skema dilakukan sadar,
    // sekali, oleh orang yang tahu sedang mengubah apa.
    const cmd = dockerfile.slice(dockerfile.lastIndexOf("CMD"));
    assert.equal(/migrate|db push/.test(cmd), false, "CMD tidak boleh menyentuh skema");
    assert.equal(/ENTRYPOINT/.test(dockerfile), false, "tidak ada entrypoint yang bisa menyelipkannya");
  });

  test("berjalan sebagai pengguna biasa, bukan root", () => {
    assert.match(dockerfile, /^USER nextjs$/m);
  });

  test("DATABASE_URL saat build hanya nilai palsu", () => {
    // `next build` menuntut variabel ini ADA, bukan menyambung. Nilai
    // sungguhan di sini berarti kredensial ikut terpanggang ke lapisan citra.
    const baris = /^ENV DATABASE_URL=(.+)$/m.exec(dockerfile);
    assert.notEqual(baris, null);
    assert.match(baris![1], /localhost/, "harus jelas-jelas palsu");
  });
});
