import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/constants";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-rules";
import { readAllSheetRows, XlsxError } from "@/lib/xlsx-read";
import { createDraftTransaction, postTransaction } from "@/lib/inventory";
import { parseCatalogWorkbook, type ParsedCatalog, type RowIssue } from "@/lib/item-import";
import type { CurrentUser } from "@/lib/rbac";

// ── Impor katalog material: pratinjau & penerapan (Fase 61) ──────
//
// Dua sifat diwarisi apa adanya dari importir pegawai, dan keduanya disengaja:
//
// 1. PENERAPAN MEMBACA ULANG BERKASNYA. Tidak ada jalur yang menerima daftar
//    baris dari peramban lalu menyimpannya. Pratinjau yang teliti tidak ada
//    gunanya kalau penerapannya percaya begitu saja pada apa yang dikirim.
//
// 2. SEMUA ATAU TIDAK SAMA SEKALI. Satu baris bermasalah menahan seluruh
//    berkas. Katalog yang terimpor separuh jauh lebih sulit dibereskan
//    daripada yang ditolak — yang separuh sudah bercampur, dan menjalankan
//    ulang berkas yang sama akan menggandakannya.
//
// Yang KHAS di sini dan tidak ada pada importir pegawai: sumbernya memakai
// hash buram sebagai kunci kategori dan vendor (`w6hwsyj`, `caabcab7`). Hash
// itu TIDAK ikut masuk sebagai kode kita. Ia hanya kunci penerjemah selama
// impor; yang tersimpan adalah kode terbaca yang diturunkan dari namanya.
// Kalau hash yang disimpan, setiap orang yang membuka daftar kategori setahun
// lagi akan melihat deretan sampah yang tidak bisa dicari maupun diucapkan.

/** Kolom Item yang BOLEH ditulis lewat impor — daftar tertutup. */
const KOLOM_KATALOG = ["categoryId", "supplierId", "purchaseCost", "salePrice", "condition"] as const;

type KolomKatalog = (typeof KOLOM_KATALOG)[number];

export type Tindakan = "CREATE" | "LENGKAPI" | "SKIP";

export interface MasterPlan {
  code: string;
  name: string;
  action: Tindakan;
}

export interface ItemPlan {
  rowNumber: number;
  code: string;
  name: string;
  action: Tindakan;
  /** Alasan dilewati, untuk SKIP. */
  reason: string | null;
  /** Ringkasan perubahan untuk LENGKAPI. */
  changes: string[];
  notes: string[];
}

export interface StockPlan {
  itemCode: string;
  quantity: number;
  action: "CREATE" | "SKIP";
  reason: string | null;
}

export interface ImportPlan {
  /** Boleh diterapkan? False bila ada satu saja masalah. */
  ok: boolean;
  warehouseName: string;
  categories: MasterPlan[];
  suppliers: MasterPlan[];
  items: ItemPlan[];
  stock: StockPlan[];
  issues: RowIssue[];
  willCreateItems: number;
  willCompleteItems: number;
  willSkipItems: number;
  willCreateCategories: number;
  willCreateSuppliers: number;
  /** Jumlah unit yang akan masuk sebagai saldo awal. */
  openingUnits: number;
  /** Baris pergerakan stok yang sengaja tidak diimpor; lihat item-import.ts. */
  skippedMovements: number;
  ignoredSheets: number;
}

export interface ImportOutcome {
  createdCategories: number;
  createdSuppliers: number;
  createdItems: { code: string; name: string }[];
  completedItems: { code: string; fields: string[] }[];
  skippedItems: number;
  /** Nomor dokumen saldo awal; null bila tidak ada stok yang diimpor. */
  openingTxNumber: string | null;
  openingUnits: number;
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

// ── Penurunan kode terbaca ──────────────────────────────────────

/**
 * Nama menjadi kode yang bisa dibaca, dicari, dan diucapkan.
 *
 * "Patch Core" → PATCH_CORE, "Global Teknologi Catv Indonesia" → dipotong.
 * Dipotong di 24 karakter karena kode ini muncul di daftar, cetakan, dan
 * pencarian — kode sepanjang satu kalimat merusak semuanya sekaligus.
 */
export function codeFromName(name: string): string {
  const s = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24)
    .replace(/_+$/, "");
  return s || "TANPA_NAMA";
}

/**
 * Membuat kode unik terhadap yang sudah dipakai, dengan akhiran angka.
 *
 * Dua vendor bernama mirip bukan hal aneh ("Uni Net" dan "UniNet"), dan
 * tabrakan kode yang tidak ditangani akan menggagalkan seluruh impor di
 * tengah jalan — tepat jenis kegagalan separuh yang dihindari berkas ini.
 */
function uniqueCode(base: string, dipakai: Set<string>): string {
  if (!dipakai.has(base)) {
    dipakai.add(base);
    return base;
  }
  for (let n = 2; n < 1000; n++) {
    const kandidat = `${base.slice(0, 20)}_${n}`;
    if (!dipakai.has(kandidat)) {
      dipakai.add(kandidat);
      return kandidat;
    }
  }
  throw new Error(`Tidak bisa membuat kode unik dari "${base}".`);
}

// ── Pembacaan berkas ────────────────────────────────────────────

async function toSheets(user: CurrentUser, file: File): Promise<Result<string[][][]>> {
  if (!user.permissions.has(PERMISSIONS.ITEMS_MANAGE)) {
    return { ok: false, error: "Anda tidak memiliki izin mengelola master item." };
  }
  if (!file || file.size === 0) return { ok: false, error: "Berkas kosong." };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: `Berkas terlalu besar (maksimal ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB).` };
  }
  const buf = Buffer.from(await file.arrayBuffer());
  try {
    return { ok: true, data: readAllSheetRows(buf) };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof XlsxError ? e.message : `Berkas tidak terbaca: ${(e as Error).message}`,
    };
  }
}

// ── Penyusunan rencana ──────────────────────────────────────────

/** Bidang yang akan berubah pada item yang SUDAH ADA. */
function katalogChanges(
  lama: {
    categoryId: string | null;
    supplierId: string | null;
    purchaseCost: bigint | null;
    salePrice: bigint | null;
    condition: string;
  },
  baru: {
    categoryId: string;
    supplierId: string | null;
    purchaseCost: number | null;
    salePrice: number | null;
    condition: string;
  }
): { key: KolomKatalog; ringkas: string }[] {
  const out: { key: KolomKatalog; ringkas: string }[] = [];
  // Hanya MENGISI yang kosong, tidak pernah menimpa yang sudah terisi. Nilai
  // yang sudah ada di aplikasi kemungkinan besar lebih baru daripada isi
  // spreadsheet — dan kalau memang perlu diganti, itu keputusan sadar lewat
  // form, bukan efek samping mengunggah berkas.
  if (!lama.categoryId) out.push({ key: "categoryId", ringkas: "Kategori diisi" });
  if (!lama.supplierId && baru.supplierId) out.push({ key: "supplierId", ringkas: "Vendor diisi" });
  if (lama.purchaseCost === null && baru.purchaseCost !== null) {
    out.push({ key: "purchaseCost", ringkas: `Harga beli: Rp${baru.purchaseCost.toLocaleString("id-ID")}` });
  }
  if (lama.salePrice === null && baru.salePrice !== null) {
    out.push({ key: "salePrice", ringkas: `Harga jual: Rp${baru.salePrice.toLocaleString("id-ID")}` });
  }
  if (lama.condition === "GOOD" && baru.condition === "SECOND") {
    out.push({ key: "condition", ringkas: "Kondisi: GOOD → SECOND" });
  }
  return out;
}

interface Rencana {
  plan: ImportPlan;
  parsed: ParsedCatalog;
  /** Kode kategori terbaca per hash sumber. */
  katKode: Map<string, string>;
  supKode: Map<string, string>;
}

async function buildPlan(sheets: string[][][], warehouseId: string): Promise<Result<Rencana>> {
  const gudang = await db.warehouse.findUnique({ where: { id: warehouseId } });
  if (!gudang) return { ok: false, error: "Gudang tujuan tidak ditemukan." };
  if (!gudang.isActive) return { ok: false, error: `Gudang ${gudang.name} sudah nonaktif.` };

  const parsed = parseCatalogWorkbook(sheets);

  const [katLama, supLama, itemLama] = await Promise.all([
    db.category.findMany({ where: { type: "ITEM" }, select: { id: true, code: true, name: true } }),
    db.supplier.findMany({ select: { id: true, code: true, name: true } }),
    db.item.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        categoryId: true,
        supplierId: true,
        purchaseCost: true,
        salePrice: true,
        condition: true,
      },
    }),
  ]);

  const katByName = new Map(katLama.map((c) => [c.name.trim().toLowerCase(), c]));
  const supByName = new Map(supLama.map((s) => [s.name.trim().toLowerCase(), s]));
  const itemByCode = new Map(itemLama.map((i) => [i.code, i]));

  const kodeKatDipakai = new Set(katLama.map((c) => c.code));
  const kodeSupDipakai = new Set(supLama.map((s) => s.code));

  // Kategori dan vendor dicocokkan berdasarkan NAMA, bukan hash. Hash-nya
  // milik aplikasi lama dan tidak pernah tersimpan di sini, jadi impor kedua
  // dari berkas yang sama harus mengenali "CABLE" yang sudah dibuat impor
  // pertama — kalau tidak, tiap impor melahirkan salinan kategori baru.
  const katKode = new Map<string, string>();
  const categories: MasterPlan[] = [];
  for (const c of parsed.categories) {
    const ada = katByName.get(c.name.trim().toLowerCase());
    if (ada) {
      katKode.set(c.code, ada.code);
      categories.push({ code: ada.code, name: c.name, action: "SKIP" });
      continue;
    }
    const kode = uniqueCode(codeFromName(c.name), kodeKatDipakai);
    katKode.set(c.code, kode);
    categories.push({ code: kode, name: c.name, action: "CREATE" });
  }

  const supKode = new Map<string, string>();
  const suppliers: MasterPlan[] = [];
  for (const s of parsed.suppliers) {
    const ada = supByName.get(s.name.trim().toLowerCase());
    if (ada) {
      supKode.set(s.code, ada.code);
      suppliers.push({ code: ada.code, name: s.name, action: "SKIP" });
      continue;
    }
    const kode = uniqueCode(codeFromName(s.name), kodeSupDipakai);
    supKode.set(s.code, kode);
    suppliers.push({ code: kode, name: s.name, action: "CREATE" });
  }

  const items: ItemPlan[] = [];
  for (const it of parsed.items) {
    const lama = itemByCode.get(it.code);
    if (!lama) {
      items.push({
        rowNumber: it.rowNumber,
        code: it.code,
        name: it.name,
        action: "CREATE",
        reason: null,
        changes: [],
        notes: it.notes,
      });
      continue;
    }
    const changes = katalogChanges(lama, {
      categoryId: it.categoryCode,
      supplierId: it.supplierCode,
      purchaseCost: it.purchaseCost,
      salePrice: it.salePrice,
      condition: it.condition,
    });
    const notes = [...it.notes];
    if (lama.name.trim().toLowerCase() !== it.name.trim().toLowerCase()) {
      // Nama TIDAK ditimpa lewat impor — hanya dilaporkan. Katalog sumber
      // memuat dua daftar nama yang berbeda untuk kode yang sama, dan
      // memilih salah satunya secara diam-diam bukan keputusan yang boleh
      // diambil oleh sebuah unggahan berkas.
      notes.push(`Nama di aplikasi "${lama.name}" berbeda dari berkas "${it.name}" — tidak diubah.`);
    }
    items.push({
      rowNumber: it.rowNumber,
      code: it.code,
      name: lama.name,
      action: changes.length ? "LENGKAPI" : "SKIP",
      reason: changes.length ? null : "Sudah ada dan lengkap.",
      changes: changes.map((c) => c.ringkas),
      notes,
    });
  }

  // Saldo awal hanya untuk barang yang BELUM punya saldo di gudang ini.
  // Menjalankan ulang berkas yang sama tidak boleh menambah stok dua kali —
  // itu kegagalan idempotensi yang paling mahal di modul gudang.
  const punyaSaldo = new Set(
    (
      await db.stockLevel.findMany({
        where: { warehouseId, onHand: { gt: 0 } },
        select: { item: { select: { code: true } } },
      })
    ).map((s) => s.item.code)
  );

  const stock: StockPlan[] = parsed.stock.map((s) => {
    if (s.quantity === 0) {
      return { itemCode: s.itemCode, quantity: 0, action: "SKIP", reason: "Saldo nol." };
    }
    if (punyaSaldo.has(s.itemCode)) {
      return {
        itemCode: s.itemCode,
        quantity: s.quantity,
        action: "SKIP",
        reason: `Sudah punya saldo di ${gudang.name}.`,
      };
    }
    return { itemCode: s.itemCode, quantity: s.quantity, action: "CREATE", reason: null };
  });

  const masukStok = stock.filter((s) => s.action === "CREATE");

  return {
    ok: true,
    data: {
      plan: {
        ok: parsed.issues.length === 0,
        warehouseName: gudang.name,
        categories,
        suppliers,
        items,
        stock,
        issues: parsed.issues,
        willCreateItems: items.filter((i) => i.action === "CREATE").length,
        willCompleteItems: items.filter((i) => i.action === "LENGKAPI").length,
        willSkipItems: items.filter((i) => i.action === "SKIP").length,
        willCreateCategories: categories.filter((c) => c.action === "CREATE").length,
        willCreateSuppliers: suppliers.filter((s) => s.action === "CREATE").length,
        openingUnits: masukStok.reduce((a, s) => a + s.quantity, 0),
        skippedMovements: parsed.skippedMovements,
        ignoredSheets: parsed.ignoredSheets,
      },
      parsed,
      katKode,
      supKode,
    },
  };
}

// ── Pratinjau ───────────────────────────────────────────────────

export async function previewCatalogImport(
  user: CurrentUser,
  file: File,
  warehouseId: string
): Promise<Result<ImportPlan>> {
  const sheets = await toSheets(user, file);
  if (!sheets.ok) return sheets;
  const rencana = await buildPlan(sheets.data, warehouseId);
  if (!rencana.ok) return rencana;
  return { ok: true, data: rencana.data.plan };
}

// ── Penerapan ───────────────────────────────────────────────────

export async function applyCatalogImport(
  user: CurrentUser,
  file: File,
  warehouseId: string
): Promise<Result<ImportOutcome>> {
  const sheets = await toSheets(user, file);
  if (!sheets.ok) return sheets;

  const rencana = await buildPlan(sheets.data, warehouseId);
  if (!rencana.ok) return rencana;
  const { plan, parsed, katKode, supKode } = rencana.data;

  if (!plan.ok) {
    return {
      ok: false,
      error: `Berkas masih memuat ${plan.issues.length} masalah. Perbaiki dulu di sumbernya — impor separuh lebih sulit dibereskan daripada impor yang ditolak.`,
    };
  }

  const outcome: ImportOutcome = {
    createdCategories: 0,
    createdSuppliers: 0,
    createdItems: [],
    completedItems: [],
    skippedItems: plan.willSkipItems,
    openingTxNumber: null,
    openingUnits: 0,
  };

  // Master dan item dalam SATU transaksi basis data. Saldo awal menyusul di
  // luar transaksi ini karena ia lewat jalur inventory yang punya transaksinya
  // sendiri — kalau saldo gagal, katalognya tetap benar dan saldo bisa
  // diulang; kebalikannya tidak berlaku, sebab saldo butuh item ada dulu.
  await db.$transaction(async (prisma) => {
    for (const c of plan.categories) {
      if (c.action !== "CREATE") continue;
      await prisma.category.create({ data: { type: "ITEM", code: c.code, name: c.name } });
      outcome.createdCategories++;
    }
    for (const s of plan.suppliers) {
      if (s.action !== "CREATE") continue;
      const sumber = parsed.suppliers.find((x) => supKode.get(x.code) === s.code);
      await prisma.supplier.create({
        data: {
          code: s.code,
          name: s.name,
          phone: sumber?.phone ?? null,
          email: sumber?.email ?? null,
          address: sumber?.address ?? null,
          website: sumber?.website ?? null,
        },
      });
      outcome.createdSuppliers++;
    }

    const kat = new Map(
      (await prisma.category.findMany({ where: { type: "ITEM" }, select: { id: true, code: true } })).map((c) => [
        c.code,
        c.id,
      ])
    );
    const sup = new Map(
      (await prisma.supplier.findMany({ select: { id: true, code: true } })).map((s) => [s.code, s.id])
    );

    for (const it of parsed.items) {
      const rencanaBaris = plan.items.find((p) => p.code === it.code);
      if (!rencanaBaris || rencanaBaris.action === "SKIP") continue;

      const categoryId = kat.get(katKode.get(it.categoryCode) ?? "") ?? null;
      const supplierId = it.supplierCode ? (sup.get(supKode.get(it.supplierCode) ?? "") ?? null) : null;
      const purchaseCost = it.purchaseCost === null ? null : BigInt(it.purchaseCost);
      const salePrice = it.salePrice === null ? null : BigInt(it.salePrice);

      if (rencanaBaris.action === "CREATE") {
        await prisma.item.create({
          data: {
            code: it.code,
            name: it.name,
            categoryId,
            supplierId,
            purchaseCost,
            salePrice,
            condition: it.condition,
          },
        });
        outcome.createdItems.push({ code: it.code, name: it.name });
        continue;
      }

      // LENGKAPI — hanya bidang yang direncanakan, tidak sebaris pun di luar
      // KOLOM_KATALOG. `undefined` berarti biarkan; `null` berarti kosongkan.
      const ubah: Record<string, unknown> = {};
      for (const c of rencanaBaris.changes) {
        if (c.startsWith("Kategori")) ubah.categoryId = categoryId;
        else if (c.startsWith("Vendor")) ubah.supplierId = supplierId;
        else if (c.startsWith("Harga beli")) ubah.purchaseCost = purchaseCost;
        else if (c.startsWith("Harga jual")) ubah.salePrice = salePrice;
        else if (c.startsWith("Kondisi")) ubah.condition = it.condition;
      }
      if (Object.keys(ubah).length === 0) continue;
      await prisma.item.update({ where: { code: it.code }, data: ubah });
      outcome.completedItems.push({ code: it.code, fields: Object.keys(ubah) });
    }
  });

  // ── Saldo awal lewat jalur inventory yang sudah ada ────────────
  //
  // Bukan tulis langsung ke StockLevel. Jalur itu punya nomor dokumen,
  // pemeriksaan izin, penegakan scope gudang, dan ledger — semuanya hilang
  // kalau saldo disuntikkan diam-diam, dan opname pertama akan menemukan
  // stok yang tidak punya asal-usul.
  const masuk = plan.stock.filter((s) => s.action === "CREATE");
  if (masuk.length > 0) {
    const byCode = new Map(
      (
        await db.item.findMany({
          where: { code: { in: masuk.map((s) => s.itemCode) } },
          select: { id: true, code: true },
        })
      ).map((i) => [i.code, i.id])
    );
    const lines = masuk
      .map((s) => ({ itemId: byCode.get(s.itemCode) ?? "", qty: s.quantity }))
      .filter((l) => l.itemId);

    const draft = await createDraftTransaction(
      user,
      "GOODS_RECEIPT",
      {
        warehouseToId: warehouseId,
        purpose: "Saldo awal impor katalog gudang",
        referenceNote: `Impor katalog — ${masuk.length} material`,
      },
      lines
    );
    if (!draft.ok) return { ok: false, error: `Katalog tersimpan, tetapi saldo awal gagal: ${draft.error}` };

    const posted = await postTransaction(user, draft.id);
    if (!posted.ok) return { ok: false, error: `Katalog tersimpan, tetapi saldo awal gagal diposting: ${posted.error}` };

    const tx = await db.stockTransaction.findUnique({
      where: { id: draft.id },
      select: { txNumber: true },
    });
    outcome.openingTxNumber = tx?.txNumber ?? null;
    outcome.openingUnits = lines.reduce((a, l) => a + l.qty, 0);
  }

  await logAudit({
    userId: user.id,
    action: "ITEM_CATALOG_IMPORT",
    module: "inventory",
    entityType: "Item",
    description:
      `Impor katalog ke ${plan.warehouseName}: ${outcome.createdItems.length} material baru, ` +
      `${outcome.completedItems.length} dilengkapi, ${outcome.skippedItems} dilewati, ` +
      `${outcome.createdCategories} kategori & ${outcome.createdSuppliers} vendor dibuat` +
      (outcome.openingTxNumber ? `, saldo awal ${outcome.openingTxNumber} (${outcome.openingUnits} unit)` : ""),
    metadata: {
      kategoriDibuat: outcome.createdCategories,
      vendorDibuat: outcome.createdSuppliers,
      itemDibuat: outcome.createdItems.length,
      itemDilengkapi: outcome.completedItems.length,
      itemDilewati: outcome.skippedItems,
      saldoAwal: outcome.openingTxNumber,
      unitSaldoAwal: outcome.openingUnits,
      gudang: plan.warehouseName,
      pergerakanDilewati: plan.skippedMovements,
    },
  });

  return { ok: true, data: outcome };
}
