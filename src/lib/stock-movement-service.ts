// ── Mengisi riwayat pergerakan stok ke basis data (Fase 78) ─────
//
// Ini PENGISIAN RIWAYAT, bukan transaksi baru, dan perbedaannya menentukan
// bentuk berkas ini.
//
// `postTransaction` menolak pengeluaran yang melebihi stok saat itu — penjaga
// yang benar untuk transaksi yang sedang dibuat orang hari ini. Riwayat enam
// belas bulan tidak begitu: ia sudah terjadi, termasuk tiga momen ketika
// pembukuannya tercatat terbalik dan saldonya sesaat menjadi −1. Memaksanya
// lewat penjaga itu berarti menolak riwayat yang benar karena tiga salah tulis
// manusia, atau lebih buruk — mengarang koreksi supaya lolos.
//
// Karena itu dokumennya ditulis langsung sebagai POSTED, saldo dihitung ulang
// dari totalnya, lalu hasilnya diverifikasi dengan `reconcileStockLevels()`
// milik proyek ini sendiri. Yang memvalidasi bukan penjaga per-transaksi,
// melainkan kecocokan saldo akhir terhadap sumbernya.

import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import {
  parseMovementRows,
  urutTerap,
  saldoAkhir,
  saldoNegatif,
  type Pergerakan,
} from "@/lib/stock-movement-import";

export interface RencanaGerak {
  totalBaris: number;
  terbaca: number;
  masalah: { baris: number; pesan: string }[];
  /** Kode barang di log yang tidak ada di master Item. */
  itemTidakDikenal: string[];
  /** Nama gudang yang akan dibuat karena belum ada. */
  gudangBaru: string[];
  /** Barang yang saldo berjalannya sempat negatif — cacat pembukuan sumber. */
  negatif: { itemCode: string; at: Date; saldo: number }[];
  /** Berapa dokumen akan dibuat, dipecah menurut arah. */
  masuk: number;
  keluar: number;
  /** Saldo akhir yang akan dihasilkan, per barang yang dikenal. */
  saldo: { itemCode: string; qty: number }[];
  unitBersih: number;
}

const GUDANG_KOSONG = "Kecicang"; // 4.143 dari 4.184 baris; sisanya tanpa nama

function kodeGudang(nama: string): string {
  return nama.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 12);
}

/** Memeriksa tanpa menulis apa pun. */
export async function periksaGerak(rows: string[][]): Promise<RencanaGerak> {
  const baca = parseMovementRows(rows);
  const gerak = baca.gerak;

  const kode = [...new Set(gerak.map((g) => g.itemCode))];
  const items = await db.item.findMany({
    where: { code: { in: kode } },
    select: { id: true, code: true },
  });
  const adaKode = new Set(items.map((i) => i.code.toUpperCase()));
  const itemTidakDikenal = kode.filter((k) => !adaKode.has(k)).sort();

  const namaGudang = [...new Set(gerak.map((g) => g.warehouseName ?? GUDANG_KOSONG))];
  const gudangAda = await db.warehouse.findMany({ select: { name: true } });
  const adaGudang = new Set(gudangAda.map((w) => w.name.toLowerCase()));
  const gudangBaru = namaGudang.filter((n) => !adaGudang.has(n.toLowerCase())).sort();

  const terurut = urutTerap(gerak);
  const saldo = saldoAkhir(gerak);

  return {
    totalBaris: rows.length - 1,
    terbaca: gerak.length,
    masalah: baca.masalah,
    itemTidakDikenal,
    gudangBaru,
    negatif: saldoNegatif(terurut),
    masuk: gerak.filter((g) => g.qty > 0).length,
    keluar: gerak.filter((g) => g.qty < 0).length,
    saldo: [...saldo].filter(([k]) => adaKode.has(k)).map(([itemCode, qty]) => ({ itemCode, qty })),
    unitBersih: [...saldo].filter(([k]) => adaKode.has(k)).reduce((n, [, q]) => n + q, 0),
  };
}

/**
 * Memesan sekumpulan nomor dokumen sekaligus.
 *
 * `nextDocumentNumber` mengambil satu nomor per panggilan, dan hampir empat
 * ribu panggilan berarti hampir empat ribu perjalanan ke basis data. Menaikkan
 * pencacahnya sekali sebanyak yang dibutuhkan menghasilkan blok yang sama
 * uniknya dengan cara yang jauh lebih murah — dan tetap atomik, sebab satu
 * `increment` tunggal yang melakukannya.
 */
async function pesanNomor(docType: string, prefix: string, periodKey: string, jumlah: number): Promise<string[]> {
  if (jumlah === 0) return [];
  const seq = await db.documentSequence.upsert({
    where: { docType_periodKey: { docType, periodKey } },
    create: { docType, periodKey, lastNumber: jumlah },
    update: { lastNumber: { increment: jumlah } },
    select: { lastNumber: true },
  });
  const mulai = seq.lastNumber - jumlah + 1;
  return Array.from({ length: jumlah }, (_, i) =>
    `${prefix}-${periodKey}-${String(mulai + i).padStart(4, "0")}`
  );
}

export interface HasilTerap extends RencanaGerak {
  dokumenDibuat: number;
  barisDibuat: number;
  gudangDibuat: number;
  dilewatiSudahAda: number;
}

/**
 * Menulis riwayatnya.
 *
 * Idempoten lewat `referenceNote` yang memuat `Inventory ID` dari sumbernya:
 * menjalankan ulang tidak menggandakan apa pun, sebab yang sudah ada dikenali
 * dan dilewati.
 */
export async function terapkanGerak(
  rows: string[][],
  userId: string,
  /**
   * Kode di log → kode di master, untuk kode yang salah tulis.
   *
   * Sengaja MASUKAN, bukan aturan di dalam kode. Menormalkan kode secara
   * otomatis sempat dicoba dan hasilnya salah: `PAT-000009` dinormalkan dari
   * angkanya menjadi `PAT-0009` ("Patch Core LC UPC 10 M"), padahal namanya
   * "Pigtail Tipe ST" yang sebenarnya `PAT-0008`. Kode tidak bisa dipercaya
   * untuk menebak kode; yang memutuskan tetap orang, dan keputusannya lewat
   * sini.
   */
  alias: Record<string, string> = {}
): Promise<HasilTerap> {
  const rencana = await periksaGerak(rows);
  const baca = parseMovementRows(rows);
  const petaAlias = new Map(Object.entries(alias).map(([a, b]) => [a.toUpperCase(), b.toUpperCase()]));
  for (const g of baca.gerak) {
    const ganti = petaAlias.get(g.itemCode);
    if (ganti) g.itemCode = ganti;
  }

  const items = await db.item.findMany({ select: { id: true, code: true } });
  const perKode = new Map(items.map((i) => [i.code.toUpperCase(), i.id]));

  // Gudang yang belum ada dibuat lebih dulu, supaya seluruh dokumen punya
  // tempat berlabuh.
  let gudangDibuat = 0;
  for (const nama of rencana.gudangBaru) {
    await db.warehouse.create({
      data: { code: kodeGudang(nama), name: nama, type: "BRANCH" },
    });
    gudangDibuat++;
  }
  const gudang = await db.warehouse.findMany({ select: { id: true, name: true } });
  const perGudang = new Map(gudang.map((w) => [w.name.toLowerCase(), w.id]));

  const sudah = new Set(
    (await db.stockTransaction.findMany({
      where: { referenceNote: { startsWith: "IMPOR-GERAK:" } },
      select: { referenceNote: true },
    })).map((t) => t.referenceNote!.replace("IMPOR-GERAK:", ""))
  );

  const dipakai = urutTerap(baca.gerak).filter(
    (g) => perKode.has(g.itemCode) && !sudah.has(g.refId)
  );

  // Nomor dokumen dipesan per bulan-arah, sekali jalan untuk seluruh blok.
  const perBulan = new Map<string, Pergerakan[]>();
  for (const g of dipakai) {
    const bulan = `${g.at.getUTCFullYear()}${String(g.at.getUTCMonth() + 1).padStart(2, "0")}`;
    const arah = g.qty > 0 ? "GR" : "ISS";
    const k = `${arah}|${bulan}`;
    perBulan.set(k, [...(perBulan.get(k) ?? []), g]);
  }

  const widUtama = perGudang.get(GUDANG_KOSONG.toLowerCase());

  let dokumenDibuat = 0;
  let barisDibuat = 0;
  for (const [k, daftar] of perBulan) {
    const [arah, bulan] = k.split("|");
    const docType = arah === "GR" ? "GOODS_RECEIPT" : "STOCK_ISSUE";
    const nomor = await pesanNomor(docType, arah, bulan, daftar.length);

    for (let i = 0; i < daftar.length; i++) {
      const g = daftar[i];
      // Gudang dokumen SELALU gudang utama, sama seperti saldonya. Kolom
      // Warehouse di sumbernya menandai di mana barang dipakai, dan log itu
      // tidak pernah mencatat satu pun perpindahan antar gudang — jadi
      // menjadikannya lokasi stok pada dokumen akan membuat rekonsiliasi
      // menuntut saldo cabang yang negatif. Nama cabangnya disimpan pada
      // catatan, tempat keterangan tujuan memang seharusnya berada.
      const wid = widUtama;
      await db.stockTransaction.create({
        data: {
          txNumber: nomor[i],
          type: arah === "GR" ? "GOODS_RECEIPT" : "STOCK_ISSUE",
          status: "POSTED",
          warehouseToId: arah === "GR" ? wid : null,
          warehouseFromId: arah === "GR" ? null : wid,
          purpose: g.note?.slice(0, 190) || (arah === "GR" ? "Stok masuk" : "Stok keluar"),
          referenceNote: `IMPOR-GERAK:${g.refId}`,
          notes: [g.pic ? `PIC: ${g.pic}` : null, g.warehouseName ? `Lokasi: ${g.warehouseName}` : null]
            .filter(Boolean)
            .join(" · ") || null,
          createdById: userId,
          postedById: userId,
          postedAt: g.at,
          createdAt: g.at,
          lines: { create: [{ itemId: perKode.get(g.itemCode)!, qty: Math.abs(g.qty) }] },
        },
      });
      dokumenDibuat++;
      barisDibuat++;
    }
  }

  // Saldo dihitung ULANG dari seluruh pergerakan, bukan diakumulasi sambil
  // jalan. Menjalankan ulang impor karena itu tetap menghasilkan angka yang
  // sama, dan angka itu selalu bisa diturunkan kembali dari dokumennya.
  //
  // SALDO DITUMPUK DI SATU GUDANG, tidak dipecah menurut kolom Warehouse.
  // Kolom itu menandai DI MANA BARANG DIPAKAI, bukan di mana ia disimpan:
  // 4.143 dari 4.184 baris bertanda Kecicang, dan dua puluh satu baris cabang
  // seluruhnya pengeluaran tanpa satu pun penerimaan yang mendahuluinya.
  // Memecah saldo menurut kolom itu menghasilkan stok fisik negatif — Abang
  // −22 — yang tidak pernah bisa benar. Nama cabangnya tetap tersimpan pada
  // dokumennya, jadi keterangannya tidak hilang; yang tidak dilakukan hanya
  // mengarang perpindahan gudang yang tidak pernah dicatat.
  const saldo = saldoAkhir(baca.gerak);
  if (widUtama) {
    for (const [kode, qty] of saldo) {
      const itemId = perKode.get(kode);
      if (!itemId) continue;
      await db.stockLevel.upsert({
        where: { itemId_warehouseId: { itemId, warehouseId: widUtama } },
        create: { itemId, warehouseId: widUtama, onHand: qty },
        update: { onHand: qty },
      });
    }
  }

  await logAudit({
    userId,
    action: "STOCK_MOVEMENT_IMPORT",
    module: "inventory",
    entityType: "StockTransaction",
    description:
      `Mengisi riwayat pergerakan: ${dokumenDibuat} dokumen, ${barisDibuat} baris, ` +
      `${gudangDibuat} gudang baru, ${rencana.itemTidakDikenal.length} kode tidak dikenal, ` +
      `${rencana.negatif.length} momen saldo negatif di sumbernya.`,
  });

  return {
    ...rencana,
    dokumenDibuat,
    barisDibuat,
    gudangDibuat,
    dilewatiSudahAda: sudah.size,
    saldo: [...saldo].filter(([k]) => perKode.has(k)).map(([itemCode, qty]) => ({ itemCode, qty })),
  };
}
