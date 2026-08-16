/**
 * Merapikan port PON dan menautkan ODP ke port PON-nya.
 *
 *   npx tsx scripts/_taut-pon.ts
 *   npx tsx scripts/_taut-pon.ts --terapkan
 *   npx tsx scripts/_taut-pon.ts --terapkan --olt olt.json
 *
 * Jodoh nama OLT dibaca dari `data/nama-olt.json` — DIISI MANUSIA, sebab satu
 * OLT dikenal dengan tiga nama yang tidak punya satu pun bidang penghubung.
 *
 * `--olt olt.json` opsional, hanya untuk memeriksa silang: catatan ODP
 * dibandingkan dengan OLT yang disebut pelanggannya. Yang berbeda dilaporkan,
 * tidak mengubah pilihan — catatan ODP menyebut ODP itu sendiri, sedangkan
 * catatan pelanggan menyebut pelanggannya.
 */
import { readFileSync } from "node:fs";
import { rapikanPonPort, periksaTautanPon, terapkanTautanPon, type HasilTautan } from "@/lib/odp-pon-service";
import { db } from "@/lib/db";

const terapkan = process.argv.includes("--terapkan");
const iOlt = process.argv.indexOf("--olt");
const berkasOlt = iOlt >= 0 ? process.argv[iOlt + 1] : null;

async function main() {
  const nama = JSON.parse(readFileSync("data/nama-olt.json", "utf8"));
  const oltPerPelanggan = berkasOlt
    ? (JSON.parse(readFileSync(berkasOlt, "utf8")).oltPerPelanggan ?? {})
    : {};

  console.log(terapkan ? "═══ DITERAPKAN ═══" : "═══ PERIKSA (tidak menulis apa pun) ═══\n");

  if (terapkan) {
    const user = await db.user.findFirstOrThrow({ select: { id: true } });

    // Nama operasional dulu — layar hanya bisa menampilkan IP tanpa ini.
    let namaDiisi = 0;
    for (const [hostname, n] of Object.entries(nama.perangkat as Record<string, string>)) {
      const d = await db.networkDevice.findUnique({ where: { hostname }, select: { id: true } });
      if (!d) continue;
      const r = await db.oltDevice.updateMany({ where: { networkDeviceId: d.id }, data: { name: n } });
      namaDiisi += r.count;
    }
    console.log(`Nama operasional OLT diisi : ${namaDiisi}`);

    const rapi = await rapikanPonPort(user.id);
    console.log(`\nPort PON  diperiksa ${rapi.diperiksa} · dibuat ${rapi.dibuat} · dihapus ${rapi.dihapus}`);
    for (const d of rapi.diperbaiki) console.log(`  betul  ${d.olt.padEnd(24)} ${d.dari} → ${d.ke}   ${d.label}`);
    for (const t of rapi.tertahan) console.log(`  TERTAHAN ${t.olt} ${t.slotPort} — masih ditunjuk ${t.odp} ODP`);
  }

  const r = terapkan
    ? await terapkanTautanPon(nama.catatanOdp, (await db.user.findFirstOrThrow({ select: { id: true } })).id, oltPerPelanggan, nama.samaDengan)
    : await periksaTautanPon(nama.catatanOdp, oltPerPelanggan, nama.samaDengan);

  console.log(`\nODP siap ditautkan : ${r.ringkas.siap}`);
  console.log(`ODP ditolak        : ${r.ringkas.tolak}`);
  if (terapkan) {
    const h = r as HasilTautan;
    console.log(`ODP tertaut        : ${h.ditaut}  (${h.siteDisambung} baru mendapat site)`);
  }

  if (Object.keys(r.alasan).length) {
    console.log("\nAlasan penolakan:");
    for (const [a, n] of Object.entries(r.alasan).sort((x, y) => y[1] - x[1])) {
      console.log(`  ${String(n).padStart(4)}  ${a}`);
    }
  }

  if (r.bedaDenganPelanggan.length) {
    console.log(`\nCatatan ODP berbeda dengan OLT yang disebut pelanggannya (${r.bedaDenganPelanggan.length}):`);
    for (const b of r.bedaDenganPelanggan) {
      console.log(`  ${b.odp.padEnd(14)} catatan ${b.catatan} (setuju ${b.setuju}) ≠ pelanggan ${b.pelanggan}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
