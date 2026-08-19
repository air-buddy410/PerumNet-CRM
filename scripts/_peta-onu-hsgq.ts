/**
 * Fase 92 — memetakan ONU yang SUNGGUH ada di HSGQ, per PON.
 * HANYA membaca. Satu sesi telnet, `show ont-info all` per PON.
 */
import { jalankanPerintahMultiPort } from "@/lib/olt-telnet";
import { pakaiKredensial } from "@/lib/kredensial-perangkat-service";
import { db } from "@/lib/db";

const host = process.argv[2];
const ponMax = Number(process.argv[3] ?? 8);

async function main() {
  const dev = await db.networkDevice.findFirstOrThrow({
    where: { hostname: host },
    select: { id: true, hostname: true, oltDevice: { select: { id: true, vendor: true } } },
  });
  const kred = await pakaiKredensial(dev.id);

  const perintah = ["enable", "configure"];
  for (let p = 1; p <= ponMax; p++) perintah.push(`interface gpon ${p}`, "show ont-info all");

  const out = await jalankanPerintahMultiPort(
    { host: dev.hostname, user: kred.user, password: kred.password },
    [kred.port, 23],
    perintah
  );
  const teks = String((out as { transkrip?: string; keluaran?: string }).transkrip ?? (out as { keluaran?: string }).keluaran ?? out);

  console.log(`${dev.hostname} — ONU menurut PERANGKAT:`);
  let total = 0;
  for (const m of teks.matchAll(/In port (\d+)\s*,\s*the total of ONTs are:\s*(\d+),\s*online:\s*(\d+)/g)) {
    const [, port, jml, online] = m;
    total += Number(jml);
    console.log(`  PON ${port.padStart(2)} — ${jml.padStart(3)} ONU (${online} online)`);
  }
  console.log(`  TOTAL menurut perangkat: ${total}`);

  const subs = await db.subscription.findMany({
    where: { onuPosition: { not: null }, odpPort: { odp: { ponPort: { oltId: dev.oltDevice!.id } } } },
    select: { onuPosition: true },
  });
  const perPon: Record<string, number> = {};
  let salahFormat = 0;
  for (const s of subs) {
    const p = s.onuPosition ?? "";
    const m = /^(\d+):(\d+)$/.exec(p);
    if (m) perPon[m[1]] = (perPon[m[1]] ?? 0) + 1;
    else salahFormat++;
  }
  console.log(`\n${dev.hostname} — ONU menurut BASIS DATA:`);
  for (const [pon, n] of Object.entries(perPon).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    console.log(`  PON ${pon.padStart(2)} — ${String(n).padStart(3)} langganan`);
  }
  console.log(`  salah format (gaya ZTE): ${salahFormat}`);
  console.log(`  TOTAL menurut basis data: ${subs.length}`);
}
main().finally(() => db.$disconnect());
