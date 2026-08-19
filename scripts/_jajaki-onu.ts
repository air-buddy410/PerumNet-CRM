/**
 * Menjajaki perintah daftar ONU — Fase 92, langkah nol. HANYA `show`.
 * Urutan perintah dipisah dengan "|", mis:  "enable|configure|interface gpon 1|show ont-optical"
 */
import { jalankanPerintahMultiPort } from "@/lib/olt-telnet";
import { pakaiKredensial } from "@/lib/kredensial-perangkat-service";
import { db } from "@/lib/db";

const host = process.argv[2];
const urutan = process.argv.slice(3);

async function main() {
  const dev = await db.networkDevice.findFirstOrThrow({
    where: { hostname: host },
    select: { id: true, hostname: true, oltDevice: { select: { vendor: true, model: true } } },
  });
  const kred = await pakaiKredensial(dev.id);
  console.log(`${dev.hostname} · ${dev.oltDevice?.vendor} ${dev.oltDevice?.model}\n`);

  for (const u of urutan) {
    const perintah = u.split("|").map((s) => s.trim()).filter(Boolean);
    console.log(`──────── ${perintah.join(" → ")} ────────`);
    try {
      const out = await jalankanPerintahMultiPort(
        { host: dev.hostname, user: kred.user, password: kred.password },
        [kred.port, 23],
        perintah
      );
      const teks = typeof out === "string" ? out : (out as { transkrip?: string; keluaran?: string }).transkrip ?? (out as { keluaran?: string }).keluaran ?? JSON.stringify(out);
      console.log(String(teks).split("\n").slice(-22).join("\n"));
    } catch (e) {
      console.log(`  gagal: ${(e as Error).message.split("\n")[0]}`);
    }
    console.log();
  }
}
main().finally(() => db.$disconnect());
