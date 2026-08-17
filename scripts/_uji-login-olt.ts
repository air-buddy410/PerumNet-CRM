/**
 * Menguji kredensial telnet OLT — tanpa pernah menampilkannya.
 *
 *   npx tsx scripts/_uji-login-olt.ts
 *   npx tsx scripts/_uji-login-olt.ts 192.168.100.60
 *
 * Untuk tiap OLT: baca nama env var-nya, sambung, masuk, jalankan SATU
 * perintah baca, lalu keluar. Yang dilaporkan cuma berhasil/gagal berikut
 * sebabnya — isi kredensialnya tidak pernah dicetak, bahkan sebagian.
 *
 * HANYA MEMBACA.
 */
import { db } from "@/lib/db";
import { bacaKredensialOlt, jalankanPerintah, OltTelnetError } from "@/lib/olt-telnet";

const hanya = process.argv[2];

async function main() {
  const olts = await db.oltDevice.findMany({
    select: { name: true, vendor: true, model: true, credentialRef: true, networkDevice: { select: { hostname: true } } },
    orderBy: { name: "asc" },
  });

  console.log("═══ UJI LOGIN OLT ═══");
  console.log("Kredensial tidak pernah dicetak. Hanya berhasil/gagal.\n");

  for (const o of olts) {
    const host = o.networkDevice.hostname;
    if (hanya && host !== hanya) continue;
    const label = (o.name ?? host).padEnd(23);

    let kred;
    try {
      kred = bacaKredensialOlt(o.credentialRef);
    } catch (e) {
      console.log(`  ✗ ${label} ${(e as Error).message}`);
      continue;
    }

    // ZTE: `show version` ada di semua model. HSGQ berbeda, jadi dipakai
    // perintah yang paling netral dan biarkan keluarannya yang bicara.
    const perintah = o.vendor === "ZTE" ? ["show version"] : ["?"];
    try {
      const keluaran = await jalankanPerintah({ host, user: kred.user, password: kred.password }, perintah);
      const cuplik = keluaran.replace(/\s+/g, " ").trim().slice(0, 70);
      console.log(`  ✓ ${label} MASUK sebagai "${kred.user}" — jawaban: ${cuplik || "(kosong)"}`);
    } catch (e) {
      const pesan = e instanceof OltTelnetError ? e.message : String(e);
      console.log(`  ✗ ${label} ${pesan}`);
    }
  }
  console.log();
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
