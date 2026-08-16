/**
 * Membuat `BillingProfile` untuk langganan yang belum punya, dari data tanggal
 * penagihan sistem lama.
 *
 *   npx tsx scripts/_siapkan-profil-tagihan.ts tagih.tsv
 *   npx tsx scripts/_siapkan-profil-tagihan.ts tagih.tsv --terapkan
 *
 * `tagih.tsv`: nomor layanan <TAB> tanggal mulai (YYYY-MM-DD) <TAB> tanggal isolir
 *
 * TIDAK MENERBITKAN SATU PUN TAGIHAN. Profil hanya menentukan SIAPA yang kelak
 * ditagih dan pada tanggal berapa; invoice baru lahir ketika sebuah
 * `InvoiceRun` dijalankan, dan itu langkah terpisah yang disengaja.
 *
 * Tiga penyesuaian yang dilakukan, semuanya dilaporkan per baris:
 *
 *  - Tanggal terbit 29–31 dipotong ke 28. Skema membatasi 1–28 dengan alasan
 *    yang benar: tanggal 29–31 tidak ada di setiap bulan, dan penagihan yang
 *    kadang-kadang tidak terbit lebih buruk daripada terbit tiga hari lebih awal.
 *  - Tanggal isolir 0 menjadi null — tidak diisolir otomatis. Hampir seluruhnya
 *    akun perusahaan dan akun gratis.
 *  - Tanggal isolir di luar 1–28 dipotong ke 28, dengan alasan yang sama.
 */
import { readFileSync } from "node:fs";
import { db } from "@/lib/db";
import { saveBillingProfile } from "@/lib/billing";

const berkas = process.argv[2];
const terapkan = process.argv.includes("--terapkan");
const DUE_DAYS = 20; // bawaan skema; ALUS tidak menyimpan jangka tempo terpisah

async function main() {
  if (!berkas) throw new Error("Pakai: _siapkan-profil-tagihan.ts <tagih.tsv> [--terapkan]");
  // `saveBillingProfile` hanya memakai `user.id` untuk catatan audit.
  const user = await db.user.findFirstOrThrow({ select: { id: true } });

  const peta = new Map<string, { mulai: Date; isolir: number | null }>();
  for (const l of readFileSync(berkas, "utf8").split("\n")) {
    const [cid, tgl, iso] = l.trim().split("\t");
    if (!cid || !tgl) continue;
    peta.set(cid.toUpperCase(), {
      mulai: new Date(`${tgl}T00:00:00.000Z`),
      isolir: iso && Number(iso) > 0 ? Math.min(Number(iso), 28) : null,
    });
  }

  const subs = await db.subscription.findMany({
    where: { status: { notIn: ["TERMINATED"] }, billingProfile: null },
    select: { id: true, serviceNumber: true, status: true },
    orderBy: { serviceNumber: "asc" },
  });

  let dibuat = 0, dipotong = 0, tanpaData = 0, gagal = 0;
  const contohPotong: string[] = [];
  const contohTanpa: string[] = [];

  for (const s of subs) {
    const d = peta.get(s.serviceNumber.toUpperCase());
    if (!d) {
      tanpaData++;
      if (contohTanpa.length < 8) contohTanpa.push(s.serviceNumber);
      continue;
    }
    const hariAsli = d.mulai.getUTCDate();
    const invoiceDay = Math.min(hariAsli, 28);
    if (invoiceDay !== hariAsli) {
      dipotong++;
      if (contohPotong.length < 5) contohPotong.push(`${s.serviceNumber} tgl ${hariAsli} → 28`);
    }
    if (!terapkan) { dibuat++; continue; }
    const r = await saveBillingProfile(user as never, {
      subscriptionId: s.id,
      billingStartAt: d.mulai,
      invoiceDay,
      dueDays: DUE_DAYS,
      isolirDay: d.isolir,
      taxPercent: 0, // ALUS tidak menagih PPN pada paket ritel; diubah per pelanggan bila perlu
    });
    if (r.ok) dibuat++; else { gagal++; console.log(`  GAGAL ${s.serviceNumber}: ${r.error}`); }
  }

  console.log(terapkan ? "═══ PROFIL DIBUAT ═══" : "═══ PERIKSA (tidak menulis apa pun) ═══");
  console.log(`  langganan tanpa profil : ${subs.length}`);
  console.log(`  ${terapkan ? "dibuat" : "akan dibuat"}          : ${dibuat}`);
  console.log(`  tanggal dipotong ke 28 : ${dipotong}`);
  for (const c of contohPotong) console.log(`     ${c}`);
  console.log(`  tanpa data tanggal     : ${tanpaData}`);
  for (const c of contohTanpa) console.log(`     ${c}`);
  if (gagal) console.log(`  gagal                  : ${gagal}`);
  console.log("\n  Tidak ada satu pun invoice terbit — itu langkah terpisah (InvoiceRun).");
}
main().catch((e) => { console.error("GAGAL:", e.message); process.exit(1); }).finally(() => db.$disconnect());
