/**
 * Penjalan tes integrasi.
 *
 * Tanggung jawabnya tiga: menurunkan URL database tes dari DATABASE_URL yang
 * ada, memastikan skema di sana mutakhir, lalu menjalankan berkas tes dengan
 * DATABASE_URL yang sudah ditimpa.
 *
 * Penimpaan dilakukan di sini, pada proses anak — bukan di dalam tiap berkas
 * tes. Prisma membuat kliennya saat modul dimuat, jadi menimpa di dalam tes
 * berarti setiap berkas harus memakai dynamic import dan satu kelalaian sudah
 * cukup untuk menyentuh database dev.
 */
import { spawnSync } from "node:child_process";
import { config } from "dotenv";
import { withDatabaseName, testDatabaseName, databaseNameOf } from "../tests/integration/db";

config();

const devUrl = process.env.DATABASE_URL;
if (!devUrl) {
  console.error("DATABASE_URL tidak ditemukan di .env");
  process.exit(1);
}

const testName = testDatabaseName(devUrl);
const testUrl = withDatabaseName(devUrl, testName);
const env = { ...process.env, DATABASE_URL: testUrl };

// Hanya nama database yang dicetak — URL memuat kredensial.
console.log(`Database tes  : ${testName}`);
console.log(`Database dev  : ${databaseNameOf(devUrl)} (tidak disentuh)\n`);

// `prisma db push` membuat database bila belum ada, sekaligus menyamakan
// skemanya. Dijalankan tiap kali supaya tes tidak pernah berjalan di atas
// skema basi setelah model berubah.
console.log("Menyiapkan skema...");
const push = spawnSync(
  "npx",
  ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"],
  { env, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" }
);
if (push.status !== 0) {
  console.error(push.stdout ?? "");
  console.error(push.stderr ?? "");
  process.exit(1);
}

const pattern = process.argv[2] ?? "tests/integration/**/*.test.ts";
console.log(`Menjalankan ${pattern}\n`);
// SATU berkas pada satu waktu. node:test menjalankan berkas secara paralel
// secara bawaan, sedangkan seluruh berkas di sini berbagi SATU database:
// reset milik satu berkas akan menghapus data berkas lain di tengah jalan.
// Ini pernah terjadi — seluruh suite ambruk begitu berkas ketiga ditambahkan.
const run = spawnSync("tsx", ["--test", "--test-concurrency=1", pattern], {
  env,
  stdio: "inherit",
});
process.exit(run.status ?? 1);
