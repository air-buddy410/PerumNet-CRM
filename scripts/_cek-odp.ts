/** Uji kering parser ODP terhadap sheet Operasional. */
import { readFileSync } from "node:fs";
import { parseOdpBlocks } from "@/lib/odp-import";

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

function toRows(b: string[]): string[][] {
  return b
    .filter((l) => ![...l.replace(/[|\s]/g, "")].every((c) => c === ":" || c === "-"))
    .map((l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim().replace(/\\/g, "")));
}

const h = parseOdpBlocks(blocks);
console.log("blok dilewati :", h.ignoredBlocks);
console.log("ODP/MS terbaca:", h.rows.length);
console.log("baris dilewati:", h.skipped);
console.log("masalah       :", h.issues.length);
console.log("");
console.log("  role MS       :", h.rows.filter((r) => r.role === "MS").length);
console.log("  punya koordinat:", h.rows.filter((r) => r.latitude !== null).length);
console.log("  punya redaman  :", h.rows.filter((r) => r.opticPowerDbm !== null).length);
console.log("  punya induk MS :", h.rows.filter((r) => r.parentRef).length);
console.log("  punya kapasitas:", h.rows.filter((r) => r.portCapacity !== null).length);
console.log("  punya OLT      :", h.rows.filter((r) => r.oltRef).length);
console.log("  pelanggan di port:", h.rows.reduce((a, r) => a + r.occupants.length, 0));
console.log("\n── contoh ──");
for (const r of h.rows.filter((x) => x.occupants.length).slice(0, 3)) {
  console.log(`  ${r.code} [${r.role}] ${r.latitude ?? "-"},${r.longitude ?? "-"} ${r.opticPowerDbm ?? "-"}dBm induk=${r.parentRef ?? "-"} kapasitas=${r.portCapacity ?? "-"}`);
  for (const o of r.occupants.slice(0, 3)) console.log(`      port ${o.portNumber}: ${o.customerName}`);
}
