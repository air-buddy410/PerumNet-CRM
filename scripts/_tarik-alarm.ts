/**
 * Menarik alarm aktif dari LibreNMS — jaring pengaman untuk webhook.
 *
 *   npx tsx scripts/_tarik-alarm.ts
 *
 * Aman dijalankan berulang: dedup memakai kunci yang SAMA dengan webhook, jadi
 * alarm yang sudah masuk lewat webhook tidak akan tercatat dua kali.
 *
 * Cocok dipasang di penjadwal tiap beberapa menit. Kalau webhook sehat, hampir
 * setiap putaran tidak menghasilkan apa-apa — dan itu memang tujuannya.
 */
import { tarikAlarmLibrenms } from "@/lib/librenms-alerts";
import { db } from "@/lib/db";

async function main() {
  const hasil = await tarikAlarmLibrenms();
  if (!hasil.ok) {
    console.error("Gagal: " + hasil.error);
    process.exit(1);
  }
  const d = hasil.data;
  console.log(`Aktif di LibreNMS : ${d.aktifDiLibre}`);
  console.log(`Dimasukkan/diperbarui: ${d.dimasukkan}`);
  console.log(`Gagal             : ${d.gagal}`);
  console.log(`Ditutup (hantu)   : ${d.ditutup}`);
  for (const c of d.catatan) console.log(`  ${c}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
