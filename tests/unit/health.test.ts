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

describe("layanan tools punya lingkungan yang sama dengan app", () => {
  const compose = readFileSync("docker-compose.yml", "utf8");
  const blok = (nama: string) => {
    const i = compose.indexOf(`\n  ${nama}:`);
    const sisa = compose.slice(i + 1);
    const j = sisa.search(/\n  [a-z]/);
    return j > 0 ? sisa.slice(0, j) : sisa;
  };

  test("setiap variabel yang dipakai app juga ada di tools", () => {
    // Perkakas administratif menjalankan pekerjaan yang menyentuh sistem luar:
    // mendorong tag ke mailcow, mereset password surel, mengirim email. Tanpa
    // variabelnya, semuanya gagal DIAM-DIAM — mailcow terbaca sebagai "nol
    // kotak surat", lalu perintahnya melaporkan "0 didorong, 0 gagal" seolah
    // memang tidak ada yang perlu dikerjakan.
    //
    // Itu benar-benar terjadi saat mendorong tag pertama kali dari server.
    const kunci = (s: string) => [...s.matchAll(/^\s{6}([A-Z][A-Z0-9_]+):/gm)].map((m) => m[1]);
    const app = kunci(blok("app"));
    assert.equal(app.length > 5, true, "blok app tidak terbaca");
    // Variabel yang hilang dari SEMUA layanan tidak akan tertangkap
    // perbandingan di bawah — jadi yang menentukan sambungan luar disebut
    // namanya di sini.
    for (const wajib of ["MAILCOW_API_KEY", "MIKROTIK_POP1_CRED", "MIKROTIK_INSECURE_TLS", "SMTP_PASSWORD"]) {
      assert.equal(app.includes(wajib), true, `${wajib} tidak diteruskan ke app`);
    }
    // Worker ikut diperiksa: ia menyentuh router MikroTik dan penjadwal, dan
    // variabel yang hilang di sana juga gagal diam-diam.
    for (const layanan of ["tools", "worker"]) {
      const punya = new Set(kunci(blok(layanan)));
      const hilang = app.filter((k) => !punya.has(k));
      assert.deepEqual(hilang, [], `variabel ini tidak diteruskan ke ${layanan}: ${hilang.join(", ")}`);
    }
  });
});
