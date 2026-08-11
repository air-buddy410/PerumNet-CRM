// Mendaftarkan router MikroTik untuk monitor PPPoE — Fase 24.
//
// Belum ada halaman untuk ini, jadi pendaftaran lewat skrip. Yang disimpan ke
// database hanya ALAMAT dan NAMA env var kredensialnya — password tidak pernah
// masuk database, mengikuti keputusan Fase 13.
//
//   ROUTER_HOST=perumnet-pop1 \
//   ROUTER_URL=https://10.0.0.1 \
//   ROUTER_CRED_ENV=MIKROTIK_POP1_CRED \
//   npx tsx scripts/register-router.ts
//
// Uji koneksi tanpa menyimpan apa pun:
//   ROUTER_URL=... ROUTER_CRED_ENV=... npx tsx scripts/register-router.ts --test

import { db } from "@/lib/db";
import { fetchPppoeState, insecureTlsEnabled } from "@/lib/mikrotik";

const host = process.env.ROUTER_HOST ?? "";
const url = process.env.ROUTER_URL ?? "";
const credEnv = process.env.ROUTER_CRED_ENV ?? "";
const siteCode = process.env.ROUTER_SITE ?? "";
const testOnly = process.argv.includes("--test");

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  if (!url) fail("ROUTER_URL wajib diisi, contoh https://10.0.0.1");
  if (!credEnv) fail("ROUTER_CRED_ENV wajib diisi — NAMA env var, bukan passwordnya.");
  if (!process.env[credEnv]) {
    fail(
      `Env var ${credEnv} belum di-set. Isi di .env dengan bentuk "user:password", ` +
        `memakai akun read-only. Berkas .env tidak ikut ke git.`
    );
  }

  console.log(`\nMenguji koneksi ke ${url} …`);
  console.log(
    insecureTlsEnabled()
      ? "  (verifikasi TLS DIMATIKAN lewat MIKROTIK_INSECURE_TLS=1)"
      : "  (verifikasi TLS aktif — sertifikat router harus tepercaya)"
  );

  try {
    const { counts } = await fetchPppoeState({ baseUrl: url, credentialRef: credEnv });
    console.log(
      `✓ Terhubung — total ${counts.total} · aktif ${counts.online} · offline ${counts.offline} · disable ${counts.disabled}`
    );
  } catch (error) {
    fail(
      `Gagal terhubung: ${error instanceof Error ? error.message : String(error)}\n\n` +
        `  Periksa: layanan www-ssl aktif di router, akun read-only benar,\n` +
        `  dan bila sertifikatnya self-signed jalankan ulang dengan MIKROTIK_INSECURE_TLS=1`
    );
  }

  if (testOnly) {
    console.log("\nMode uji — tidak ada yang disimpan.\n");
    return;
  }
  if (!host) fail("ROUTER_HOST wajib diisi untuk menyimpan (nama perangkat).");

  const site = siteCode
    ? await db.networkSite.findUnique({ where: { siteCode } })
    : await db.networkSite.findFirst();
  if (!site) fail("Belum ada NetworkSite. Buat site dulu lewat NOC → Sites.");

  const device = await db.networkDevice.upsert({
    where: { hostname: host },
    update: { deviceType: "ROUTER", vendor: "MikroTik" },
    create: { hostname: host, deviceType: "ROUTER", vendor: "MikroTik", siteId: site.id },
  });

  const router = await db.mikrotikRouter.upsert({
    where: { networkDeviceId: device.id },
    update: { managementUrl: url, credentialRef: credEnv, isPollingEnabled: true },
    create: {
      networkDeviceId: device.id,
      managementUrl: url,
      credentialRef: credEnv,
      isPollingEnabled: true,
    },
  });

  console.log(`\n✓ Router "${host}" terdaftar di site ${site.name}.`);
  console.log(`  Alamat        : ${router.managementUrl}`);
  console.log(`  Kredensial    : env ${router.credentialRef} (nilainya tidak disimpan)`);
  console.log(`  Interval poll : ${router.pollIntervalSec} detik`);
  console.log(`\n  Jalankan worker agar status ditarik otomatis: npm run worker\n`);
}

main()
  .catch((e) => fail(e instanceof Error ? e.message : String(e)))
  .finally(() => db.$disconnect());
