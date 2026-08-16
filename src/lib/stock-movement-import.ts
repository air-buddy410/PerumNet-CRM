// ── Membaca riwayat pergerakan stok (Fase 78) ───────────────────
//
// Lapisan MURNI. Tabel teks masuk, pergerakan keluar; tidak menyentuh basis
// data sama sekali.
//
// Riwayat ini sempat diputuskan TIDAK diimpor — lihat `TEMUAN-DATA-BENTROK.md`
// §2.2, yang mencatat "12 dari 58 saldo cocok" dan menyimpulkan lognya tidak
// rekonsiliasi. Kesimpulan itu keliru, dan keliru karena pembacaannya yang
// tidak lengkap: yang terbaca waktu itu 206 baris dari 4.184 yang sebenarnya
// ada. Dibaca utuh, **172 dari 172 saldo cocok persis dengan jumlah
// pergerakannya.** Lognya utuh; yang tidak utuh dulu pembacanya.
//
// Dua hal yang membentuk berkas ini:
//
//  1. ARAH ADA DI TANDA ANGKANYA, bukan di kolom keterangan. Kolom itu memuat
//     dua belas ejaan untuk tiga konsep — "Stok Keluar", "Stock keluar",
//     "Stok Kaluar", "Barang keluar" — dan dua baris malah berisi nama
//     pekerjaan. Membaca arah dari sana berarti menebak ejaan orang; membaca
//     dari tandanya tidak pernah salah.
//
//  2. Tanggal tersimpan sebagai bilangan seri Excel, bukan teks.

export interface Pergerakan {
  /** `Inventory ID` dari sumbernya — dipakai agar impor ulang tidak menggandakan. */
  refId: string;
  itemCode: string;
  /** Positif masuk, negatif keluar. Tidak pernah nol. */
  qty: number;
  at: Date;
  warehouseName: string | null;
  pic: string | null;
  note: string | null;
}

export interface MasalahGerak {
  baris: number;
  pesan: string;
}

export interface HasilGerak {
  gerak: Pergerakan[];
  masalah: MasalahGerak[];
  /** Baris yang seluruh selnya kosong; bukan masalah, hanya padding lembar. */
  kosong: number;
}

function normal(s: string): string {
  return (s ?? "").replace(/\u00A0/g, " ").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function cariKolom(judul: string[], alias: string[]): number {
  const n = judul.map(normal);
  for (const a of alias) {
    const at = n.indexOf(normal(a));
    if (at >= 0) return at;
  }
  return -1;
}

const ALIAS = {
  refId: ["inventory id", "id", "movement id"],
  itemCode: ["item id", "kode material", "kode barang", "item code"],
  at: ["datetime", "tanggal", "date"],
  qty: ["amount", "jumlah", "qty"],
  note: ["description", "keterangan"],
  pic: ["pic", "petugas"],
  warehouse: ["warehouse", "gudang"],
} as const;

/**
 * Bilangan seri Excel menjadi tanggal.
 *
 * Titik nolnya 30 Desember 1899 — bukan 1 Januari 1900 — karena Excel
 * mewarisi anggapan bahwa 1900 tahun kabisat, dan seluruh dunia terlanjur
 * menyesuaikan diri dengan galat itu.
 */
export function excelDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial <= 0) return null;
  const ms = Math.round(serial * 86_400_000);
  const d = new Date(Date.UTC(1899, 11, 30) + ms);
  const tahun = d.getUTCFullYear();
  // Tahun di luar rentang yang masuk akal berarti kolomnya salah baca,
  // bukan tanggal yang aneh.
  if (tahun < 2000 || tahun > 2100) return null;
  return d;
}

/** Angka yang mungkin bertanda, mungkin berpecahan nol. */
export function bacaJumlah(raw: string): number | null {
  const s = (raw ?? "").replace(/\s/g, "");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  // Stok dihitung per unit utuh. Pecahan berarti kolomnya bukan jumlah.
  if (!Number.isInteger(n)) return null;
  return n;
}

export function parseMovementRows(rows: string[][]): HasilGerak {
  const out: HasilGerak = { gerak: [], masalah: [], kosong: 0 };
  if (rows.length < 2) return out;

  const judul = rows[0];
  const iRef = cariKolom(judul, [...ALIAS.refId]);
  const iKode = cariKolom(judul, [...ALIAS.itemCode]);
  const iAt = cariKolom(judul, [...ALIAS.at]);
  const iQty = cariKolom(judul, [...ALIAS.qty]);
  const iNote = cariKolom(judul, [...ALIAS.note]);
  const iPic = cariKolom(judul, [...ALIAS.pic]);
  const iGd = cariKolom(judul, [...ALIAS.warehouse]);

  for (const [nama, at] of [["Item ID", iKode], ["DateTime", iAt], ["Amount", iQty]] as const) {
    if (at < 0) {
      out.masalah.push({ baris: 1, pesan: `Kolom "${nama}" tidak ditemukan di lembar pergerakan.` });
      return out;
    }
  }

  const sel = (r: string[], i: number) => (i >= 0 && i < r.length ? (r[i] ?? "").trim() : "");

  for (let n = 1; n < rows.length; n++) {
    const r = rows[n];
    const baris = n + 1;
    if (!r.some((c) => c !== "")) { out.kosong++; continue; }

    const kode = sel(r, iKode).toUpperCase();
    if (!kode) {
      out.masalah.push({ baris, pesan: "Baris tanpa kode barang." });
      continue;
    }
    const at = excelDate(Number(sel(r, iAt)));
    if (!at) {
      out.masalah.push({ baris, pesan: `Tanggal "${sel(r, iAt)}" untuk ${kode} tidak terbaca.` });
      continue;
    }
    const qty = bacaJumlah(sel(r, iQty));
    if (qty === null) {
      out.masalah.push({ baris, pesan: `Jumlah "${sel(r, iQty)}" untuk ${kode} tidak terbaca.` });
      continue;
    }
    if (qty === 0) {
      // Nol bukan pergerakan. Menyimpannya menghasilkan dokumen kosong yang
      // membingungkan siapa pun yang membuka riwayatnya.
      out.masalah.push({ baris, pesan: `${kode} bergerak nol unit — dilewati.` });
      continue;
    }

    out.gerak.push({
      refId: sel(r, iRef) || `${kode}#${baris}`,
      itemCode: kode,
      qty,
      at,
      warehouseName: sel(r, iGd) || null,
      pic: sel(r, iPic) || null,
      note: sel(r, iNote) || null,
    });
  }
  return out;
}

/**
 * Mengurutkan untuk penerapan: per hari, PEMASUKAN LEBIH DULU, baru menurut jam.
 *
 * Sebagian baris tercatat sedikit terbalik — pengeluaran tertulis semenit
 * sebelum penerimaan yang menutupinya. Mendahulukan pemasukan dalam hari yang
 * sama menghapus sebagian besar saldo negatif sesaat tanpa mengubah satu pun
 * angka, sebab urutan dalam satu hari memang tidak pernah dicatat dengan
 * sungguh-sungguh.
 *
 * Yang tersisa negatif TIDAK dipaksa benar — itu dilaporkan apa adanya.
 */
export function urutTerap(gerak: Pergerakan[]): Pergerakan[] {
  return [...gerak].sort((a, b) => {
    const ha = a.at.toISOString().slice(0, 10);
    const hb = b.at.toISOString().slice(0, 10);
    if (ha !== hb) return ha < hb ? -1 : 1;
    const ma = a.qty >= 0 ? 0 : 1;
    const mb = b.qty >= 0 ? 0 : 1;
    if (ma !== mb) return ma - mb;
    return a.at.getTime() - b.at.getTime();
  });
}

/** Saldo akhir per kode barang, dari seluruh pergerakan. */
export function saldoAkhir(gerak: Pergerakan[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const g of gerak) out.set(g.itemCode, (out.get(g.itemCode) ?? 0) + g.qty);
  return out;
}

/**
 * Momen ketika saldo berjalan sebuah barang menjadi negatif.
 *
 * Bukan galat impor — ini cacat pembukuan di sumbernya, dan yang benar
 * melaporkannya alih-alih menolak seluruh berkas atau diam-diam menaikkannya
 * ke nol.
 */
export function saldoNegatif(gerakTerurut: Pergerakan[]): { itemCode: string; at: Date; saldo: number }[] {
  const bal = new Map<string, number>();
  const out: { itemCode: string; at: Date; saldo: number }[] = [];
  for (const g of gerakTerurut) {
    const n = (bal.get(g.itemCode) ?? 0) + g.qty;
    bal.set(g.itemCode, n);
    if (n < 0) out.push({ itemCode: g.itemCode, at: g.at, saldo: n });
  }
  return out;
}
