// ── Berkas dan riwayat per pelanggan (Fase 86) ──────────────────
//
// Lapisan MURNI untuk aturannya; yang membaca basis data ada di
// `customer-dossier-service.ts`.
//
// TIDAK ADA MODEL BARU DI SINI, dan itu keputusan.
//
// Rencana Fase 86 semula menyebut model `CustomerFile`. Ternyata `Attachment`
// sudah polimorfik — `entityType` + `entityId` — dan sudah dipakai enam jenis
// entitas lain dengan seluruh perlindungan yang diminta SOP §21: magic-byte
// diperiksa, path traversal dijaga berlapis, unduhan gagal-tertutup, 404 alih-
// alih 403, `nosniff` dan CSP sandbox pada responsnya.
//
// Membuat model kedua berarti membangun ulang keenam perlindungan itu, dan
// yang kedua pasti tertinggal ketika yang pertama diperbaiki. Jadi berkas
// pelanggan memakai `Attachment` dengan `entityType` yang didaftarkan di sini.

/**
 * Jenis berkas pelanggan yang dikenali.
 *
 * Dipisah per jenis, bukan satu keranjang, sebab **izinnya berbeda**. Scan KTP
 * adalah PII: siapa pun yang boleh melihat daftar pelanggan TIDAK otomatis
 * boleh melihat kartu identitasnya. Formulir berlangganan tidak sepeka itu.
 */
export const JENIS_BERKAS = {
  /** Scan KTP/kartu identitas — PII, izinnya paling ketat. */
  KTP: "CustomerIdCard",
  /** Formulir berlangganan bertanda tangan. */
  FORM: "CustomerForm",
  /** Foto rumah/lokasi pemasangan. */
  FOTO: "CustomerPhoto",
} as const;

export type JenisBerkas = keyof typeof JENIS_BERKAS;
export type EntityBerkas = (typeof JENIS_BERKAS)[JenisBerkas];

/** Label yang ditampilkan; kuncinya yang disimpan. */
export const LABEL_BERKAS: Record<EntityBerkas, string> = {
  [JENIS_BERKAS.KTP]: "Kartu identitas",
  [JENIS_BERKAS.FORM]: "Formulir berlangganan",
  [JENIS_BERKAS.FOTO]: "Foto lokasi",
};

/** Jenis mana yang isinya PII dan menuntut izin tambahan. */
export const BERKAS_PII: ReadonlySet<string> = new Set<string>([JENIS_BERKAS.KTP]);

export function jenisBerkasSah(entityType: string): entityType is EntityBerkas {
  return (Object.values(JENIS_BERKAS) as string[]).includes(entityType);
}

// ── Riwayat perubahan ───────────────────────────────────────────

export interface BarisRiwayat {
  waktu: Date;
  aksi: string;
  oleh: string | null;
  keterangan: string;
  modul: string;
}

/**
 * Aksi audit yang menyangkut seorang pelanggan, meski entitasnya bukan
 * `Customer`.
 *
 * Riwayat yang hanya menampilkan baris ber-`entityType: "Customer"` akan
 * bohong dengan cara yang halus: perubahan yang paling penting bagi pelanggan
 * — langganannya diisolir, tagihannya terbit, perangkatnya ditarik — tercatat
 * pada entitas LAIN. Layar yang menampilkan "tidak ada perubahan" untuk
 * pelanggan yang bulan lalu diisolir lebih buruk daripada tidak ada layar.
 */
export const ENTITAS_TERKAIT = [
  "Customer",
  "Subscription",
  "Invoice",
  "Payment",
  "ServiceSuspension",
  "CustomerTicket",
  "WorkOrder",
  "SerializedDevice",
] as const;

/**
 * Merangkai baris audit menjadi riwayat yang terbaca.
 *
 * Diurutkan menurun — yang terbaru di atas, sebab pertanyaan yang hampir
 * selalu ditanyakan adalah "apa yang terakhir terjadi pada orang ini".
 */
export function susunRiwayat(
  rows: {
    createdAt: Date;
    action: string;
    module: string;
    description: string;
    user: { name: string } | null;
  }[]
): BarisRiwayat[] {
  return [...rows]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((r) => ({
      waktu: r.createdAt,
      aksi: r.action,
      oleh: r.user?.name ?? null,
      keterangan: r.description,
      modul: r.module,
    }));
}
