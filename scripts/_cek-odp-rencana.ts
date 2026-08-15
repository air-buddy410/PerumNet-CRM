/** Uji kering rencana penerapan ODP — tanpa menulis apa pun. */
import { readFileSync } from "node:fs";
import { buildOdpPlan, KAPASITAS_BAWAAN } from "@/lib/odp-import-service";
import { db } from "@/lib/db";

function toRows(b: string[]): string[][] {
  return b
    .filter((l) => ![...l.replace(/[|\s]/g, "")].every((c) => c === ":" || c === "-"))
    .map((l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim().replace(/\\/g, "")));
}

async function main() {
  const lines = readFileSync(process.argv[2], "utf8").split("\n");
  const blocks: string[][][] = [];
  let cur: string[] = [];
  let prev: number | null = null;
  for (const l of lines) {
    const n = (l.match(/\|/g) ?? []).length;
    if (n === 0) continue;
    if (prev !== null && n !== prev) { blocks.push(toRows(cur)); cur = []; }
    cur.push(l); prev = n;
  }
  if (cur.length) blocks.push(toRows(cur));

  const r = await buildOdpPlan(blocks);
  if (!r.ok) { console.error(r.error); process.exit(1); }
  const p = r.data.plan;
  console.log("boleh diterapkan :", p.ok);
  console.log("ODP/MS dibuat    :", p.willCreate, `(${p.willCreateMs} Master Splitter)`);
  console.log("dilengkapi       :", p.willComplete, "| dilewati:", p.willSkip);
  console.log("port dibuat      :", p.willCreatePorts, `(bawaan ${KAPASITAS_BAWAAN} bila tak disebut)`);
  console.log("kaitan induk     :", p.willLinkParents);
  console.log("masalah          :", p.issues.length);
  console.log("blok dilewati    :", p.ignoredBlocks, "| baris dilewati:", p.skipped);
  console.log("nama di port yang tidak cocok:", p.unmatchedOccupants.length);
  console.log("  contoh:", p.unmatchedOccupants.slice(0, 4).join(" · "));
  await db.$disconnect();
}
main();
