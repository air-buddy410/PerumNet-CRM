// ── Menilai kesehatan sistem (Fase 84) ──────────────────────────
//
// Lapisan MURNI. Tidak menyentuh basis data.
//
// KENAPA BERKAS INI ADA, padahal layar penjadwal sudah menampilkan banyak:
//
// Layar itu menampilkan `lastStatus` dan `lastRunAt`. Keduanya benar, dan
// justru itu masalahnya — sebuah tugas bisa berbunyi **SUCCESS berwarna
// hijau** padahal sudah enam jam tidak berjalan sama sekali. Statusnya
// menjawab "bagaimana hasil jalan TERAKHIR", bukan "apakah ia masih hidup".
// Worker yang mati diam-diam tidak menghasilkan kegagalan; ia berhenti
// menghasilkan apa pun, dan layar tetap hijau.
//
// Yang membedakan hidup dari mati adalah KESEGARAN: berapa lama sejak jalan
// terakhir, diukur terhadap intervalnya sendiri. Itu perhitungan, bukan kolom,
// dan tidak ada yang menghitungnya sampai sekarang.
//
// Satu hal lagi yang membentuk berkas ini: **laporan yang terlalu cerewet
// tidak dibaca.** Ambangnya sengaja longgar. Lebih baik satu peringatan yang
// selalu berarti daripada sepuluh yang biasanya salah.

/** Seberapa hidup satu tugas berjadwal. */
export type Kesegaran = "MATI" | "SEGAR" | "TERLAMBAT" | "MACET";

export interface NilaiKesegaran {
  status: Kesegaran;
  /** Detik sejak jalan terakhir; null bila belum pernah. */
  telatDetik: number | null;
  /** Keterlambatan sebagai KELIPATAN intervalnya — inilah ukuran sebenarnya. */
  telatKali: number | null;
  alasan: string;
}

/**
 * Toleransi mutlak. Di bawah ini tidak pernah dianggap terlambat, berapa pun
 * kelipatannya.
 *
 * Alasannya: worker berdetak tiap 15 detik dan satu putaran bisa memakan
 * beberapa detik, jadi tugas berinterval 60 detik yang wajar pun rutin telat
 * 20–30 detik. Tanpa lantai ini, tugas tercepat kita akan berkedip merah
 * sepanjang hari dan orang berhenti mempercayai layarnya.
 */
const LANTAI_DETIK = 180;

/** Di atas dua kali intervalnya → terlambat. Di atas sepuluh kali → macet. */
const AMBANG_TERLAMBAT = 2;
const AMBANG_MACET = 10;

export interface TugasMasuk {
  isEnabled: boolean;
  intervalSec: number;
  lastRunAt: Date | null;
}

export function nilaiKesegaran(t: TugasMasuk, sekarang: Date): NilaiKesegaran {
  // Jarak sejak jalan terakhir dihitung LEBIH DULU, bahkan untuk tugas yang
  // dimatikan. Tugas yang dimatikan tetap punya riwayat — `channels.outbox`
  // sudah berjalan 4.135 kali sebelum mode baca-saja mematikannya — dan
  // melaporkannya sebagai "belum pernah" adalah pernyataan yang keliru, bukan
  // sekadar kurang rapi.
  const telatDetik = t.lastRunAt
    ? Math.max(0, Math.round((sekarang.getTime() - t.lastRunAt.getTime()) / 1000))
    : null;
  const interval = Math.max(1, t.intervalSec);
  const telatKali = telatDetik === null ? null : telatDetik / interval;

  // Tugas yang sengaja dimatikan BUKAN kegagalan. Mode baca-saja mematikan
  // lima tugas penulis, dan menandainya merah akan mengubur yang sungguhan.
  if (!t.isEnabled) {
    return { status: "MATI", telatDetik, telatKali, alasan: "Sengaja dimatikan." };
  }
  if (telatDetik === null || telatKali === null) {
    return { status: "MACET", telatDetik: null, telatKali: null, alasan: "Aktif, tetapi belum pernah berjalan." };
  }

  if (telatDetik <= LANTAI_DETIK) {
    return { status: "SEGAR", telatDetik, telatKali, alasan: `Berjalan ${telatDetik} detik lalu.` };
  }
  if (telatKali <= AMBANG_TERLAMBAT) {
    return { status: "SEGAR", telatDetik, telatKali, alasan: `Masih dalam ${AMBANG_TERLAMBAT}× intervalnya.` };
  }
  if (telatKali <= AMBANG_MACET) {
    return {
      status: "TERLAMBAT",
      telatDetik,
      telatKali,
      alasan: `Sudah ${telatKali.toFixed(1)}× intervalnya tidak berjalan.`,
    };
  }
  return {
    status: "MACET",
    telatDetik,
    telatKali,
    alasan: `Sudah ${telatKali.toFixed(0)}× intervalnya tidak berjalan — worker kemungkinan mati.`,
  };
}

/**
 * Sewa yang tertinggal.
 *
 * Worker mengunci tugas saat merebutnya dan melepasnya saat selesai. Worker
 * yang mati di tengah jalan meninggalkan kuncinya terpasang; tugas itu lalu
 * tampak "sedang berjalan" selamanya. Sewa yang lebih tua dari batas boleh
 * direbut — tetapi selama belum ada yang merebutnya, ia perlu terlihat.
 */
export function sewaTertinggal(lockedAt: Date | null, sekarang: Date, batasDetik: number): boolean {
  if (!lockedAt) return false;
  return (sekarang.getTime() - lockedAt.getTime()) / 1000 > batasDetik;
}

// ── Kesimpulan menyeluruh ───────────────────────────────────────

export type Vonis = "SEHAT" | "PERHATIAN" | "GAWAT";

export interface Gejala {
  /** Bagian mana yang bermasalah, mis. `penjadwal`, `router`. */
  bagian: string;
  vonis: Vonis;
  pesan: string;
}

/**
 * Menyimpulkan satu vonis dari sekumpulan gejala.
 *
 * Yang terburuk menang. Sistem tidak "agak sehat" — kalau satu bagian
 * pentingnya mati, jawabannya bukan rata-rata.
 */
export function simpulkan(gejala: Gejala[]): Vonis {
  if (gejala.some((g) => g.vonis === "GAWAT")) return "GAWAT";
  if (gejala.some((g) => g.vonis === "PERHATIAN")) return "PERHATIAN";
  return "SEHAT";
}

/** Kesegaran satu tugas → vonis. */
export function vonisKesegaran(k: Kesegaran): Vonis {
  if (k === "MACET") return "GAWAT";
  if (k === "TERLAMBAT") return "PERHATIAN";
  return "SEHAT";
}

/**
 * Berapa lama, dalam kata-kata.
 *
 * Dipakai di layar dan di terminal. "6 jam lalu" langsung terbaca; sebuah
 * cap waktu menuntut orang menghitung sendiri — dan pada jam VPS yang UTC
 * sedangkan tim bekerja di Asia/Makassar, hitungan itu sering meleset satu
 * hari penuh.
 */
export function lamanya(detik: number | null): string {
  if (detik === null) return "belum pernah";
  if (detik < 60) return `${detik} detik lalu`;
  if (detik < 3600) return `${Math.round(detik / 60)} menit lalu`;
  if (detik < 86400) return `${(detik / 3600).toFixed(1)} jam lalu`;
  return `${(detik / 86400).toFixed(1)} hari lalu`;
}
