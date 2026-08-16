/**
 * Gladi bersih penagihan — menghitung apa yang AKAN terjadi, lalu berhenti.
 *
 *   npx tsx scripts/_gladi-tagih.ts 2026-08
 *   npx tsx scripts/_gladi-tagih.ts 2026-08 --banding tagih-alus.tsv
 *
 * TIDAK MENERBITKAN APA PUN. Tidak menulis satu baris pun ke basis data, dan
 * tidak ada jalan dari skrip ini menuju penerbitan.
 *
 * `--banding` menerima TSV `nomorLayanan<TAB>jumlah` dari sistem lama untuk
 * periode yang sama. Itulah ujian sebenarnya: angka yang cocok pada 1.700
 * pelanggan membuktikan mesin penagihan kita tanpa seorang pun menerima apa
 * pun; angka yang meleset menunjukkan tepat pada siapa, sebelum uang
 * berpindah.
 */
import { readFileSync } from "node:fs";
import { simulasiTerbit, simulasiIsolir, bandingkanTagihan } from "@/lib/billing-dryrun";
import { db } from "@/lib/db";

const periodeArg = process.argv[2];
const iBanding = process.argv.indexOf("--banding");
const berkasBanding = iBanding >= 0 ? process.argv[iBanding + 1] : null;

const rupiah = (n: number) => "Rp" + n.toLocaleString("id-ID");

async function main() {
  if (!/^\d{4}-\d{2}$/.test(periodeArg ?? "")) {
    throw new Error("Pakai: _gladi-tagih.ts <YYYY-MM> [--banding berkas.tsv]");
  }
  const [tahun, bulan] = periodeArg.split("-").map(Number);

  console.log("═══ GLADI BERSIH PENAGIHAN ═══");
  console.log("Tidak menerbitkan apa pun. Tidak menulis apa pun.\n");

  const subs = await db.subscription.findMany({
    select: {
      serviceNumber: true, status: true, monthlyPrice: true,
      billingCycleDay: true,
      billingProfile: { select: { isolirDay: true, billingStartAt: true } },
    },
  });

  const h = simulasiTerbit(
    subs.map((s) => ({
      serviceNumber: s.serviceNumber,
      status: s.status,
      monthlyPrice: Number(s.monthlyPrice),
      billingCycleDay: s.billingCycleDay,
      isolirDay: s.billingProfile?.isolirDay ?? null,
      billingStartAt: s.billingProfile?.billingStartAt ?? null,
    })),
    { tahun, bulan }
  );

  console.log(`Periode        : ${h.periode}`);
  console.log(`AKAN terbit    : ${h.akanTerbit} tagihan`);
  console.log(`Nilai          : ${rupiah(h.totalRupiah)}`);
  console.log(`Dilewati       : ${h.dilewati}`);
  if (Object.keys(h.perAlasan).length) {
    console.log("\nAlasan dilewati:");
    for (const [a, n] of Object.entries(h.perAlasan).sort((x, y) => y[1] - x[1])) {
      console.log(`  ${String(n).padStart(5)}  ${a}`);
    }
  }

  // ── Isolir, untuk tiap tanggal yang dipakai ────────────────────
  const perTanggal = new Map<number, number>();
  for (const s of subs) {
    const d = s.billingProfile?.isolirDay;
    if (d) perTanggal.set(d, (perTanggal.get(d) ?? 0) + 1);
  }
  const daftarIsolir = subs.map((s) => ({
    serviceNumber: s.serviceNumber,
    status: s.status,
    isolirDay: s.billingProfile?.isolirDay ?? null,
    // Tunggakan sungguhan belum ada — Invoice masih nol baris. Disimulasikan
    // sebagai 1 supaya bentuk laporannya terlihat; ANGKANYA belum berarti.
    tunggakan: 1,
  }));
  console.log("\n── Isolir: berapa yang tersentuh per tanggal ──");
  console.log("   (tunggakan disimulasikan 1 untuk semua — Invoice masih nol baris,");
  console.log("    jadi yang bermakna di sini SEBARANNYA, bukan angkanya)");
  for (const [tgl, jumlah] of [...perTanggal.entries()].sort((a, b) => a[0] - b[0])) {
    const sim = simulasiIsolir(daftarIsolir, tgl);
    console.log(`  tanggal ${String(tgl).padStart(2)} — ${String(jumlah).padStart(4)} langganan · akan tersentuh ${sim.akanDiisolir.length}`);
  }

  // ── Banding dengan sistem lama ────────────────────────────────
  if (berkasBanding) {
    const lama = readFileSync(berkasBanding, "utf8")
      .split(/\r?\n/).filter((l) => l.trim())
      .map((l) => l.split("\t"))
      .filter((c) => c.length >= 2)
      .map((c) => ({ serviceNumber: c[0].trim(), jumlah: Number(c[1].replace(/[^\d]/g, "")) }));

    const b = bandingkanTagihan(
      h.baris.filter((x) => x.tindakan === "TERBIT").map((x) => ({ serviceNumber: x.serviceNumber, jumlah: x.jumlah })),
      lama
    );
    console.log("\n── Dibandingkan dengan sistem lama ──");
    console.log(`  cocok persis   : ${b.cocok}`);
    console.log(`  beda jumlahnya : ${b.selisih.length}`);
    console.log(`  hanya di kita  : ${b.hanyaDiKita.length}`);
    console.log(`  hanya di lama  : ${b.hanyaDiLama.length}`);
    console.log(`  total kita     : ${rupiah(b.totalKita)}`);
    console.log(`  total lama     : ${rupiah(b.totalLama)}`);
    if (b.selisih.length) {
      console.log("\n  Yang berbeda (maks 25):");
      for (const s of b.selisih.slice(0, 25)) {
        console.log(`    ${s.serviceNumber.padEnd(14)} kita ${rupiah(s.kita).padEnd(12)} lama ${rupiah(s.lama)}`);
      }
    }
    if (b.selisih.length === 0 && b.hanyaDiKita.length === 0 && b.hanyaDiLama.length === 0) {
      console.log("\n  ✓ Seluruhnya cocok. Mesin penagihan terbukti pada data ini.");
    }
  }
  console.log();
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
