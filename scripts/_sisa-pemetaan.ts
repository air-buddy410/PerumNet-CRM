/**
 * Menyusun daftar sisa pekerjaan pemetaan yang butuh keputusan manusia.
 *
 *   npx tsx scripts/_sisa-pemetaan.ts            # ringkas
 *   npx tsx scripts/_sisa-pemetaan.ts --rinci    # seluruh baris
 *
 * Dua hal yang sengaja TIDAK diselesaikan otomatis, dan berkas ini membuat
 * keduanya bisa ditindaklanjuti alih-alih mengendap sebagai angka:
 *
 *  1. Sesi PPPoE yang nomornya cocok tetapi namanya tidak. Menebak di sini
 *     berarti menautkan sesi ke pelanggan yang salah — kesalahan yang
 *     menyamar sebagai pekerjaan selesai.
 *  2. Pelanggan yang tidak kebagian port karena ODP-nya penuh. Angka
 *     kapasitasnya berasal dari sumber luar dan bisa saja tertinggal; yang
 *     benar diputuskan di lapangan, bukan di sini.
 */
import { matchUsernames, numbersIn, nameCorroborates } from "@/lib/pppoe-match";
import { db } from "@/lib/db";

const rinci = process.argv.includes("--rinci");

async function main() {
  const subs = await db.subscription.findMany({
    select: { id: true, serviceNumber: true, pppoeUsername: true, customer: { select: { name: true } } },
  });
  const kandidat = subs.map((s) => ({ serviceNumber: s.serviceNumber, customerName: s.customer.name }));
  const sesi = await db.pppoeSession.findMany({
    where: { subscriptionId: null },
    select: { username: true },
    distinct: ["username"],
  });

  // ── 1. Sesi ambigu: tunjukkan kandidatnya, jangan cuma hitung ──
  const h = matchUsernames(sesi.map((s) => s.username), kandidat);
  const byTail = new Map<string, typeof kandidat>();
  for (const k of kandidat) {
    const d = k.serviceNumber.replace(/\D/g, "");
    for (let len = 4; len <= d.length; len++) {
      const t = d.slice(-len);
      byTail.set(t, [...(byTail.get(t) ?? []), k]);
    }
  }

  const perluDiputuskan: { username: string; kandidat: string[] }[] = [];
  for (const u of h.ambiguous) {
    const set = new Map<string, string>();
    for (const n of numbersIn(u)) {
      for (const k of byTail.get(n) ?? []) {
        set.set(k.serviceNumber, `${k.serviceNumber} — ${k.customerName}${nameCorroborates(u, k.customerName) ? " ✓nama" : ""}`);
      }
    }
    perluDiputuskan.push({ username: u, kandidat: [...set.values()] });
  }

  console.log("═══ 1. SESI PPPoE YANG PERLU DIPUTUSKAN ═══");
  console.log(`   ${perluDiputuskan.length} username punya kandidat tetapi namanya tidak menguatkan.`);
  console.log(`   ${h.unmatched.length} username tanpa kandidat sama sekali.\n`);
  const tampil = rinci ? perluDiputuskan : perluDiputuskan.slice(0, 12);
  for (const p of tampil) {
    console.log(`   ${p.username}`);
    for (const k of p.kandidat) console.log(`       → ${k}`);
  }
  if (!rinci && perluDiputuskan.length > tampil.length) {
    console.log(`   … ${perluDiputuskan.length - tampil.length} lagi (jalankan dengan --rinci)`);
  }

  console.log(`\n   Tanpa kandidat (${h.unmatched.length}), contoh:`);
  console.log("   " + h.unmatched.slice(0, 10).join(" · "));

  // ── 2. Pelanggan tanpa port ──
  const tanpaPort = await db.subscription.findMany({
    where: { odpPort: null },
    select: { serviceNumber: true, customer: { select: { name: true } } },
  });

  console.log(`\n═══ 2. PELANGGAN TANPA PORT ODP: ${tanpaPort.length} ═══`);

  // ODP yang penuh — kapasitasnya kemungkinan tertinggal dari kenyataan.
  const penuh = await db.odp.findMany({
    where: { portUsed: { gt: 0 } },
    select: { code: true, portCapacity: true, portUsed: true, role: true },
    orderBy: { portUsed: "desc" },
  });
  const sesak = penuh.filter((o) => o.portUsed >= o.portCapacity);
  console.log(`   ODP yang portnya habis: ${sesak.length}`);
  for (const o of sesak.slice(0, rinci ? sesak.length : 15)) {
    console.log(`     ${o.code.padEnd(20)} ${o.portUsed}/${o.portCapacity} port  [${o.role}]`);
  }
  if (!rinci && sesak.length > 15) console.log(`     … ${sesak.length - 15} lagi`);

  console.log("\n   Pelanggan yang terdampak:");
  for (const t of tanpaPort.slice(0, rinci ? tanpaPort.length : 10)) {
    console.log(`     ${t.serviceNumber.padEnd(14)} ${t.customer.name}`);
  }
  if (!rinci && tanpaPort.length > 10) console.log(`     … ${tanpaPort.length - 10} lagi`);

  // ── Ringkasan ──
  const totalSesi = await db.pppoeSession.count();
  const yatim = await db.pppoeSession.count({ where: { subscriptionId: null } });
  const tanpaUser = await db.subscription.count({ where: { pppoeUsername: null } });
  console.log("\n═══ RINGKASAN ═══");
  console.log(`   sesi PPPoE yatim      : ${yatim} dari ${totalSesi}`);
  console.log(`   langganan tanpa PPPoE : ${tanpaUser} dari ${subs.length}`);
  console.log(`   pelanggan tanpa port  : ${tanpaPort.length}`);
  console.log(`   ODP portnya habis     : ${sesak.length}`);
  await db.$disconnect();
}
main().catch((e) => { console.error("GAGAL:", e.message); process.exit(1); });
