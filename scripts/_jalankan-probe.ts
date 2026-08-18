/**
 * Memeriksa target probe yang sudah jatuh tempo.
 *
 *   npx tsx scripts/_jalankan-probe.ts
 *   npx tsx scripts/_jalankan-probe.ts --pangkas      # sekalian buang hasil lama
 *
 * Dipasang di penjadwal TIAP MENIT. `runDueProbes` sendiri yang memutuskan mana
 * yang perlu diperiksa — tiap target punya `intervalSec` sendiri (bawaan 60
 * detik), jadi menjalankan ini lebih sering tidak membuat perangkat diperiksa
 * lebih sering. Yang belum jatuh tempo hanya dilewati.
 *
 * ══ APA YANG DILAKUKANNYA KE PERANGKAT ══
 *
 * Membuka koneksi TCP lalu segera menutupnya. Tidak ada nama pengguna, tidak
 * ada sandi, tidak ada perintah. Ia tidak muncul sebagai percobaan login di
 * perangkat, dan tidak mengubah apa pun.
 *
 * ══ SOAL ALARM ══
 *
 * Alarm baru dinaikkan setelah `failThreshold` kegagalan BERUNTUN (bawaan 3),
 * dan ditutup sendiri begitu targetnya pulih. Satu paket hilang di jaringan ISP
 * itu biasa; alarm yang berbunyi karenanya akan berhenti dipercaya orang, dan
 * alarm yang tidak dipercaya sama saja dengan tidak ada alarm.
 *
 * `--pangkas` membuang hasil lebih lama dari 14 hari. Tanpa itu `ProbeResult`
 * tumbuh selamanya: 7 target × 1.440 kali sehari ≈ 10 ribu baris per hari.
 * Cukup dijalankan sekali sehari, tidak perlu tiap menit.
 */
import { runDueProbes, pruneProbeResults } from "@/lib/probe";
import { db } from "@/lib/db";

const pangkas = process.argv.includes("--pangkas");

async function main() {
  const hasil = await runDueProbes();

  const naik = hasil.filter((r) => r.alarmRaised);
  const turun = hasil.filter((r) => r.alarmCleared);
  const mati = hasil.filter((r) => r.status === "DOWN");

  console.log(
    `${hasil.length} target diperiksa · ${hasil.length - mati.length} UP · ${mati.length} DOWN` +
      (naik.length ? ` · ${naik.length} alarm naik` : "") +
      (turun.length ? ` · ${turun.length} alarm ditutup` : "")
  );

  // Yang mati disebut namanya — baris ringkas di atas tidak cukup bagi orang
  // yang membaca log saat sedang mencari gangguan.
  if (mati.length) {
    const nama = await db.probeTarget.findMany({
      where: { id: { in: mati.map((m) => m.targetId) } },
      select: { name: true, address: true, port: true, consecutiveFails: true, failThreshold: true },
    });
    for (const t of nama) {
      console.log(
        `  DOWN  ${t.name} (${t.address}:${t.port})  gagal beruntun ${t.consecutiveFails}/${t.failThreshold}`
      );
    }
  }

  if (pangkas) {
    const dibuang = await pruneProbeResults();
    console.log(`${dibuang} hasil probe lama dibuang (lebih dari 14 hari).`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
