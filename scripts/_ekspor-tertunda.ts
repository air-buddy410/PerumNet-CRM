/**
 * Mengeluarkan pekerjaan pemetaan yang butuh keputusan manusia ke satu berkas
 * Excel, supaya bisa dikerjakan tim lapangan alih-alih mengendap sebagai angka
 * di layar.
 *
 *   npx tsx scripts/_ekspor-tertunda.ts [berkas.xlsx]
 *
 * HANYA MEMBACA. Tidak satu pun baris di basis data disentuh.
 *
 * Tiga hal yang tidak bisa diputuskan mesin, dan alasannya berbeda-beda:
 *
 *  1. Sesi PPPoE yang nomornya cocok tetapi namanya tidak. Menebak berarti
 *     menautkan sesi ke pelanggan yang salah — kesalahan yang menyamar
 *     sebagai pekerjaan selesai.
 *  2. Sesi PPPoE yang tidak punya kandidat sama sekali. Nomornya tidak ada
 *     di tabel langganan mana pun; kemungkinan pelanggan lama yang belum
 *     dimigrasi, atau username yang sudah tidak dipakai.
 *  3. Pelanggan yang tidak kebagian port karena ODP-nya penuh. Kapasitasnya
 *     berasal dari sumber luar dan bisa saja tertinggal dari kenyataan; yang
 *     benar diputuskan di lapangan, bukan di sini.
 *
 * Kolom "KEPUTUSAN" sengaja dikosongkan — itu yang diisi tim.
 */
import { writeFileSync } from "node:fs";
import { matchUsernames, numbersIn, nameCorroborates } from "@/lib/pppoe-match";
import { buildWorkbook, type Lembar } from "@/lib/xlsx-write";
import { db } from "@/lib/db";

const berkas = process.argv[2] ?? "pemetaan-tertunda.xlsx";

async function main() {
  const subs = await db.subscription.findMany({
    select: {
      serviceNumber: true,
      pppoeUsername: true,
      customer: { select: { name: true, address: true, phone: true } },
    },
  });
  const kandidat = subs.map((s) => ({ serviceNumber: s.serviceNumber, customerName: s.customer.name }));
  const detail = new Map(subs.map((s) => [s.serviceNumber, s]));

  const sesi = await db.pppoeSession.findMany({
    where: { subscriptionId: null },
    select: { username: true, lastSeenAt: true, address: true, callerId: true, status: true },
    distinct: ["username"],
    orderBy: { username: "asc" },
  });
  const terakhir = new Map(sesi.map((s) => [s.username, s]));

  const hasil = matchUsernames(sesi.map((s) => s.username), kandidat);

  // Indeks akhiran, sama seperti yang dipakai pencocokan — supaya kandidat
  // yang ditolak bisa DITAMPILKAN, bukan sekadar dihitung.
  const byTail = new Map<string, typeof kandidat>();
  for (const k of kandidat) {
    const d = k.serviceNumber.replace(/\D/g, "");
    for (let len = 4; len <= d.length; len++) {
      const t = d.slice(-len);
      byTail.set(t, [...(byTail.get(t) ?? []), k]);
    }
  }

  const tanggal = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

  // ── Lembar 1: ada kandidat, namanya tidak menguatkan ────────────
  const ambigu: string[][] = [[
    "Username PPPoE", "Status", "Terakhir online", "IP terakhir", "MAC (caller-id)",
    "Kandidat: Nomor Layanan", "Kandidat: Nama Pelanggan", "Kandidat: Alamat",
    "Nama cocok?", "KEPUTUSAN (isi: BENAR / SALAH / kosongkan bila ragu)", "CATATAN",
  ]];
  for (const u of hasil.ambiguous) {
    const set = new Map<string, { serviceNumber: string; customerName: string }>();
    for (const n of numbersIn(u)) for (const k of byTail.get(n) ?? []) set.set(k.serviceNumber, k);
    const s = terakhir.get(u);
    const daftar = [...set.values()];
    if (daftar.length === 0) {
      ambigu.push([u, s?.status ?? "", tanggal(s?.lastSeenAt), s?.address ?? "", s?.callerId ?? "", "", "", "", "", "", ""]);
      continue;
    }
    // Satu baris per kandidat. Username diulang supaya tiap baris berdiri
    // sendiri saat tim menyaring atau mengurutkan lembarnya.
    for (const k of daftar) {
      const d = detail.get(k.serviceNumber);
      ambigu.push([
        u, s?.status ?? "", tanggal(s?.lastSeenAt), s?.address ?? "", s?.callerId ?? "",
        k.serviceNumber, k.customerName, d?.customer.address ?? "",
        nameCorroborates(u, k.customerName) ? "ya" : "tidak",
        "", "",
      ]);
    }
  }

  // ── Lembar 2: tidak ada kandidat sama sekali ────────────────────
  const tanpaKandidat: string[][] = [[
    "Username PPPoE", "Status", "Terakhir online", "IP terakhir", "MAC (caller-id)",
    "Angka di dalam username", "KEPUTUSAN (isi Nomor Layanan, atau: TIDAK DIPAKAI)", "CATATAN",
  ]];
  for (const u of hasil.unmatched) {
    const s = terakhir.get(u);
    tanpaKandidat.push([
      u, s?.status ?? "", tanggal(s?.lastSeenAt), s?.address ?? "", s?.callerId ?? "",
      numbersIn(u).join(" · "), "", "",
    ]);
  }

  // ── Lembar 3: pelanggan tanpa port ODP ──────────────────────────
  const tanpaPort = await db.subscription.findMany({
    where: { odpPort: null },
    select: {
      serviceNumber: true, pppoeUsername: true,
      customer: { select: { name: true, address: true, phone: true } },
      package: { select: { name: true } },
    },
    orderBy: { serviceNumber: "asc" },
  });
  const odpPenuh = await db.odp.findMany({
    where: { portUsed: { gte: 1 } },
    select: { code: true, portCapacity: true, portUsed: true, role: true, latitude: true, longitude: true },
    orderBy: { code: "asc" },
  });
  const sesak = odpPenuh.filter((o) => o.portUsed >= o.portCapacity);

  const pelangganTanpaPort: string[][] = [[
    "Nomor Layanan", "Nama Pelanggan", "Alamat", "Telepon", "Paket", "Username PPPoE",
    "KEPUTUSAN: Kode ODP", "KEPUTUSAN: Nomor Port", "CATATAN",
  ]];
  for (const t of tanpaPort) {
    pelangganTanpaPort.push([
      t.serviceNumber, t.customer.name, t.customer.address, t.customer.phone,
      t.package?.name ?? "", t.pppoeUsername ?? "", "", "", "",
    ]);
  }

  // ── Lembar 4: ODP yang portnya habis ────────────────────────────
  const odpSesak: string[][] = [[
    "Kode ODP", "Peran", "Port terpakai", "Kapasitas tercatat", "Lintang", "Bujur",
    "KEPUTUSAN: Kapasitas sebenarnya (8 atau 16)", "CATATAN",
  ]];
  for (const o of sesak) {
    odpSesak.push([
      o.code, o.role, String(o.portUsed), String(o.portCapacity),
      o.latitude?.toString() ?? "", o.longitude?.toString() ?? "", "", "",
    ]);
  }

  // ── Lembar 0: cara memakainya ───────────────────────────────────
  const petunjuk: string[][] = [
    ["PEMETAAN YANG MENUNGGU KEPUTUSAN ORANG"],
    [""],
    ["Berkas ini dibuat dari basis data produksi dan HANYA DIBACA — mengisinya tidak"],
    ["mengubah apa pun sampai berkasnya dikirim balik dan diimpor."],
    [""],
    ["Isi hanya kolom yang berawalan KEPUTUSAN dan CATATAN. Jangan mengubah kolom lain,"],
    ["jangan menghapus baris, dan jangan mengganti nama tab — importirnya mengenali"],
    ["kolom dari NAMANYA, jadi urutan kolom boleh berubah tetapi namanya tidak."],
    [""],
    ["Ragu = biarkan kosong. Baris kosong dilewati begitu saja saat impor."],
    ["Menebak jauh lebih mahal daripada membiarkan: tautan yang salah terlihat seperti"],
    ["pekerjaan yang sudah selesai, sedangkan yang kosong terlihat sebagai sisa kerja."],
    [""],
    ["ISI TIAP TAB"],
    ["1. Sesi ambigu", `${hasil.ambiguous.length} username · nomornya cocok, namanya tidak.`],
    ["", "Satu username bisa punya beberapa baris kandidat. Tandai BENAR pada satu saja."],
    ["2. Tanpa kandidat", `${hasil.unmatched.length} username · nomornya tidak ada di langganan mana pun.`],
    ["", "Kolom Status paling menolong di sini: yang OFFLINE dan tak pernah terlihat online"],
    ["", "hampir pasti sudah tidak dipakai — tulis TIDAK DIPAKAI, jangan dicari-cari."],
    ["", "Kemungkinan pelanggan lama yang belum dimigrasi. Isi Nomor Layanan bila ketemu."],
    ["3. Pelanggan tanpa port", `${tanpaPort.length} pelanggan aktif · ODP-nya sudah penuh menurut catatan.`],
    ["4. ODP penuh", `${sesak.length} ODP · periksa di lapangan, kapasitasnya mungkin tertinggal.`],
    [""],
    ["Splitter yang dipakai HANYA 1:8 dan 1:16. Kalau pelanggan tidak kebagian port,"],
    ["artinya ODP-nya berbeda atau sambungannya memang sudah tidak aktif."],
  ];

  const lembar: Lembar[] = [
    { nama: "Petunjuk", baris: petunjuk },
    { nama: "1. Sesi ambigu", baris: ambigu },
    { nama: "2. Tanpa kandidat", baris: tanpaKandidat },
    { nama: "3. Pelanggan tanpa port", baris: pelangganTanpaPort },
    { nama: "4. ODP penuh", baris: odpSesak },
  ];

  // Judul kolom dan datanya ditulis di tempat yang berbeda, jadi menambah satu
  // kolom pada judul tanpa menambahnya pada baris data adalah kesalahan yang
  // sangat mudah terjadi — dan hasilnya berkas yang tetap terbuka rapi dengan
  // isi kolom yang bergeser satu. Lebih baik gagal di sini.
  for (const l of lembar) {
    if (l.nama === "Petunjuk") continue;
    const lebar = l.baris[0].length;
    const salah = l.baris.findIndex((b) => b.length !== lebar);
    if (salah > 0) {
      throw new Error(
        `Lembar "${l.nama}" baris ${salah + 1} punya ${l.baris[salah].length} kolom, judulnya ${lebar}.`
      );
    }
  }

  writeFileSync(berkas, buildWorkbook(lembar));
  console.log(`Ditulis: ${berkas}`);
  for (const l of lembar.slice(1)) console.log(`  ${l.nama.padEnd(26)} ${l.baris.length - 1} baris`);
  await db.$disconnect();
}

main().catch((e) => { console.error("GAGAL:", e.message); process.exit(1); });
