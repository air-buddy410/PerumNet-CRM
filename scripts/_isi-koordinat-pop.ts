/**
 * Mengisi koordinat POP / MINI_POP.
 *
 *   npx tsx scripts/_isi-koordinat-pop.ts
 *   npx tsx scripts/_isi-koordinat-pop.ts --terapkan
 *
 * Koordinat diberikan pemilik jaringan 18 Agustus 2026. Ditulis di sini, bukan
 * dimasukkan lewat layar, karena enam titik yang menahan lapisan site di peta
 * lebih baik punya jejak di repo daripada hanya ada di kepala orang.
 *
 * NGB dan KCC punya koordinat yang SAMA PERSIS, dan itu benar: Nagabasukih
 * berada di lokasi Kecicang — dikonfirmasi pemilik jaringan 18 Agustus 2026.
 * Ditulis di sini supaya orang berikutnya tidak "memperbaiki" salah satunya
 * mengira ada salah salin. Dua site di satu lokasi akan bertumpuk di peta;
 * itu gambaran yang jujur, bukan cacat penggambaran.
 */
import { db } from "@/lib/db";

const terapkan = process.argv.includes("--terapkan");

/** Kotak Bali. Satu digit yang tertukar menaruh POP di laut atau di Jawa. */
const BALI = { latMin: -8.95, latMax: -8.0, lngMin: 114.4, lngMax: 115.75 };

const KOORDINAT: Record<string, { lat: number; lng: number }> = {
  KCC: { lat: -8.449851221181337, lng: 115.58962397471178 },
  PSG: { lat: -8.460566903716224, lng: 115.62286944109121 },
  SRYB: { lat: -8.443443629233366, lng: 115.6478021594986 },
  SRYT: { lat: -8.43606396448279, lng: 115.67370526716802 },
  ABG: { lat: -8.39515512765402, lng: 115.59607928930654 },
  // Sama dengan KCC — Nagabasukih memang berada di lokasi Kecicang.
  NGB: { lat: -8.449851221181337, lng: 115.58962397471178 },
};

function diLuarBali(lat: number, lng: number): boolean {
  return lat < BALI.latMin || lat > BALI.latMax || lng < BALI.lngMin || lng > BALI.lngMax;
}

async function main() {
  console.log(terapkan ? "═══ DITERAPKAN ═══\n" : "═══ RENCANA SAJA (tambahkan --terapkan) ═══\n");

  const sites = await db.networkSite.findMany({
    orderBy: { siteCode: "asc" },
    select: { id: true, siteCode: true, name: true, type: true, latitude: true, longitude: true },
  });

  let diisi = 0;
  const tertinggal: string[] = [];

  for (const s of sites) {
    const k = KOORDINAT[s.siteCode];
    if (!k) {
      tertinggal.push(`${s.siteCode} (${s.name})`);
      continue;
    }
    if (diLuarBali(k.lat, k.lng)) {
      console.log(`  ✗ ${s.siteCode}: ${k.lat}, ${k.lng} di LUAR Bali — ditolak, periksa angkanya.`);
      continue;
    }
    const sama = s.latitude === k.lat && s.longitude === k.lng;
    if (sama) {
      console.log(`  – ${s.siteCode.padEnd(5)} sudah sama`);
      continue;
    }
    const sebelum = s.latitude === null ? "kosong" : `${s.latitude}, ${s.longitude}`;
    console.log(`  ${terapkan ? "✓" : "→"} ${s.siteCode.padEnd(5)} ${sebelum}  →  ${k.lat}, ${k.lng}   ${s.name}`);
    if (terapkan) {
      await db.networkSite.update({ where: { id: s.id }, data: { latitude: k.lat, longitude: k.lng } });
    }
    diisi++;
  }

  if (tertinggal.length) {
    console.log(`\n── BELUM ada koordinatnya ──`);
    for (const t of tertinggal) console.log(`  ${t}`);
    console.log(`  Lapisan site di peta tetap tidak lengkap sampai ini terisi.`);
  }

  console.log(`\n${diisi} site ${terapkan ? "diperbarui" : "akan diperbarui"}.`);
  if (!terapkan && diisi > 0) console.log("Belum ada yang ditulis. Ulangi dengan --terapkan.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
