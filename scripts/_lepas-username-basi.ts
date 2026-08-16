/**
 * Melepas `Subscription.pppoeUsername` yang tidak pernah dipakai router,
 * ketika sumber penagihan menyebut username LAIN yang sedang menyala.
 *
 *   npx tsx scripts/_lepas-username-basi.ts peta.tsv
 *   npx tsx scripts/_lepas-username-basi.ts peta.tsv --terapkan
 *
 * `peta.tsv`: username <TAB> nomor layanan <TAB> nama, dari sistem penagihan.
 *
 * TIDAK MENEBAK. Sempat ditulis dengan pencocokan ekor angka — "cari username
 * online yang angkanya mirip nomor layanan" — dan hasilnya salah pada tujuh
 * dari sepuluh baris pertama: `PN102112505` (Ni Ketut Apriyani) dipasangkan ke
 * `psg_012505_widiantari`, orang yang sama sekali berbeda. Kemiripan angka
 * pada nomor pelanggan yang berdekatan terlalu mudah terjadi.
 *
 * Yang dilepas hanya bila SELURUH syarat terpenuhi:
 *
 *   - peta penagihan menyebut username lain untuk nomor layanan itu,
 *   - username yang disebut peta sedang ONLINE di router,
 *   - username yang tercatat sekarang belum pernah sekali pun menyala.
 */
import { readFileSync } from "node:fs";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

const berkas = process.argv[2];
const terapkan = process.argv.includes("--terapkan");

async function main() {
  if (!berkas) throw new Error("Pakai: _lepas-username-basi.ts <peta.tsv> [--terapkan]");
  const user = await db.user.findFirstOrThrow({ select: { id: true } });

  const peta = readFileSync(berkas, "utf8").split("\n").filter(Boolean)
    .map((l) => l.split("\t"))
    .map(([username, cid]) => ({ username, kunci: cid.replace(/\s+/g, "").toUpperCase() }));

  const subs = await db.subscription.findMany({
    where: { pppoeUsername: { not: null } },
    select: { id: true, serviceNumber: true, pppoeUsername: true, customer: { select: { name: true } } },
  });
  const perKunci = new Map(subs.map((s) => [s.serviceNumber.replace(/\s+/g, "").toUpperCase(), s]));

  const sesi = await db.pppoeSession.findMany({ select: { username: true, status: true, lastSeenAt: true } });
  const perUser = new Map(sesi.map((s) => [s.username, s]));

  const kandidat: { sub: (typeof subs)[number]; hidup: string }[] = [];
  for (const p of peta) {
    const sub = perKunci.get(p.kunci);
    if (!sub || sub.pppoeUsername === p.username) continue;
    const baru = perUser.get(p.username);
    const lama = perUser.get(sub.pppoeUsername!);
    if (!baru || baru.status !== "ONLINE") continue;      // penggantinya harus benar-benar menyala
    if (!lama || lama.status === "ONLINE" || lama.lastSeenAt) continue; // yang lama harus benar-benar mati
    kandidat.push({ sub, hidup: p.username });
  }

  console.log(terapkan ? "═══ DILEPAS ═══" : "═══ PERIKSA (tidak mengubah apa pun) ═══");
  for (const k of kandidat) {
    console.log(`  ${k.sub.serviceNumber}  ${k.sub.customer.name}`);
    console.log(`     lepas  : ${k.sub.pppoeUsername}  (belum pernah menyala)`);
    console.log(`     hidup  : ${k.hidup}`);
    if (!terapkan) continue;
    await db.subscription.update({ where: { id: k.sub.id }, data: { pppoeUsername: null } });
    await logAudit({
      userId: user.id,
      action: "PPPOE_USERNAME_LEPAS",
      module: "noc",
      entityType: "Subscription",
      entityId: k.sub.id,
      description:
        `Melepas username PPPoE "${k.sub.pppoeUsername}" dari ${k.sub.serviceNumber} ` +
        `(${k.sub.customer.name}) — belum pernah menyala di router; yang hidup "${k.hidup}".`,
    });
  }
  console.log(`\n  ${terapkan ? "dilepas" : "kandidat"}: ${kandidat.length}`);
}
main().catch((e) => { console.error("GAGAL:", e.message); process.exit(1); }).finally(() => db.$disconnect());
