/**
 * Menjembatani username PPPoE di router ke nomor layanan pelanggan.
 *
 *   npx tsx scripts/_jembatani-pppoe.ts            # rencana saja
 *   npx tsx scripts/_jembatani-pppoe.ts --terapkan
 *
 * Menulis `Subscription.pppoeUsername` dan `PppoeSession.subscriptionId`.
 * Aman diulang: yang sudah tertaut dilewati.
 */
import { matchUsernames } from "@/lib/pppoe-match";
import { db } from "@/lib/db";

const terapkan = process.argv.includes("--terapkan");

async function main() {
  const sesi = await db.pppoeSession.findMany({
    select: { username: true }, distinct: ["username"],
  });
  const subs = await db.subscription.findMany({
    select: { serviceNumber: true, pppoeUsername: true, customer: { select: { name: true } } },
  });
  const kandidat = subs.map((s) => ({ serviceNumber: s.serviceNumber, customerName: s.customer.name }));

  const h = matchUsernames(sesi.map((s) => s.username), kandidat);
  const perHow: Record<string, number> = {};
  for (const m of h.matched) perHow[m.how] = (perHow[m.how] ?? 0) + 1;

  console.log(terapkan ? "MENERAPKAN\n" : "RENCANA SAJA (tambahkan --terapkan)\n");
  console.log("username PPPoE unik :", sesi.length);
  console.log("langganan           :", subs.length);
  console.log("COCOK               :", h.matched.length, JSON.stringify(perHow));
  console.log("  dikuatkan nama    :", h.matched.filter((m) => m.nameCorroborated).length);
  console.log("ambigu (tak dipilih):", h.ambiguous.length);
  console.log("tanpa kandidat      :", h.unmatched.length);
  console.log("\ncontoh:", h.matched.slice(0, 4).map((m) => `${m.username}→${m.serviceNumber}`).join(" · "));

  if (!terapkan) { await db.$disconnect(); return; }

  let sub = 0, ses = 0;
  for (const m of h.matched) {
    const r = await db.subscription.updateMany({
      where: { serviceNumber: m.serviceNumber, pppoeUsername: null },
      data: { pppoeUsername: m.username },
    });
    sub += r.count;
    const s = await db.subscription.findUnique({ where: { serviceNumber: m.serviceNumber }, select: { id: true } });
    if (!s) continue;
    const t = await db.pppoeSession.updateMany({
      where: { username: m.username, subscriptionId: null },
      data: { subscriptionId: s.id },
    });
    ses += t.count;
  }
  const yatim = await db.pppoeSession.count({ where: { subscriptionId: null } });
  const total = await db.pppoeSession.count();
  console.log(`\n→ ${sub} langganan diberi username · ${ses} sesi tertaut`);
  console.log(`→ sesi yatim: ${yatim} dari ${total}`);
  await db.$disconnect();
}
main().catch((e) => { console.error("GAGAL:", e.message); process.exit(1); });
