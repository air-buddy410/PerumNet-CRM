/**
 * Menyelaraskan tempo jatuh tempo dengan tanggal isolir, mengikuti sistem lama.
 *
 *   npx tsx scripts/_selaraskan-tempo.ts
 *   npx tsx scripts/_selaraskan-tempo.ts --terapkan
 *
 * MASALAHNYA. Seluruh 1.715 profil tagihan ber-`dueDays` 20 — nilai bawaan
 * yang dipasang saat impor, bukan angka yang berasal dari sistem lama.
 * Sementara `isolirDay` datang dari sana dan beragam antara 1–28. Akibatnya
 * pada 1.663 profil jatuh temponya JATUH SESUDAH tanggal isolirnya sendiri.
 *
 * ARAH AKIBATNYA — dan ini kebalikan dari dugaan pertama. `evaluateDunning`
 * menuntut DUA syarat: tanggal hari ini sudah melewati `isolirDay`, DAN ada
 * invoice yang lewat tempo. Syarat kedua itulah yang mengikat. Jadi pelanggan
 * tidak diisolir lebih cepat — ia diisolir sekitar dua minggu LEBIH LAMBAT
 * daripada di sistem lama. Bukan bahaya bagi pelanggan; kerugian bagi kas.
 *
 * ATURANNYA, diperiksa terhadap tujuh pelanggan sungguhan dengan tanggal
 * isolir 3, 7, 10, 15, 20, 25, dan 28: **jatuh tempo = tanggal isolir − 1**.
 * Enam dari tujuh cocok persis pada invoice Agustus 2026. Yang ketujuh
 * menyimpang (isolir 28, tempo 15) dan tampak disesuaikan tangan — karena itu
 * skrip ini melaporkan, bukan memaksa, dan tidak menyentuh yang sudah selaras.
 *
 * TIDAK MENERBITKAN APA PUN. Ia hanya mengubah kapan sebuah invoice dianggap
 * lewat tempo; invoice itu sendiri lahir dari InvoiceRun, langkah terpisah.
 */
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

const terapkan = process.argv.includes("--terapkan");

/** Batas yang diterima skema. */
const MIN = 1;
const MAKS = 60;

async function main() {
  const rows = await db.billingProfile.findMany({
    select: {
      id: true,
      invoiceDay: true,
      dueDays: true,
      isolirDay: true,
      subscription: { select: { serviceNumber: true } },
    },
  });

  const ubah: { id: string; nomor: string; dari: number; ke: number }[] = [];
  const lewat: { nomor: string; alasan: string }[] = [];

  for (const r of rows) {
    if (r.isolirDay === null) {
      lewat.push({ nomor: r.subscription.serviceNumber, alasan: "tanpa tanggal isolir" });
      continue;
    }
    // Jatuh tempo sehari sebelum isolir — pola sistem lama.
    const target = r.isolirDay - 1 - r.invoiceDay;
    if (target < MIN || target > MAKS) {
      // Terjadi bila tanggal isolir jatuh SEBELUM atau tepat pada tanggal
      // terbitnya. Itu bukan salah hitung di sini, melainkan pasangan tanggal
      // yang memang tidak masuk akal — dan menebak salah satunya berarti
      // memindahkan hari pemutusan orang.
      lewat.push({
        nomor: r.subscription.serviceNumber,
        alasan: `terbit tgl ${r.invoiceDay}, isolir tgl ${r.isolirDay} — tempo ${target} hari di luar 1–60`,
      });
      continue;
    }
    if (target === r.dueDays) continue;
    ubah.push({ id: r.id, nomor: r.subscription.serviceNumber, dari: r.dueDays, ke: target });
  }

  console.log(terapkan ? "═══ DITERAPKAN ═══\n" : "═══ PERIKSA (tidak menulis apa pun) ═══\n");
  console.log(`Profil diperiksa   : ${rows.length}`);
  console.log(`Sudah selaras      : ${rows.length - ubah.length - lewat.length}`);
  console.log(`Akan diselaraskan  : ${ubah.length}`);
  console.log(`Dilewati           : ${lewat.length}`);

  if (lewat.length) {
    const per = new Map<string, number>();
    for (const l of lewat) per.set(l.alasan.replace(/\d+/g, "N"), (per.get(l.alasan.replace(/\d+/g, "N")) ?? 0) + 1);
    console.log("\nAlasan dilewati:");
    for (const [a, n] of [...per].sort((x, y) => y[1] - x[1])) console.log(`  ${String(n).padStart(5)}  ${a}`);
    console.log("  contoh:", lewat.slice(0, 5).map((l) => `${l.nomor} (${l.alasan})`).join(" · "));
  }

  if (ubah.length) {
    const sebaran = new Map<string, number>();
    for (const u of ubah) sebaran.set(`${u.dari} → ${u.ke}`, (sebaran.get(`${u.dari} → ${u.ke}`) ?? 0) + 1);
    console.log("\nPerubahan tempo (hari):");
    for (const [k, n] of [...sebaran].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
      console.log(`  ${String(n).padStart(5)}  ${k}`);
    }
  }

  if (!terapkan) return;

  for (const u of ubah) {
    await db.billingProfile.update({ where: { id: u.id }, data: { dueDays: u.ke } });
  }
  const user = await db.user.findFirstOrThrow({ where: { isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
  await logAudit({
    userId: user.id,
    action: "BILLING_DUE_ALIGN",
    module: "billing",
    entityType: "BillingProfile",
    description:
      `Menyelaraskan tempo jatuh tempo dengan tanggal isolir mengikuti sistem lama: ` +
      `${ubah.length} profil diubah, ${lewat.length} dilewati.`,
  });
  console.log(`\nSelesai — ${ubah.length} profil diselaraskan. Tidak ada invoice yang terbit.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
