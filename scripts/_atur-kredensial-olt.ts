/**
 * Menunjuk NAMA env var kredensial pada tiap OLT.
 *
 *   npx tsx scripts/_atur-kredensial-olt.ts
 *   npx tsx scripts/_atur-kredensial-olt.ts --terapkan
 *
 * TIDAK MENYIMPAN SATU PUN RAHASIA. Yang ditulis ke basis data hanya NAMA
 * variabelnya — `OLT_PSG_CRED` dan seterusnya. Nilainya hidup di `.env` server
 * dan tidak pernah menyentuh Postgres, cadangan, maupun log.
 *
 * Sampai sekarang `OltDevice.credentialRef` kelimanya berisi
 * `LIBRENMS_API_TOKEN` — penanda sementara dari Fase 81 yang menyesatkan:
 * token API pemantauan bukan kredensial OLT, dan membiarkannya membuat orang
 * mengira kredensialnya sudah ada.
 */
import { readFileSync } from "node:fs";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

const terapkan = process.argv.includes("--terapkan");

async function main() {
  const peta: Record<string, string> = JSON.parse(readFileSync("data/nama-olt.json", "utf8")).kredensial;

  console.log(terapkan ? "═══ DITERAPKAN ═══\n" : "═══ PERIKSA (tidak menulis apa pun) ═══\n");

  let diubah = 0;
  for (const [hostname, envName] of Object.entries(peta)) {
    const d = await db.networkDevice.findUnique({ where: { hostname }, select: { id: true } });
    if (!d) { console.log(`  ✗ ${hostname} — perangkat tidak ada di CRM`); continue; }
    const olt = await db.oltDevice.findUnique({
      where: { networkDeviceId: d.id },
      select: { id: true, name: true, credentialRef: true },
    });
    if (!olt) { console.log(`  ✗ ${hostname} — belum punya lapisan OLT`); continue; }

    const terisi = process.env[envName] ? "terisi" : "KOSONG";
    const status = olt.credentialRef === envName ? "sudah" : `${olt.credentialRef ?? "-"} → ${envName}`;
    console.log(`  ${(olt.name ?? hostname).padEnd(23)} ${envName.padEnd(16)} ${status.padEnd(30)} nilai: ${terisi}`);

    if (terapkan && olt.credentialRef !== envName) {
      await db.oltDevice.update({ where: { id: olt.id }, data: { credentialRef: envName } });
      diubah++;
    }
  }

  if (!terapkan) {
    console.log("\nTambahkan --terapkan untuk menuliskan nama variabelnya.");
    return;
  }
  if (diubah) {
    const user = await db.user.findFirstOrThrow({ where: { isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
    await logAudit({
      userId: user.id,
      action: "OLT_CREDENTIAL_REF_SET",
      module: "noc",
      entityType: "OltDevice",
      description: `Menunjuk nama env var kredensial pada ${diubah} OLT. Tidak ada rahasia yang disimpan.`,
    });
  }
  console.log(`\nSelesai — ${diubah} OLT diperbarui. Tidak ada rahasia yang tersimpan di basis data.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
