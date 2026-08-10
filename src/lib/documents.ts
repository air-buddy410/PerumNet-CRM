import { db } from "@/lib/db";

// ── Penomoran Dokumen ───────────────────────────────────────────
// Fase 16 (PRD-WAREHOUSE-ENHANCEMENT F4).
//
// Menggantikan pola lama `count(where startsWith prefix) + 1` yang dipakai
// invoice dan transaksi stock. Pola itu punya dua masalah:
//   1. Dua proses yang berjalan bersamaan membaca count yang sama, lalu
//      keduanya menghasilkan nomor identik — satu ditolak unique constraint
//      dan prosesnya gagal di tengah jalan.
//   2. Biayanya tumbuh seiring jumlah dokumen (COUNT penuh setiap kali).
//
// Di sini nomor diambil lewat upsert + increment pada satu baris counter.
// Prisma menerjemahkannya menjadi INSERT ... ON CONFLICT DO UPDATE, sehingga
// operasinya atomik dan mengunci baris — pemanggil yang bersamaan berbaris,
// tidak saling menimpa.
//
// WAJIB dipanggil dengan client transaksi yang sama dengan dokumen yang dibuat.
// Kalau dipanggil di luar transaksi, nomor bisa terpakai walau dokumennya
// akhirnya gagal dibuat (lompatan nomor — tidak merusak, tapi hindari).

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

export type SequencePeriod = "MONTHLY" | "DAILY";

export interface DocumentNumberOptions {
  /** Kode tipe dokumen, sekaligus prefix nomor. Contoh: "INV", "ISS", "DO". */
  docType: string;
  /** Prefix yang tampil di nomor bila berbeda dari docType. */
  prefix?: string;
  /** Granularitas counter. Default MONTHLY. */
  period?: SequencePeriod;
  /** Tanggal acuan. Default sekarang. */
  at?: Date;
  /** Jumlah digit urutan. Default 4 → 0001. */
  padding?: number;
  /**
   * Dipanggil HANYA saat counter periode ini belum pernah ada, untuk mengambil
   * urutan tertinggi dari dokumen lama yang dibuat sebelum sistem sequence ini.
   * Tanpa ini, counter mulai dari 1 dan langsung bentrok dengan nomor lama.
   */
  backfill?: (periodKey: string) => Promise<number>;
}

export function periodKeyFor(period: SequencePeriod, at: Date = new Date()): string {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, "0");
  if (period === "DAILY") {
    return `${y}${m}${String(at.getDate()).padStart(2, "0")}`;
  }
  return `${y}${m}`;
}

/**
 * Mengambil nomor dokumen berikutnya secara atomik.
 * Format: `{PREFIX}-{periodKey}-{urutan}` — contoh `INV-202608-0001`.
 */
export async function nextDocumentNumber(
  prisma: TxClient,
  options: DocumentNumberOptions
): Promise<string> {
  const { docType, prefix, period = "MONTHLY", at, padding = 4, backfill } = options;
  const periodKey = periodKeyFor(period, at);

  if (backfill) {
    const existing = await prisma.documentSequence.findUnique({
      where: { docType_periodKey: { docType, periodKey } },
      select: { id: true },
    });
    if (!existing) {
      await seedSequence(prisma, docType, periodKey, await backfill(periodKey));
    }
  }

  const seq = await prisma.documentSequence.upsert({
    where: { docType_periodKey: { docType, periodKey } },
    create: { docType, periodKey, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
    select: { lastNumber: true },
  });

  return `${prefix ?? docType}-${periodKey}-${String(seq.lastNumber).padStart(padding, "0")}`;
}

/**
 * Mengambil urutan tertinggi dari sekumpulan nomor dokumen.
 * Membaca segmen terakhir setelah tanda hubung: "INV-202608-0042" → 42.
 */
export function highestSuffix(numbers: string[]): number {
  let max = 0;
  for (const n of numbers) {
    const tail = n.split("-").pop();
    const value = Number(tail);
    if (Number.isInteger(value) && value > max) max = value;
  }
  return max;
}

/**
 * Menyelaraskan counter dengan nomor tertinggi yang sudah ada.
 *
 * Dipakai sekali saat migrasi dari penomoran lama: tanpa ini counter mulai
 * dari 1 dan langsung bentrok dengan dokumen lama yang nomornya sudah terpakai.
 * `highest` adalah urutan tertinggi yang sudah dipakai pada periode tersebut.
 */
export async function seedSequence(
  prisma: TxClient,
  docType: string,
  periodKey: string,
  highest: number
): Promise<void> {
  if (highest <= 0) return;
  const existing = await prisma.documentSequence.findUnique({
    where: { docType_periodKey: { docType, periodKey } },
    select: { lastNumber: true },
  });
  if (existing && existing.lastNumber >= highest) return;
  await prisma.documentSequence.upsert({
    where: { docType_periodKey: { docType, periodKey } },
    create: { docType, periodKey, lastNumber: highest },
    update: { lastNumber: highest },
  });
}
