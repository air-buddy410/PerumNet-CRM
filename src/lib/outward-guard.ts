// Penjaga aksi keluar — mode baca-saja (docs/MODE-BACA-SAJA.md).
//
// CRM sudah memuat data produksi tetapi BELUM menjadi sistem yang dipakai:
// operasional sungguhan masih di perumnet.alus.co.id. Selama itu berlaku, CRM
// tidak boleh mengirim pesan, mengisolir, atau menerbitkan tagihan. Kalau CRM
// bertindak sementara ALUS juga melakukannya, pelanggan menerima dua perlakuan
// dari dua sistem yang tidak saling tahu.
//
// KENAPA INI ADA, padahal lima pekerjaan terjadwal sudah dimatikan di database.
// Dua lubang pada cara itu, keduanya nyata:
//
//   1. `isEnabled=false` cuma data. Database BARU menyalakannya kembali —
//      empat dari lima tugas ber-`enabledByDefault: true` di kode.
//   2. Gerbangnya cuma di `runDueTasks()`. Tombol manual di halaman
//      (`runQueueAction`, `runJobsAction`, `postInvoiceRunAction`) memanggil
//      fungsi yang sama TANPA melewati gerbang itu — yang menahan hanya izin
//      RBAC.
//
// Penjaga ini duduk di dalam fungsi domainnya, jadi jalur terjadwal DAN jalur
// manual sama-sama menabraknya. Polanya diambil dari monitoring-noc
// (`src/server/outward-guard.ts`, 19 Agustus 2026).
//
// BAWAANNYA MEMBLOKIR. Tidak diisi memblokir; salah ketik memblokir. Itu yang
// menutup lubang nomor 1: database baru tidak bisa lagi menyalakan apa pun
// sendiri, karena keputusannya tidak lagi tinggal di database.

export type OutwardAction =
  | "channels.send"
  | "network.access"
  | "billing.post-invoice";

export type OutwardMode = "ALLOWED" | "BLOCKED";

const LABEL: Record<OutwardAction, string> = {
  "channels.send": "Mengirim pesan ke pelanggan",
  "network.access": "Menjalankan perintah isolir/pemulihan ke router",
  "billing.post-invoice": "Menerbitkan tagihan",
};

/** ALLOWED hanya bila OUTWARD_ACTIONS bernilai persis "ALLOWED". */
export function outwardMode(): OutwardMode {
  const raw = (process.env.OUTWARD_ACTIONS ?? "BLOCKED").trim().toUpperCase();
  return raw === "ALLOWED" ? "ALLOWED" : "BLOCKED";
}

export function isOutwardBlocked(): boolean {
  return outwardMode() === "BLOCKED";
}

/** Pesan untuk pengguna: menyebut APA yang ditahan dan KENAPA, bukan sekadar
 *  "ditolak" — supaya tidak ada yang mengira sistemnya rusak. */
export function outwardBlockedMessage(action: OutwardAction): string {
  return (
    `${LABEL[action]} sedang ditahan: CRM dalam mode baca-saja karena ` +
    `operasional masih berjalan di ALUS. Lihat docs/MODE-BACA-SAJA.md.`
  );
}

/** Bentuknya mengikuti `Result` yang dipakai di seluruh src/lib. */
export function outwardBlocked(
  action: OutwardAction,
): { ok: false; error: string } {
  return { ok: false, error: outwardBlockedMessage(action) };
}
