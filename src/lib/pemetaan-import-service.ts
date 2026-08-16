// ── Menerapkan keputusan tim atas pemetaan tertunda (Fase 75) ───
//
// Lapisan ini yang menyentuh basis data. Aturan bacanya ada di
// `pemetaan-import.ts` dan sudah diuji tanpa basis data sama sekali; di sini
// yang diperiksa hanya hal-hal yang memang butuh melihat isi tabel: nomornya
// ada atau tidak, portnya kosong atau sudah ditempati.
//
// SATU HAL YANG PALING PENTING DI BERKAS INI:
//
// Tautan sesi PPPoE ditulis ke `Subscription.pppoeUsername`, BUKAN ke
// `PppoeSession.subscriptionId`. Poll PPPoE menurunkan ulang kolom itu dari
// `Subscription.pppoeUsername` setiap 120 detik — jadi menulis langsung ke
// tabel sesi berarti seluruh keputusan tim terhapus dua menit setelah
// diterapkan, tanpa galat dan tanpa jejak. `PppoeSession.subscriptionId` ikut
// diisi hanya supaya layar langsung benar sebelum poll berikutnya.

import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { bacaKeputusan, type HasilBaca, type Masalah } from "@/lib/pemetaan-import";

export interface BarisHasil {
  jenis: "TAUT" | "ABAIKAN" | "PORT" | "KAPASITAS";
  kunci: string;
  /** SIAP bila akan diterapkan, LEWAT bila sudah begitu, TOLAK bila tidak bisa. */
  status: "SIAP" | "LEWAT" | "TOLAK";
  pesan: string;
}

export interface HasilPemetaan {
  baris: BarisHasil[];
  masalah: Masalah[];
  dilewati: number;
  ringkas: { siap: number; lewat: number; tolak: number };
}

type Lembar = { nama: string; baris: string[][] };

/**
 * Memeriksa seluruh keputusan tanpa mengubah apa pun.
 *
 * Dipakai oleh pratinjau, DAN dipakai ulang oleh penerapan — supaya yang
 * diterapkan persis yang ditampilkan, bukan hasil pemeriksaan kedua yang
 * kebetulan mirip.
 */
export async function periksaPemetaan(lembar: Lembar[]): Promise<HasilPemetaan> {
  const baca = bacaKeputusan(lembar);
  const baris: BarisHasil[] = [];

  await periksaTaut(baca, baris);
  await periksaAbaikan(baca, baris);
  await periksaPort(baca, baris);
  await periksaKapasitas(baca, baris);

  return {
    baris,
    masalah: baca.masalah,
    dilewati: baca.dilewati,
    ringkas: {
      siap: baris.filter((b) => b.status === "SIAP").length,
      lewat: baris.filter((b) => b.status === "LEWAT").length,
      tolak: baris.filter((b) => b.status === "TOLAK").length,
    },
  };
}

async function periksaTaut(baca: HasilBaca, out: BarisHasil[]): Promise<void> {
  if (baca.taut.length === 0) return;
  const nomor = [...new Set(baca.taut.map((t) => t.serviceNumber))];
  const subs = await db.subscription.findMany({
    where: { serviceNumber: { in: nomor } },
    select: { id: true, serviceNumber: true, pppoeUsername: true, customer: { select: { name: true } } },
  });
  const perNomor = new Map(subs.map((s) => [s.serviceNumber, s]));

  // Username yang SUDAH dipakai langganan lain. Satu username tidak boleh
  // menunjuk dua pelanggan — kalau itu terjadi, poll akan menautkan sesinya
  // ke salah satu secara sembarang.
  const username = [...new Set(baca.taut.map((t) => t.username))];
  const dipakai = await db.subscription.findMany({
    where: { pppoeUsername: { in: username } },
    select: { serviceNumber: true, pppoeUsername: true },
  });
  const pemilik = new Map(dipakai.map((s) => [s.pppoeUsername!, s.serviceNumber]));

  for (const t of baca.taut) {
    const kunci = `${t.username} → ${t.serviceNumber}`;
    const sub = perNomor.get(t.serviceNumber);
    if (!sub) {
      out.push({ jenis: "TAUT", kunci, status: "TOLAK", pesan: `Nomor layanan ${t.serviceNumber} tidak ada.` });
      continue;
    }
    const punyaSiapa = pemilik.get(t.username);
    if (punyaSiapa && punyaSiapa !== t.serviceNumber) {
      out.push({
        jenis: "TAUT", kunci, status: "TOLAK",
        pesan: `Username sudah dipakai ${punyaSiapa}. Lepaskan dari sana dulu bila memang pindah.`,
      });
      continue;
    }
    if (sub.pppoeUsername === t.username) {
      out.push({ jenis: "TAUT", kunci, status: "LEWAT", pesan: "Sudah tertaut sejak sebelumnya." });
      continue;
    }
    if (sub.pppoeUsername) {
      // Menimpa berarti memutus tautan lama diam-diam. Yang lama mungkin
      // benar dan yang baru salah ketik; keduanya tidak bisa dibedakan dari
      // sini, jadi tidak satu pun dipilih.
      out.push({
        jenis: "TAUT", kunci, status: "TOLAK",
        pesan: `${t.serviceNumber} (${sub.customer.name}) sudah memakai "${sub.pppoeUsername}".`,
      });
      continue;
    }
    out.push({ jenis: "TAUT", kunci, status: "SIAP", pesan: `Ditautkan ke ${sub.customer.name}.` });
  }
}

async function periksaAbaikan(baca: HasilBaca, out: BarisHasil[]): Promise<void> {
  if (baca.abaikan.length === 0) return;
  const sudah = new Set(
    (await db.pppoeIgnored.findMany({
      where: { username: { in: baca.abaikan.map((a) => a.username) } },
      select: { username: true },
    })).map((x) => x.username)
  );
  for (const a of baca.abaikan) {
    out.push({
      jenis: "ABAIKAN", kunci: a.username,
      status: sudah.has(a.username) ? "LEWAT" : "SIAP",
      pesan: sudah.has(a.username) ? "Sudah ditandai tidak dipakai." : "Ditandai tidak dipakai.",
    });
  }
}

async function periksaPort(baca: HasilBaca, out: BarisHasil[]): Promise<void> {
  if (baca.port.length === 0) return;
  const odp = await db.odp.findMany({
    where: { code: { in: [...new Set(baca.port.map((p) => p.odpCode))] } },
    select: { id: true, code: true, portCapacity: true },
  });
  const perKode = new Map(odp.map((o) => [o.code.toUpperCase(), o]));
  const subs = await db.subscription.findMany({
    where: { serviceNumber: { in: [...new Set(baca.port.map((p) => p.serviceNumber))] } },
    select: { id: true, serviceNumber: true, odpPort: { select: { portNumber: true, odp: { select: { code: true } } } } },
  });
  const perNomor = new Map(subs.map((s) => [s.serviceNumber, s]));
  const portAda = await db.odpPort.findMany({
    where: { odpId: { in: odp.map((o) => o.id) } },
    select: { odpId: true, portNumber: true, subscriptionId: true, status: true },
  });
  const kunciPort = new Map(portAda.map((p) => [`${p.odpId}#${p.portNumber}`, p]));

  // Dua baris yang menunjuk port yang sama harus ketahuan di sini, bukan saat
  // penulisan — yang kedua akan gagal dengan galat keunikan yang mentah.
  const diklaim = new Map<string, string>();

  for (const p of baca.port) {
    const kunci = `${p.serviceNumber} → ${p.odpCode} port ${p.portNumber}`;
    const o = perKode.get(p.odpCode);
    if (!o) {
      out.push({ jenis: "PORT", kunci, status: "TOLAK", pesan: `ODP ${p.odpCode} tidak ada.` });
      continue;
    }
    const sub = perNomor.get(p.serviceNumber);
    if (!sub) {
      out.push({ jenis: "PORT", kunci, status: "TOLAK", pesan: `Nomor layanan ${p.serviceNumber} tidak ada.` });
      continue;
    }
    if (p.portNumber > o.portCapacity) {
      out.push({
        jenis: "PORT", kunci, status: "TOLAK",
        pesan: `Port ${p.portNumber} melebihi kapasitas ${o.code} yang tercatat ${o.portCapacity}. Perbaiki kapasitasnya dulu di lembar ODP.`,
      });
      continue;
    }
    if (sub.odpPort) {
      const sama = sub.odpPort.odp.code.toUpperCase() === p.odpCode && sub.odpPort.portNumber === p.portNumber;
      out.push({
        jenis: "PORT", kunci, status: sama ? "LEWAT" : "TOLAK",
        pesan: sama
          ? "Sudah menempati port itu."
          : `Sudah menempati ${sub.odpPort.odp.code} port ${sub.odpPort.portNumber}.`,
      });
      continue;
    }
    const kp = `${o.id}#${p.portNumber}`;
    const bentrokBerkas = diklaim.get(kp);
    if (bentrokBerkas) {
      out.push({ jenis: "PORT", kunci, status: "TOLAK", pesan: `Port itu juga diberikan ke ${bentrokBerkas} di berkas yang sama.` });
      continue;
    }
    const ada = kunciPort.get(kp);
    if (ada?.subscriptionId) {
      out.push({ jenis: "PORT", kunci, status: "TOLAK", pesan: "Port itu sudah ditempati langganan lain." });
      continue;
    }
    diklaim.set(kp, p.serviceNumber);
    out.push({ jenis: "PORT", kunci, status: "SIAP", pesan: "Port diberikan." });
  }
}

async function periksaKapasitas(baca: HasilBaca, out: BarisHasil[]): Promise<void> {
  if (baca.kapasitas.length === 0) return;
  const odp = await db.odp.findMany({
    where: { code: { in: [...new Set(baca.kapasitas.map((k) => k.odpCode))] } },
    select: { id: true, code: true, portCapacity: true, portUsed: true },
  });
  const perKode = new Map(odp.map((o) => [o.code.toUpperCase(), o]));

  for (const k of baca.kapasitas) {
    const kunci = `${k.odpCode} → ${k.kapasitas} port`;
    const o = perKode.get(k.odpCode);
    if (!o) {
      out.push({ jenis: "KAPASITAS", kunci, status: "TOLAK", pesan: `ODP ${k.odpCode} tidak ada.` });
      continue;
    }
    if (o.portCapacity === k.kapasitas) {
      out.push({ jenis: "KAPASITAS", kunci, status: "LEWAT", pesan: "Kapasitasnya memang sudah segitu." });
      continue;
    }
    if (k.kapasitas < o.portUsed) {
      // Menurunkan kapasitas di bawah jumlah yang sudah terpasang akan
      // membuat sebagian pelanggan menempati port yang secara catatan tidak
      // ada. Yang salah bisa jadi justru jumlah terpasangnya — dan itu tidak
      // bisa diputuskan dari sini.
      out.push({
        jenis: "KAPASITAS", kunci, status: "TOLAK",
        pesan: `${o.code} sudah dipakai ${o.portUsed} pelanggan, tidak bisa diturunkan ke ${k.kapasitas}.`,
      });
      continue;
    }
    out.push({
      jenis: "KAPASITAS", kunci, status: "SIAP",
      pesan: `Kapasitas ${o.portCapacity} → ${k.kapasitas}.`,
    });
  }
}

/**
 * Menerapkan yang berstatus SIAP.
 *
 * Yang TOLAK dan LEWAT tidak disentuh sama sekali — hasilnya dikembalikan apa
 * adanya supaya pemanggil bisa menampilkan alasannya. Penerapan tidak
 * dibungkus satu transaksi besar: keputusan-keputusan ini saling bebas, dan
 * menggagalkan 300 baris benar karena satu baris bentrok akan membuat tim
 * mengulang seluruh pekerjaannya.
 */
export async function terapkanPemetaan(lembar: Lembar[], userId: string): Promise<HasilPemetaan> {
  const hasil = await periksaPemetaan(lembar);
  const baca = bacaKeputusan(lembar);
  const siap = new Set(hasil.baris.filter((b) => b.status === "SIAP").map((b) => `${b.jenis}|${b.kunci}`));

  for (const t of baca.taut) {
    if (!siap.has(`TAUT|${t.username} → ${t.serviceNumber}`)) continue;
    const sub = await db.subscription.update({
      where: { serviceNumber: t.serviceNumber },
      data: { pppoeUsername: t.username },
      select: { id: true },
    });
    // Cermin sesi ikut diisi supaya layar langsung benar; poll berikutnya
    // akan menurunkannya lagi dari kolom yang baru saja ditulis di atas.
    await db.pppoeSession.updateMany({ where: { username: t.username }, data: { subscriptionId: sub.id } });
  }

  for (const a of baca.abaikan) {
    if (!siap.has(`ABAIKAN|${a.username}`)) continue;
    await db.pppoeIgnored.upsert({
      where: { username: a.username },
      update: { note: a.catatan, decidedById: userId },
      create: { username: a.username, note: a.catatan, decidedById: userId },
    });
  }

  for (const k of baca.kapasitas) {
    if (!siap.has(`KAPASITAS|${k.odpCode} → ${k.kapasitas} port`)) continue;
    const o = await db.odp.findFirst({ where: { code: k.odpCode }, select: { id: true } });
    if (!o) continue;
    await db.odp.update({ where: { id: o.id }, data: { portCapacity: k.kapasitas } });
    // Menaikkan kapasitas tanpa membuat baris portnya menghasilkan ODP yang
    // "punya 16 port" tetapi hanya 8 yang bisa ditempati siapa pun.
    const punya = new Set(
      (await db.odpPort.findMany({ where: { odpId: o.id }, select: { portNumber: true } })).map((p) => p.portNumber)
    );
    const kurang = Array.from({ length: k.kapasitas }, (_, i) => i + 1).filter((n) => !punya.has(n));
    if (kurang.length) {
      await db.odpPort.createMany({ data: kurang.map((n) => ({ odpId: o.id, portNumber: n })) });
    }
  }

  // Port DITERAPKAN TERAKHIR, sesudah kapasitas. Baris yang tadinya ditolak
  // karena "melebihi kapasitas" tetap ditolak pada berkas ini — tetapi berkas
  // berikutnya sudah bisa memasangnya, dan urutan ini yang membuat satu
  // putaran survei tidak perlu dijalankan dua kali untuk ODP yang sama.
  for (const p of baca.port) {
    if (!siap.has(`PORT|${p.serviceNumber} → ${p.odpCode} port ${p.portNumber}`)) continue;
    const o = await db.odp.findFirst({ where: { code: p.odpCode }, select: { id: true } });
    const sub = await db.subscription.findUnique({ where: { serviceNumber: p.serviceNumber }, select: { id: true } });
    if (!o || !sub) continue;
    const port = await db.odpPort.upsert({
      where: { odpId_portNumber: { odpId: o.id, portNumber: p.portNumber } },
      update: { subscriptionId: sub.id, status: "USED", note: p.catatan },
      create: { odpId: o.id, portNumber: p.portNumber, subscriptionId: sub.id, status: "USED", note: p.catatan },
      select: { id: true },
    });
    if (port) {
      await db.odp.update({
        where: { id: o.id },
        data: { portUsed: await db.odpPort.count({ where: { odpId: o.id, subscriptionId: { not: null } } }) },
      });
    }
  }

  await logAudit({
    userId,
    action: "PEMETAAN_IMPORT",
    module: "noc",
    entityType: "Pemetaan",
    description:
      `Menerapkan keputusan pemetaan: ${hasil.ringkas.siap} diterapkan, ` +
      `${hasil.ringkas.lewat} sudah sesuai, ${hasil.ringkas.tolak} ditolak, ` +
      `${hasil.masalah.length} baris bermasalah.`,
  });

  return hasil;
}
