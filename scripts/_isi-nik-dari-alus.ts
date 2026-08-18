/**
 * Mengisi NIK pelanggan yang masih kosong, dari data yang dipanen dari ALUS.
 *
 *   npx tsx scripts/_isi-nik-dari-alus.ts data/nik-alus.tsv
 *   npx tsx scripts/_isi-nik-dari-alus.ts data/nik-alus.tsv --terapkan
 *
 * Berkas TSV dua kolom — `cid` dan `id_card` — dengan baris judul di atas,
 * hasil panen dari layar ALUS. TSV, bukan JSON, supaya isinya bisa diperiksa
 * mata sebelum dijalankan: ini data identitas orang, dan berkas yang tidak
 * bisa dibaca manusia adalah berkas yang tidak pernah diperiksa siapa pun.
 *
 * `cid` dicocokkan ke `Subscription.serviceNumber`.
 *
 * ══ YANG TIDAK DILAKUKAN SKRIP INI ══
 *
 * - **Tidak pernah menimpa NIK yang sudah terisi.** Yang ada di CRM dianggap
 *   lebih bisa dipercaya: ia sudah melewati mata orang, sedangkan yang di ALUS
 *   belum tentu. Kalau keduanya terisi dan BERBEDA, itu dilaporkan sebagai
 *   selisih untuk diperiksa manusia — bukan diputuskan sendiri oleh skrip.
 * - **Tidak menyentuh ALUS.** Ini hanya membaca berkas JSON.
 * - **Tidak menerima apa pun yang bukan 16 digit.** ALUS memuat sampah nyata —
 *   akun "Perumnet Office" berisi `123456`. Menyalinnya buta berarti menaruh
 *   sampah di kolom yang justru dipakai untuk memastikan identitas orang.
 *
 * ══ SOAL `@unique` ══
 *
 * `Customer.identityNumber` unik. Dua pelanggan dengan NIK sama akan menabrak
 * batasan itu, dan kalau ditulis satu per satu tanpa dijaga, yang kedua
 * meledak di tengah jalan dan meninggalkan pekerjaan separuh selesai. Jadi
 * tabrakan dideteksi SEBELUM menulis apa pun, lalu dilaporkan dan dilewati.
 * Dua orang dengan NIK sama bukan kesalahan teknis — itu kesalahan data yang
 * perlu dilihat manusia.
 */
import { readFileSync } from "node:fs";
import { db } from "@/lib/db";

interface BarisAlus {
  cid: string;
  nama?: string;
  idCard?: string;
  lahir?: string;
}

const berkas = process.argv[2];
const terapkan = process.argv.includes("--terapkan");

/**
 * Membuang karakter tak terlihat.
 *
 * Data ALUS memuat tanda arah teks (U+200E dan kerabatnya) yang menempel di
 * depan sebagian CID. `trim()` TIDAK membuangnya — ia hanya mengenal spasi —
 * sehingga CID-nya tidak akan pernah cocok dan pelanggannya dilaporkan "tak
 * dikenal" padahal ada. Ini pernah terjadi: satu pelanggan muncul sekaligus di
 * daftar "hanya di ALUS" dan "hanya di CRM".
 */
function bersihkan(s: string | undefined): string {
  return (s ?? "").replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, "").trim();
}

/** NIK sah: tepat 16 digit. Selain itu ditolak, apa pun bentuknya. */
function nikSah(nilai: string | undefined): string | null {
  const bersih = bersihkan(nilai).replace(/\s|-/g, "");
  return /^\d{16}$/.test(bersih) ? bersih : null;
}

async function main() {
  if (!berkas) throw new Error("Pakai: _isi-nik-dari-alus.ts <berkas.tsv> [--terapkan]");
  const baris = readFileSync(berkas, "utf8").split(/\r?\n/).filter((l) => l.trim());
  // Baris judul dibuang hanya kalau memang judul — supaya berkas tanpa judul
  // tidak diam-diam kehilangan pelanggan pertamanya.
  const mulai = /^\s*cid\b/i.test(baris[0] ?? "") ? 1 : 0;
  const data: BarisAlus[] = baris.slice(mulai).map((l) => {
    const [cid, idCard] = l.split("\t");
    return { cid: cid ?? "", idCard: idCard ?? "" };
  });

  console.log(terapkan ? "═══ DITERAPKAN ═══\n" : "═══ RENCANA SAJA (tambahkan --terapkan) ═══\n");
  console.log(`Baris dari ALUS: ${data.length}`);

  // Peta CID → pelanggan kita. Satu pelanggan bisa punya lebih dari satu
  // langganan; yang dipetakan adalah pelanggannya.
  const langganan = await db.subscription.findMany({
    select: { serviceNumber: true, customer: { select: { id: true, name: true, identityNumber: true } } },
  });
  const perCid = new Map(langganan.map((s) => [s.serviceNumber.toUpperCase(), s.customer]));
  console.log(`Langganan di CRM: ${langganan.length}`);

  // NIK yang SUDAH dipakai — dipakai untuk mendeteksi tabrakan sebelum menulis.
  const sudahDipakai = new Map<string, string>();
  for (const s of langganan) {
    if (s.customer.identityNumber) sudahDipakai.set(s.customer.identityNumber, s.customer.name);
  }

  const akanDiisi: { cid: string; customerId: string; nama: string; nik: string }[] = [];
  const tolakBentuk: { cid: string; nilai: string }[] = [];
  const kosongDiAlus: string[] = [];
  const takDikenal: string[] = [];
  const sudahAda: string[] = [];
  const beda: { cid: string; nama: string; kita: string; alus: string }[] = [];
  const tabrakan: { cid: string; nama: string; nik: string; dipakaiOleh: string }[] = [];

  // Tabrakan bisa juga terjadi ANTAR baris di berkas yang sama, bukan hanya
  // dengan yang sudah ada di basis data.
  const dipesan = new Map<string, string>();

  for (const r of data) {
    const cid = bersihkan(r.cid).toUpperCase();
    if (!cid) continue;
    const pelanggan = perCid.get(cid);
    if (!pelanggan) {
      takDikenal.push(cid);
      continue;
    }

    const nik = nikSah(r.idCard);
    if (!nik) {
      if ((r.idCard ?? "").trim()) tolakBentuk.push({ cid, nilai: (r.idCard ?? "").trim() });
      else kosongDiAlus.push(cid);
      continue;
    }

    if (pelanggan.identityNumber) {
      if (pelanggan.identityNumber === nik) sudahAda.push(cid);
      else beda.push({ cid, nama: pelanggan.name, kita: pelanggan.identityNumber, alus: nik });
      continue;
    }

    const pemilikLain = sudahDipakai.get(nik) ?? dipesan.get(nik);
    if (pemilikLain) {
      tabrakan.push({ cid, nama: pelanggan.name, nik, dipakaiOleh: pemilikLain });
      continue;
    }

    dipesan.set(nik, pelanggan.name);
    akanDiisi.push({ cid, customerId: pelanggan.id, nama: pelanggan.name, nik });
  }

  console.log(`\n── Ringkasan ──`);
  console.log(`  Akan diisi          : ${akanDiisi.length}`);
  console.log(`  Sudah sama          : ${sudahAda.length}`);
  console.log(`  Kosong juga di ALUS : ${kosongDiAlus.length}`);
  console.log(`  Ditolak (bukan 16 digit): ${tolakBentuk.length}`);
  console.log(`  CID tak dikenal CRM : ${takDikenal.length}`);
  console.log(`  BERBEDA (perlu mata manusia): ${beda.length}`);
  console.log(`  Tabrakan NIK kembar : ${tabrakan.length}`);

  if (tolakBentuk.length) {
    console.log(`\n── Ditolak karena bentuknya bukan 16 digit ──`);
    for (const t of tolakBentuk.slice(0, 20)) console.log(`  ${t.cid.padEnd(14)} "${t.nilai}"`);
    if (tolakBentuk.length > 20) console.log(`  … dan ${tolakBentuk.length - 20} lagi`);
  }

  if (beda.length) {
    console.log(`\n── NIK BERBEDA antara CRM dan ALUS — TIDAK disentuh ──`);
    for (const b of beda) console.log(`  ${b.cid.padEnd(14)} ${b.nama}\n      CRM : ${b.kita}\n      ALUS: ${b.alus}`);
  }

  if (tabrakan.length) {
    console.log(`\n── NIK kembar — TIDAK diisi, perlu diperiksa ──`);
    for (const t of tabrakan) console.log(`  ${t.cid.padEnd(14)} ${t.nama} → ${t.nik} sudah dipakai ${t.dipakaiOleh}`);
  }

  if (!terapkan) {
    console.log(`\nBelum ada yang ditulis. Ulangi dengan --terapkan kalau ringkasan di atas benar.`);
    return;
  }

  let terisi = 0;
  for (const a of akanDiisi) {
    try {
      await db.customer.update({ where: { id: a.customerId }, data: { identityNumber: a.nik } });
      terisi++;
    } catch (e) {
      console.log(`  GAGAL ${a.cid} (${a.nama}): ${(e as Error).message.split("\n")[0]}`);
    }
  }
  console.log(`\n${terisi} NIK terisi.`);

  const sisa = await db.customer.count({ where: { identityNumber: null } });
  console.log(`Pelanggan yang NIK-nya masih kosong: ${sisa}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
