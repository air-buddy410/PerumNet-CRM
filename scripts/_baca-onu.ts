/**
 * Membaca daya optik ONU langsung dari OLT — bukti Fase 88b.
 *
 *   npx tsx scripts/_baca-onu.ts PN102052536        # satu pelanggan
 *   npx tsx scripts/_baca-onu.ts --verifikasi 12     # N sampel Pesagi + cocokkan nama
 *
 * `--verifikasi` adalah ujiannya: nama ONU menurut PERANGKAT dibandingkan
 * dengan `pppoeUsername` menurut BASIS DATA. Kalau pemetaan posisi→OID keliru,
 * nama yang muncul adalah milik orang lain — dan itu langsung kelihatan.
 *
 * HANYA MEMBACA. Satu pelanggan = satu SNMP GET.
 */
import { db } from "@/lib/db";
import { bacaDayaOnu } from "@/lib/onu-optical-service";

const arg = process.argv[2];
const jumlah = Number(process.argv[3] ?? 10);

async function satu(subId: string) {
  const h = await bacaDayaOnu(subId);
  if (!h.ok) { console.log(`  ✗ [${h.sebab}] ${h.pesan}`); return null; }
  console.log(`  ${h.serviceNumber.padEnd(14)} ${h.posisi.padEnd(10)} ${String(h.dBm).padStart(7)} dBm  ${h.mutu.padEnd(8)} nama-di-perangkat: ${h.namaDiPerangkat ?? "—"}`);
  return h;
}

async function main() {
  if (!arg) throw new Error("Pakai: _baca-onu.ts <serviceNumber> | --verifikasi [N]");

  if (arg !== "--verifikasi") {
    const sub = await db.subscription.findFirst({ where: { serviceNumber: arg }, select: { id: true } });
    if (!sub) throw new Error(`${arg} tidak ditemukan`);
    await satu(sub.id);
    return;
  }

  // Sampel acak-stabil pelanggan Pesagi yang punya posisi ONU dan PPPoE.
  const subs = await db.subscription.findMany({
    where: {
      onuPosition: { not: null },
      pppoeUsername: { not: null },
      odpPort: { odp: { ponPort: { olt: { model: { contains: "300" } } } } },
    },
    select: { id: true, serviceNumber: true, pppoeUsername: true },
    orderBy: { serviceNumber: "asc" },
    take: jumlah,
  });
  console.log(`═══ VERIFIKASI ${subs.length} pelanggan C300 Pesagi ═══\n`);
  let cocok = 0, beda = 0, gagal = 0;
  for (const s of subs) {
    const h = await satu(s.id);
    if (!h) { gagal++; continue; }
    const a = (h.namaDiPerangkat ?? "").trim().toLowerCase();
    const b = (s.pppoeUsername ?? "").trim().toLowerCase();
    if (a && b && (a === b || a.includes(b) || b.includes(a))) cocok++;
    else { beda++; console.log(`      ⚠ nama beda: perangkat="${h.namaDiPerangkat}" vs pppoe="${s.pppoeUsername}"`); }
    // Jeda kecil — jangan menghujani OLT produksi.
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log(`\nnama COCOK dengan pppoeUsername : ${cocok}`);
  console.log(`nama berbeda                     : ${beda}`);
  console.log(`tidak terbaca                    : ${gagal}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
