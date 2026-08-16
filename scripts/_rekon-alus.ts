/**
 * Menyandingkan CRM dengan sistem lama, dan melaporkan selisihnya.
 *
 *   npx tsx scripts/_rekon-alus.ts alus.json
 *   npx tsx scripts/_rekon-alus.ts alus.json --rinci ODP,STATUS
 *
 * `alus.json`: { pelanggan: [{ cid, nama, status, plan, odp, onu }] }
 *
 * TIDAK MENULIS APA PUN — ke CRM maupun ke sistem lama. Selisih adalah
 * pertanyaan untuk manusia; alat yang menjawabnya sendiri akan menyembunyikan
 * justru yang perlu dilihat.
 *
 * Dijalankan berulang: sebelum tiap keputusan besar, dan sekali lagi tepat
 * sebelum cutover. Selama sistem lama masih berjalan, selisihnya melebar tiap
 * hari — dan tidak ada yang tahu berapa lebarnya sampai ada yang menghitung.
 */
import { readFileSync } from "node:fs";
import { bandingkan, type BarisAlus, type JenisSelisih } from "@/lib/rekon-alus";
import { db } from "@/lib/db";

const berkas = process.argv[2];
const iRinci = process.argv.indexOf("--rinci");
const rinci = new Set<string>(
  iRinci >= 0 ? (process.argv[iRinci + 1] ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) : []
);

async function main() {
  if (!berkas) throw new Error("Pakai: _rekon-alus.ts <alus.json> [--rinci JENIS,JENIS]");
  const isi = JSON.parse(readFileSync(berkas, "utf8"));
  const alus: BarisAlus[] = (isi.pelanggan ?? isi).map(
    (x: { cid: string; nama?: string; status?: string; plan?: string; odp?: string; onu?: string }) => ({
      cid: x.cid,
      nama: x.nama ?? "",
      status: x.status ?? "",
      plan: x.plan ?? "",
      odp: x.odp ?? null,
      onu: x.onu ?? null,
    })
  );

  const subs = await db.subscription.findMany({
    select: {
      serviceNumber: true,
      status: true,
      monthlyPrice: true,
      onuPosition: true,
      customer: { select: { name: true } },
      odpPort: { select: { odp: { select: { code: true } } } },
      pppoeSessions: { select: { status: true }, take: 1, orderBy: { lastSeenAt: "desc" } },
    },
  });
  const crm = subs.map((s) => ({
    serviceNumber: s.serviceNumber,
    nama: s.customer.name,
    status: s.status,
    monthlyPrice: Number(s.monthlyPrice),
    odp: s.odpPort?.odp.code ?? null,
    onuPosition: s.onuPosition,
    linkStatus: s.pppoeSessions[0]?.status ?? null,
  }));

  const h = bandingkan(alus, crm);

  console.log("═══ REKONSILIASI CRM ⇄ SISTEM LAMA ═══");
  console.log("(tidak menulis apa pun)\n");
  console.log(`Sistem lama : ${alus.length} pelanggan`);
  console.log(`CRM         : ${crm.length} langganan`);
  console.log(`Di keduanya : ${h.bersama}`);
  console.log(`  cocok penuh    : ${h.cocokPenuh}`);
  console.log(`  ada selisihnya : ${h.bersama - h.cocokPenuh}`);
  console.log(`Hanya di sistem lama : ${h.hanyaAlus}   ← perlu diimpor`);
  console.log(`Hanya di CRM         : ${h.hanyaCrm}   ← perlu ditinjau`);

  console.log("\n── Selisih per jenis ──");
  for (const [j, n] of Object.entries(h.perJenis).sort((a, b) => b[1] - a[1])) {
    if (n) console.log(`  ${String(n).padStart(5)}  ${j}`);
  }

  for (const j of rinci) {
    const l = h.selisih.filter((s) => s.jenis === (j as JenisSelisih));
    if (!l.length) continue;
    console.log(`\n── Rincian ${j} (${l.length}) ──`);
    for (const s of l.slice(0, 60)) {
      console.log(`  ${s.cid.padEnd(14)} ${s.nama.slice(0, 24).padEnd(25)} lama: ${s.alus.padEnd(24)} CRM: ${s.crm}`);
    }
    if (l.length > 60) console.log(`  … ${l.length - 60} lagi`);
  }

  console.log("\n── Status penagihan (sistem lama) vs keadaan router ──");
  console.log("   Dua sumbu berbeda: yang kiri keputusan penagihan, yang kanan keadaan perangkat.");
  for (const b of h.blokirVsRouter) {
    console.log(`  ${String(b.jumlah).padStart(5)}  ${b.alus.padEnd(12)} → ${b.link}`);
  }
  const bocor = h.blokirVsRouter.filter((b) => /block|isolir/i.test(b.alus) && b.link === "ONLINE");
  if (bocor.length) {
    const n = bocor.reduce((s, b) => s + b.jumlah, 0);
    console.log(`\n  ⚠ ${n} pelanggan DIBLOKIR di penagihan tetapi sambungannya MASIH MENYALA.`);
    console.log("    Itu belum tentu salah — blokir bisa baru saja ditetapkan — tetapi layak dilihat.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
