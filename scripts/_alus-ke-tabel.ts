/**
 * Mengubah salinan data ALUS (JSON) menjadi tabel yang dibaca parser kita.
 *
 *   npx tsx scripts/_alus-ke-tabel.ts alus.json keluar/
 *
 * Sengaja TIDAK menulis parser baru untuk ALUS. Bentuk tabelnya diseragamkan
 * ke judul kolom yang sudah dikenali `parseOdpBlocks` dan `parseCustomerSheet`,
 * sehingga seluruh aturan yang sudah diuji — penolakan koordinat (0,0),
 * pemulihan kode, pemetaan status, hierarki induk — berlaku apa adanya untuk
 * sumber ini juga.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

interface AlusPelanggan {
  cid: string; odp: string; olt: string; onu: string;
  status: string; nama: string; plan: string; alamat: string;
}
interface AlusOdp {
  kode: string; kapasitas: number | null; redaman: string | null;
  koordinat: string | null; induk: string | null; site: string | null; grup: string | null;
}

const [, , src, outDir = "."] = process.argv;
if (!src) {
  console.error("Pakai: npx tsx scripts/_alus-ke-tabel.ts <alus.json> [folder-keluar]");
  process.exit(1);
}
const d = JSON.parse(readFileSync(src, "utf8")) as { pelanggan: AlusPelanggan[]; odp: AlusOdp[] };
mkdirSync(outDir, { recursive: true });

// ── ODP ──
//
// `grup` berbentuk "OLT ZTE C600 Abang 1/1/11 3/128": nama OLT, port PON, lalu
// rasio splitter. Dipecah di sini, bukan di parser, sebab bentuk itu khas ALUS
// dan parser harus tetap bisa membaca spreadsheet yang tidak punya kolom ini.
function pecahGrup(g: string | null): { olt: string; pon: string } {
  if (!g) return { olt: "", pon: "" };
  const m = /^(.*?)\s+(\d+\/\d+\/\d+|\d+\/\d+|Port\s+\d+)\s*(\d+\/\d+)?\s*$/i.exec(g.trim());
  return m ? { olt: m[1].trim(), pon: m[2].trim() } : { olt: g.trim(), pon: "" };
}

const ODP_HEAD = [
  "KODE ODP/MS", "Tipe", "Status", "Redaman Input", "Kordinat ODP",
  "Master Spliter", "Port MS", "OLT", "PIU", "Port ODP", "Site",
];
const odpRows = d.odp.map((o) => {
  const { olt, pon } = pecahGrup(o.grup);
  return [
    o.kode,
    /^MS\b/i.test(o.kode) ? "MS" : "ODP",
    "Aktif",
    o.redaman ?? "",
    o.koordinat ?? "",
    o.induk ?? "",
    "",
    olt,
    pon,
    o.kapasitas != null ? String(o.kapasitas) : "",
    o.site ?? "",
  ];
});

// ── Pelanggan ──
//
// Judul kolom sengaja memakai nama yang sudah ada di daftar alias parser
// pelanggan, supaya tidak perlu menambah alias baru untuk sumber ini.
const CUST_HEAD = [
  "Customer Id", "Name", "Address", "Plan", "Status",
  "Distribution Point (ODP)", "PPPOE User", "Merchant",
];
const custRows = d.pelanggan.map((p) => [
  p.cid,
  p.nama,
  p.alamat,
  p.plan,
  p.status,
  p.odp,
  // ALUS tidak memuat username PPPoE pada tabel ini. Dikosongkan, BUKAN
  // diisi CID: pada pelanggan lama keduanya berbeda, dan menyamakannya
  // akan memutus pencocokan ke sesi yang benar-benar hidup di router.
  "",
  p.olt,
]);

writeFileSync(`${outDir}/odp.json`, JSON.stringify([ODP_HEAD, ...odpRows]));
writeFileSync(`${outDir}/pelanggan.json`, JSON.stringify([CUST_HEAD, ...custRows]));

const site = new Map<string, number>();
for (const o of d.odp) if (o.site) site.set(o.site, (site.get(o.site) ?? 0) + 1);
const olt = new Map<string, number>();
for (const o of d.odp) { const { olt: n } = pecahGrup(o.grup); if (n) olt.set(n, (olt.get(n) ?? 0) + 1); }

console.log("ODP      :", odpRows.length);
console.log("pelanggan:", custRows.length);
console.log("site     :", [...site].map(([k, v]) => `${k}=${v}`).join(" · "));
console.log("OLT      :", [...olt].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(" · "));
console.log(`\nditulis ke ${outDir}/odp.json dan ${outDir}/pelanggan.json`);
