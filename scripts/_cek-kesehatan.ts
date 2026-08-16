/**
 * Menjawab satu pertanyaan: semuanya jalan atau tidak?
 *
 *   npx tsx scripts/_cek-kesehatan.ts
 *
 * Dipakai dari terminal sekarang juga, jauh sebelum layarnya ada — sebab
 * pertanyaannya sudah ditanyakan orang tiap pagi.
 *
 * TIDAK MENULIS APA PUN.
 */
import { loadStatusSistem } from "@/lib/system-status-service";
import { db } from "@/lib/db";

/** Waktu tim, bukan waktu VPS. Jam server UTC; ini yang bikin salah baca. */
const ZONA = "Asia/Makassar";

function jam(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString("id-ID", { timeZone: ZONA, dateStyle: "short", timeStyle: "medium" });
}

const IKON: Record<string, string> = { SEHAT: "✓", PERHATIAN: "!", GAWAT: "✗" };

async function main() {
  const s = await loadStatusSistem();

  console.log("═".repeat(72));
  console.log(`  ${IKON[s.vonis]}  ${s.vonis}          ${jam(s.sekarang)} WITA`);
  console.log("═".repeat(72));

  if (s.gejala.length) {
    console.log("\n── Yang perlu dilihat ──");
    for (const g of s.gejala) {
      console.log(`  ${IKON[g.vonis]} [${g.bagian}] ${g.pesan}`);
    }
  } else {
    console.log("\n  Tidak ada gejala. Seluruh tugas aktif segar, router tertarik, antrean bersih.");
  }

  console.log("\n── Tugas berjadwal ──");
  for (const t of s.tugas) {
    const tanda = t.isEnabled ? IKON[t.kesegaran === "MACET" ? "GAWAT" : t.kesegaran === "TERLAMBAT" ? "PERHATIAN" : "SEHAT"] : "·";
    const gagal = t.failCount > 0 ? ` · ${t.failCount} gagal` : "";
    console.log(
      `  ${tanda} ${t.code.padEnd(24)} tiap ${String(t.intervalSec).padStart(6)}s  ${t.sejak.padEnd(16)}` +
        `${t.isEnabled ? "" : "(dimatikan)"}${gagal}${t.sewaTertinggal ? "  ⚠ kunci tertinggal" : ""}`
    );
  }

  console.log("\n── Router ──");
  for (const r of s.router) {
    const tanda = !r.isPollingEnabled ? "·" : r.gagalBeruntun >= 3 ? IKON.GAWAT : r.gagalBeruntun > 0 ? IKON.PERHATIAN : IKON.SEHAT;
    console.log(
      `  ${tanda} ${r.hostname.padEnd(24)} ditarik ${r.sejak.padEnd(16)} ${String(r.sesiOnline).padStart(5)} sesi online` +
        (r.gagalBeruntun ? `  · ${r.gagalBeruntun} gagal beruntun` : "")
    );
    if (r.errorTerakhir) console.log(`      ${r.errorTerakhir.slice(0, 100)}`);
  }

  console.log("\n── Antrean perintah router ──");
  console.log(`  menunggu ${s.antrean.queued} · berjalan ${s.antrean.running} · gagal ${s.antrean.failed}`);

  console.log("\n── Sinkron LibreNMS ──");
  console.log(`  ${s.librenms.perangkat} perangkat · ${s.librenms.port} port · terakhir ${s.librenms.sejak}`);

  console.log("\n── Lapisan OLT ──");
  console.log(
    `  ${s.olt.olt} OLT · ${s.olt.ponPort} port PON · ${s.olt.odpTertaut} ODP tertaut · ${s.olt.odpTanpaPon} belum`
  );
  console.log();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
