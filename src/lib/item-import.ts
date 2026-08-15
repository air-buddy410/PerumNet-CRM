// ── Pembacaan katalog material dari workbook gudang (Fase 61) ────
//
// Lapisan ini MURNI: tabel teks masuk, baris tervalidasi keluar. Tidak
// menyentuh basis data, jadi seluruh aturannya bisa diuji tanpa koneksi apa
// pun — dan bisa dijalankan untuk PRATINJAU sebelum satu baris pun tersimpan.
//
// Sumbernya satu berkas berisi beberapa lembar: katalog material, daftar
// vendor, daftar kategori, dan saldo stok. Lembarnya TIDAK dikenali dari
// urutan atau namanya, melainkan dari baris judulnya. Urutan tab berubah
// setiap kali seseorang menyeret tab di spreadsheet, dan impor yang bergantung
// pada urutan akan memasukkan vendor sebagai material tanpa ada yang sadar.
//
// Sikap yang dipegang di sepanjang berkas ini sama dengan importir pegawai:
// lebih baik menolak satu baris dengan alamat kolom yang jelas daripada
// menebaknya. Katalog yang menebak melahirkan harga beli yang salah, dan harga
// beli yang salah baru ketahuan saat opname pertama tidak imbang.

export interface RowIssue {
  rowNumber: number;
  /** Judul kolom, bukan nama bidang — orang mencarinya di spreadsheet. */
  column: string;
  message: string;
}

/** Satu material yang lolos seluruh pemeriksaan. */
export interface ItemRow {
  rowNumber: number;
  code: string;
  name: string;
  /** Kode kategori hasil penerjemahan hash sumber; selalu terisi. */
  categoryCode: string;
  categoryName: string;
  /** Kosong bila sumbernya memang tidak mencatat pemasok. */
  supplierCode: string | null;
  supplierName: string | null;
  /** Rupiah penuh, bukan sen. Null berarti sumbernya kosong, bukan nol. */
  purchaseCost: number | null;
  salePrice: number | null;
  /** GOOD | SECOND */
  condition: string;
  /** Catatan yang TIDAK menghalangi impor, tapi perlu dilihat manusia. */
  notes: string[];
}

export interface SupplierRow {
  rowNumber: number;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
}

export interface CategoryRow {
  rowNumber: number;
  code: string;
  name: string;
}

export interface StockRow {
  rowNumber: number;
  itemCode: string;
  quantity: number;
  /** Nama barang menurut lembar saldo; dipakai untuk memastikan resolusi kode. */
  sourceName: string;
  /** Terisi bila kodenya semula rusak lalu berhasil dipulihkan. */
  resolvedFrom?: string;
}

export interface ParsedCatalog {
  items: ItemRow[];
  suppliers: SupplierRow[];
  categories: CategoryRow[];
  stock: StockRow[];
  issues: RowIssue[];
  /** Lembar yang tidak dikenali judulnya — dilewati, bukan ditebak. */
  ignoredSheets: number;
  /**
   * Baris pada lembar pergerakan stok yang SENGAJA tidak diimpor.
   *
   * Lognya tidak lengkap: ia hanya memuat sebagian barang, dan jumlahnya tidak
   * bertemu dengan saldo berjalan. Memutar ulangnya akan melahirkan saldo yang
   * salah dengan tampilan riwayat yang meyakinkan — kombinasi terburuk.
   * Saldo awal diambil dari lembar saldo, sekali jalan.
   */
  skippedMovements: number;
}

// ── Penyeragaman nilai ──────────────────────────────────────────

function normalizeHeader(s: string): string {
  return s.replace(/\*/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Kode material: huruf besar, spasi menjadi tanda hubung.
 *
 * Sumbernya memuat `Cab-0010`, `MOD 0014`, dan `Net-0011` — ketiganya jelas
 * maksudnya dan aman diseragamkan. Yang TIDAK diperbaiki di sini: `MOOD-0011`
 * (salah ketik prefiks) dan `ACC-005` (kurang satu digit). Keduanya menyerupai
 * kode sah lain, dan menebaknya berarti menggabungkan dua barang berbeda
 * menjadi satu baris stok.
 */
export function normalizeItemCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s_]+/g, "-").replace(/-+/g, "-");
}

export const ITEM_CODE_RE = /^[A-Z]{2,6}-\d{4}$/;

/**
 * Rupiah bertanda pemisah ribuan menjadi bilangan bulat.
 *
 * Sumbernya menulis `Rp 250,000` dengan koma sebagai pemisah ribuan — bukan
 * desimal. Karena harga material selalu bilangan bulat rupiah, seluruh koma
 * dan titik diperlakukan sebagai pemisah dan dibuang. Nilai berkoma desimal
 * asli tidak pernah muncul di katalog ini; kalau suatu saat muncul, ia akan
 * terbaca membesar seratus kali dan tertangkap pemeriksaan kewajaran di bawah.
 */
export function parseRupiah(raw: string): number | null {
  const s = (raw ?? "").replace(/rp/gi, "").replace(/[.,\s]/g, "").trim();
  if (!s) return null;
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Kolom "Description" di sumbernya sebenarnya berisi KONDISI barang, bukan
 * keterangan. Isinya hanya dua nilai yang bermakna, dan sisanya salah isi.
 */
export function conditionFromLabel(raw: string): string | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (["available", "new", "baru", "good"].includes(s)) return "GOOD";
  if (["second", "bekas", "sb"].includes(s)) return "SECOND";
  return null;
}

// ── Pengenalan lembar ───────────────────────────────────────────

type SheetKind = "items" | "suppliers" | "categories" | "stock" | "movements" | "unknown";

/**
 * Judul yang harus ada — dan yang tidak boleh ada — agar sebuah lembar diakui.
 *
 * `mustNot` bukan hiasan. Lembar pergerakan stok dan lembar saldo sama-sama
 * memuat "Item ID" dan "Amount"; tanpa penyaring, keduanya terbaca sebagai
 * saldo dan setiap barang tercatat dua kali dengan angka yang berbeda.
 *
 * Dicocokkan berurutan, yang paling khas lebih dulu.
 */
const SIGNATURES: readonly {
  kind: Exclude<SheetKind, "unknown">;
  must: readonly string[];
  mustNot?: readonly string[];
}[] = [
  { kind: "items", must: ["item id", "name", "category", "purchase cost"] },
  { kind: "movements", must: ["item id", "amount", "datetime"] },
  { kind: "suppliers", must: ["id", "name", "phone", "address"] },
  { kind: "categories", must: ["id", "category"] },
  // Saldo berjalan ada pada blok "Kode Material | Stok", BUKAN pada blok
  // "Item ID | Amount" di lembar yang sama — yang belakangan itu salinan
  // baris pergerakan, jadi satu kode muncul berkali-kali dengan angka
  // berbeda dan yang terbaca terakhir akan menang secara diam-diam.
  { kind: "stock", must: ["kode material", "stok"] },
] as const;

/**
 * Mencari baris judul di dalam satu lembar.
 *
 * Baris judul tidak selalu baris pertama: lembar hasil ekspor kerap diawali
 * satu-dua baris kosong atau judul dekoratif. Dicari sampai baris kelima, lalu
 * menyerah — lebih dalam dari itu, yang ketemu kemungkinan besar baris data
 * yang kebetulan berisi kata "Name".
 */
function findHeader(rows: string[][]): { index: number; header: string[]; kind: SheetKind } {
  const limit = Math.min(rows.length, 5);
  for (let i = 0; i < limit; i++) {
    const header = rows[i].map(normalizeHeader);
    const isi = new Set(header.filter(Boolean));
    if (isi.size === 0) continue;
    for (const sig of SIGNATURES) {
      if (!sig.must.every((m) => isi.has(m))) continue;
      if (sig.mustNot?.some((m) => isi.has(m))) continue;
      return { index: i, header, kind: sig.kind };
    }
  }
  return { index: -1, header: [], kind: "unknown" };
}

function columnOf(header: string[], ...names: string[]): number {
  for (const n of names) {
    const i = header.indexOf(n);
    if (i >= 0) return i;
  }
  return -1;
}

function cell(row: string[], col: number): string {
  return col < 0 ? "" : (row[col] ?? "").trim();
}

// ── Pembacaan tiap lembar ───────────────────────────────────────

function readCategories(rows: string[][], head: number, header: string[], out: ParsedCatalog): void {
  const cId = columnOf(header, "id");
  const cName = columnOf(header, "category");
  for (let i = head + 1; i < rows.length; i++) {
    const rowNumber = i + 1;
    const code = cell(rows[i], cId);
    const name = cell(rows[i], cName);
    if (!code && !name) continue;
    if (!code) {
      out.issues.push({ rowNumber, column: "ID", message: "Kategori tanpa ID." });
      continue;
    }
    if (!name) {
      out.issues.push({ rowNumber, column: "Category", message: `Kategori ${code} tanpa nama.` });
      continue;
    }
    out.categories.push({ rowNumber, code, name });
  }
}

function readSuppliers(rows: string[][], head: number, header: string[], out: ParsedCatalog): void {
  const cId = columnOf(header, "id");
  const cName = columnOf(header, "name");
  const cPhone = columnOf(header, "phone");
  const cEmail = columnOf(header, "email");
  const cAddr = columnOf(header, "address");
  const cUrl = columnOf(header, "url", "website");
  for (let i = head + 1; i < rows.length; i++) {
    const rowNumber = i + 1;
    const code = cell(rows[i], cId);
    const name = cell(rows[i], cName);
    if (!code && !name) continue;
    if (!code || !name) {
      out.issues.push({
        rowNumber,
        column: code ? "Name" : "ID",
        message: "Vendor harus punya ID sekaligus nama.",
      });
      continue;
    }
    out.suppliers.push({
      rowNumber,
      code,
      name,
      phone: cell(rows[i], cPhone) || null,
      email: cell(rows[i], cEmail) || null,
      address: cell(rows[i], cAddr) || null,
      website: cell(rows[i], cUrl) || null,
    });
  }
}

function readStock(rows: string[][], head: number, header: string[], out: ParsedCatalog): void {
  const cCode = columnOf(header, "kode material");
  const cQty = columnOf(header, "stok");
  // Nama barang berada tepat di antara kode dan jumlah pada lembar saldo.
  // Ia bukan hiasan: nama itulah sinyal kedua yang memutuskan apakah kode
  // rusak boleh dipulihkan. Lihat resolveCode() di bawah.
  const cName = cCode >= 0 && cQty > cCode + 1 ? cCode + 1 : -1;
  for (let i = head + 1; i < rows.length; i++) {
    const rowNumber = i + 1;
    const raw = cell(rows[i], cCode);
    const qtyRaw = cell(rows[i], cQty);
    if (!raw && !qtyRaw) continue;
    if (!raw) continue; // blok bantu lain di lembar yang sama
    const itemCode = normalizeItemCode(raw);
    const qty = Number(qtyRaw.replace(/[.,\s]/g, ""));
    if (!Number.isInteger(qty) || qty < 0) {
      out.issues.push({
        rowNumber,
        column: "Amount",
        message: `Saldo "${qtyRaw}" bukan bilangan bulat tidak negatif.`,
      });
      continue;
    }
    // Kode rusak TIDAK ditolak di sini. Pemulihannya membutuhkan katalog
    // lengkap, jadi diputuskan pada crossCheck() ketika keduanya sudah ada.
    out.stock.push({ rowNumber, itemCode, quantity: qty, sourceName: cell(rows[i], cName) });
  }
}

function readItems(rows: string[][], head: number, header: string[], out: ParsedCatalog): void {
  const cCode = columnOf(header, "item id");
  const cName = columnOf(header, "name");
  const cCond = columnOf(header, "description");
  const cCat = columnOf(header, "category");
  const cVen = columnOf(header, "vendor");
  const cBuy = columnOf(header, "purchase cost");
  const cSell = columnOf(header, "sale price");

  for (let i = head + 1; i < rows.length; i++) {
    const rowNumber = i + 1;
    const rawCode = cell(rows[i], cCode);
    const name = cell(rows[i], cName);
    if (!rawCode && !name) continue;

    const code = normalizeItemCode(rawCode);
    if (!ITEM_CODE_RE.test(code)) {
      out.issues.push({
        rowNumber,
        column: "Item ID",
        message: `Kode "${rawCode}" tidak berbentuk PREFIKS-0000. Perbaiki di sumbernya — menebaknya bisa menggabungkan dua barang berbeda.`,
      });
      continue;
    }
    if (!name) {
      out.issues.push({ rowNumber, column: "Name", message: `${code} tanpa nama barang.` });
      continue;
    }

    const rawCond = cell(rows[i], cCond);
    const dikenal = conditionFromLabel(rawCond);
    const notes: string[] = [];
    // Kondisi yang tidak dikenal TIDAK menahan barangnya. Tiga baris di
    // sumber berisi jenis barang ("Kabel", "Stiker", "Cable") — jelas kolom
    // yang salah diisi, dan tak satu pun menyiratkan barang bekas. GOOD
    // adalah kondisi yang benar untuk ketiganya, dan menahan seluruh berkas
    // demi tiga sel salah ketik menukar risiko kecil dengan biaya besar.
    // Catatannya tetap muncul supaya tetap ada yang memperbaikinya.
    const condition = dikenal ?? "GOOD";
    if (dikenal === null) {
      notes.push(
        rawCond
          ? `Kondisi tertulis "${rawCond}" — tidak dikenal, dianggap GOOD. Perbaiki jadi Available atau Second.`
          : "Kondisi kosong — dianggap GOOD."
      );
    }
    const purchaseCost = parseRupiah(cell(rows[i], cBuy));
    const salePrice = parseRupiah(cell(rows[i], cSell));
    const rawBuy = cell(rows[i], cBuy);
    const rawSell = cell(rows[i], cSell);
    if (rawBuy && purchaseCost === null) {
      out.issues.push({ rowNumber, column: "Purchase Cost", message: `Harga beli "${rawBuy}" tidak terbaca.` });
      continue;
    }
    if (rawSell && salePrice === null) {
      out.issues.push({ rowNumber, column: "Sale Price", message: `Harga jual "${rawSell}" tidak terbaca.` });
      continue;
    }

    // Kewajaran harga — CATATAN, bukan penolakan. Barang murah itu nyata
    // (paku, sekrup), jadi ini tidak boleh menghentikan impor; tapi `Rp 102`
    // untuk splitter PLC hampir pasti kurang tiga angka nol, dan diam-diam
    // memasukkannya membuat nilai persediaan salah tanpa jejak.
    if (purchaseCost !== null && purchaseCost > 0 && purchaseCost < 500) {
      notes.push(`Harga beli hanya Rp${purchaseCost.toLocaleString("id-ID")} — periksa apakah kurang angka nol.`);
    }
    if (purchaseCost !== null && salePrice !== null && salePrice < purchaseCost) {
      notes.push("Harga jual di bawah harga beli.");
    }

    const categoryCode = cell(rows[i], cCat);
    if (!categoryCode) {
      out.issues.push({ rowNumber, column: "Category", message: `${code} tanpa kategori.` });
      continue;
    }
    const supplierCode = cell(rows[i], cVen) || null;
    if (!supplierCode) notes.push("Tanpa vendor.");

    out.items.push({
      rowNumber,
      code,
      name,
      categoryCode,
      categoryName: "",
      supplierCode,
      supplierName: null,
      purchaseCost,
      salePrice,
      condition,
      notes,
    });
  }
}

// ── Pemeriksaan lintas-lembar ───────────────────────────────────

/**
 * Yang hanya bisa diperiksa setelah SELURUH lembar terbaca: kode ganda, dan
 * hash kategori/vendor yang tidak punya padanan.
 *
 * Hash yatim adalah kegagalan, bukan catatan. Kategori yang hilang membuat
 * barang menumpuk di satu kelompok "lain-lain" yang tidak pernah dirapikan
 * lagi, dan itu justru kerja yang paling mahal untuk dibereskan belakangan.
 */
/**
 * Membandingkan dua nama barang setelah diseragamkan.
 *
 * Dipakai sebagai SINYAL KEDUA saat memulihkan kode yang rusak. Nomor saja
 * tidak cukup: `PAT-000009` di lembar saldo bernama "Pigtail Tipe ST",
 * sedangkan `PAT-0009` di katalog adalah "Patch Core LC UPC" — dua barang
 * berbeda dengan nomor yang kebetulan berdekatan. Tanpa pemeriksaan nama,
 * pemulihan otomatis akan memindahkan saldo ke barang yang salah.
 */
function namaMenguatkan(a: string, b: string): boolean {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const x = n(a);
  const y = n(b);
  if (!x || !y) return false;
  return x === y || x.startsWith(y) || y.startsWith(x);
}

/**
 * Memulihkan kode rusak, HANYA bila dua sinyal setuju: ada tepat satu kode
 * katalog yang cocok setelah nomornya dinormalkan ke empat digit, DAN nama
 * barangnya menguatkan. Kalau salah satu meleset, kodenya tetap ditolak —
 * dengan usulan disertakan supaya manusia bisa memutuskan dalam sekali lihat.
 */
function resolveCode(
  raw: string,
  sourceName: string,
  katalog: Map<string, string>
): { code: string; alasan: string } | { usulan: string | null } {
  const m = /^([A-Z]{2,6})-?(\d{1,6})$/.exec(raw.replace(/-+/g, "-"));
  if (!m) return { usulan: null };
  const n = Number(m[2]);
  if (!Number.isInteger(n) || n <= 0 || n > 9999) return { usulan: null };
  const kandidat = `${m[1]}-${String(n).padStart(4, "0")}`;
  const nama = katalog.get(kandidat);
  if (!nama) return { usulan: null };
  if (!namaMenguatkan(sourceName, nama)) return { usulan: `${kandidat} (${nama})` };
  return { code: kandidat, alasan: `dipulihkan dari "${raw}"; nama "${sourceName}" cocok dengan "${nama}"` };
}

function crossCheck(out: ParsedCatalog): void {
  const catByCode = new Map(out.categories.map((c) => [c.code, c]));
  const supByCode = new Map(out.suppliers.map((s) => [s.code, s]));

  const seen = new Map<string, number>();
  const kept: ItemRow[] = [];
  for (const it of out.items) {
    const first = seen.get(it.code);
    if (first !== undefined) {
      out.issues.push({
        rowNumber: it.rowNumber,
        column: "Item ID",
        message: `Kode ${it.code} sudah dipakai di baris ${first}.`,
      });
      continue;
    }
    seen.set(it.code, it.rowNumber);

    const cat = catByCode.get(it.categoryCode);
    if (!cat) {
      out.issues.push({
        rowNumber: it.rowNumber,
        column: "Category",
        message: `Kategori "${it.categoryCode}" tidak ada di lembar Categories.`,
      });
      continue;
    }
    it.categoryName = cat.name;

    if (it.supplierCode) {
      const sup = supByCode.get(it.supplierCode);
      if (!sup) {
        out.issues.push({
          rowNumber: it.rowNumber,
          column: "Vendor",
          message: `Vendor "${it.supplierCode}" tidak ada di lembar Vendors.`,
        });
        continue;
      }
      it.supplierName = sup.name;
    }
    kept.push(it);
  }
  out.items = kept;

  // Saldo untuk barang yang tidak ada di katalog tidak bisa disimpan — tidak
  // ada Item untuk digantungkan. Dilaporkan sebagai masalah supaya kelihatan,
  // sebab biasanya penyebabnya kode salah ketik di salah satu dari dua lembar.
  const katalog = new Map(out.items.map((i) => [i.code, i.name]));
  const byCode = new Set(katalog.keys());
  // Kode yang SUDAH ditulis utuh di lembar saldo. Sebuah kode rusak tidak
  // boleh dipulihkan menjadi salah satu dari ini: kalau barisnya sudah ada,
  // memulihkan ke sana berarti dua baris memperebutkan satu barang. Itu
  // bukan hipotesis — `SER 010` bernama "Baju Engginer" sementara `SER-0010`
  // pada lembar yang sama bernama "Sepatu Kerja". Nomornya cocok, namanya
  // menguatkan terhadap katalog, dan hasilnya tetap salah.
  const sudahUtuh = new Set(out.stock.filter((x) => ITEM_CODE_RE.test(x.itemCode)).map((x) => x.itemCode));
  const stok: StockRow[] = [];
  const sudah = new Map<string, number>();
  for (const s of out.stock) {
    if (!ITEM_CODE_RE.test(s.itemCode)) {
      const hasil = resolveCode(s.itemCode, s.sourceName, katalog);
      if ("code" in hasil && sudahUtuh.has(hasil.code)) {
        out.issues.push({
          rowNumber: s.rowNumber,
          column: "Kode Material",
          message:
            `Kode "${s.itemCode}" ("${s.sourceName}") mengarah ke ${hasil.code}, ` +
            `tetapi ${hasil.code} sudah punya baris saldonya sendiri di lembar ini. ` +
            `Dua barang memperebutkan satu kode — perbaiki di sumbernya.`,
        });
        continue;
      }
      if ("code" in hasil) {
        s.resolvedFrom = s.itemCode;
        s.itemCode = hasil.code;
      } else {
        out.issues.push({
          rowNumber: s.rowNumber,
          column: "Kode Material",
          message:
            `Kode "${s.itemCode}" tidak berbentuk PREFIKS-0000` +
            (hasil.usulan
              ? `. Mirip ${hasil.usulan}, tetapi namanya di lembar saldo "${s.sourceName}" tidak cocok — pastikan dulu barangnya sama.`
              : ` dan tidak ada padanannya di lembar Items.`),
        });
        continue;
      }
    }
    if (!byCode.has(s.itemCode)) {
      out.issues.push({
        rowNumber: s.rowNumber,
        column: "Item ID",
        message: `Saldo untuk ${s.itemCode}, tetapi barang itu tidak ada di lembar Items.`,
      });
      continue;
    }
    const first = sudah.get(s.itemCode);
    if (first !== undefined) {
      out.issues.push({
        rowNumber: s.rowNumber,
        column: "Item ID",
        message: `Saldo ${s.itemCode} sudah ditulis di baris ${first}.`,
      });
      continue;
    }
    sudah.set(s.itemCode, s.rowNumber);
    stok.push(s);
  }
  out.stock = stok;
}

// ── Titik masuk ─────────────────────────────────────────────────

/**
 * Membaca seluruh lembar workbook katalog sekaligus.
 *
 * @param sheets Hasil {@link readAllSheetRows} — satu tabel teks per lembar.
 */
export function parseCatalogWorkbook(sheets: string[][][]): ParsedCatalog {
  const out: ParsedCatalog = {
    items: [],
    suppliers: [],
    categories: [],
    stock: [],
    issues: [],
    ignoredSheets: 0,
    skippedMovements: 0,
  };

  // Kategori dan vendor dibaca LEBIH DULU tanpa memandang urutan tabnya,
  // supaya pemeriksaan silang di bawah punya keduanya secara utuh.
  const dikenali: { kind: SheetKind; rows: string[][]; head: number; header: string[] }[] = [];
  for (const rows of sheets) {
    const { index, header, kind } = findHeader(rows);
    if (kind === "unknown") {
      out.ignoredSheets++;
      continue;
    }
    if (kind === "movements") {
      out.skippedMovements += Math.max(0, rows.length - index - 1);
      continue;
    }
    dikenali.push({ kind, rows, head: index, header });
  }

  const urutan: SheetKind[] = ["categories", "suppliers", "items", "stock"];
  for (const jenis of urutan) {
    for (const s of dikenali.filter((d) => d.kind === jenis)) {
      if (jenis === "categories") readCategories(s.rows, s.head, s.header, out);
      else if (jenis === "suppliers") readSuppliers(s.rows, s.head, s.header, out);
      else if (jenis === "items") readItems(s.rows, s.head, s.header, out);
      else if (jenis === "stock") readStock(s.rows, s.head, s.header, out);
    }
  }

  if (out.items.length === 0 && out.issues.length === 0) {
    out.issues.push({
      rowNumber: 0,
      column: "Item ID",
      message: "Tidak ada lembar katalog yang dikenali. Lembar Items harus punya judul Item ID, Name, Category, dan Purchase Cost.",
    });
  }

  crossCheck(out);
  out.issues.sort((a, b) => a.rowNumber - b.rowNumber);
  return out;
}
