// ── Kartu Pegawai (Fase 49) ─────────────────────────────────────
// Modul MURNI: tidak menyentuh database maupun jaringan.
//
// Kartu ini dipakai untuk membuktikan identitas di depan pintu rumah
// pelanggan, dan kelak untuk absensi serta akses pintu. Karena itu aturan
// "kartu ini masih berlaku atau tidak" terlalu berkonsekuensi untuk hidup di
// dalam query — ia ditulis di sini supaya bisa diuji dari segala sisi.

export const CARD_STATUSES = ["ACTIVE", "LOST", "REVOKED", "REPLACED"] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

export const CARD_STATUS_LABELS: Record<CardStatus, string> = {
  ACTIVE: "Berlaku",
  LOST: "Hilang",
  REVOKED: "Dicabut",
  REPLACED: "Diganti",
};

/** Status yang berarti kartunya sudah tidak berlaku, apa pun sebabnya. */
export const CARD_DEAD_STATUSES: readonly CardStatus[] = ["LOST", "REVOKED", "REPLACED"];

// ── Nomor kartu & token ─────────────────────────────────────────

/**
 * Nomor kartu yang tercetak: `KP-<NIK>-<urutan 2 digit>`.
 *
 * Boleh dibaca manusia dan boleh memuat NIK — ia memang tercetak besar di
 * kartu untuk keperluan administrasi. Yang TIDAK boleh bermakna adalah
 * `publicToken` di dalam QR, karena itulah yang dipindai orang asing.
 */
export function cardNumberFor(employeeNo: string, sequence: number): string {
  return `KP-${employeeNo.trim().toUpperCase()}-${String(sequence).padStart(2, "0")}`;
}

/** Panjang token QR dalam byte acak. 32 byte = 43 karakter base64url. */
export const CARD_TOKEN_BYTES = 32;

/**
 * Apakah token ini aman dipakai di QR?
 *
 * Menolak apa pun yang menyerupai data pegawai. Bukan sekadar kerapian: token
 * yang bermakna membuat siapa pun yang memotret kartu bisa membaca identitas
 * pemiliknya tanpa pernah menyentuh sistem kita.
 */
export function tokenRejection(token: string, employee: { employeeNo: string; fullName: string }): string | null {
  const t = token?.trim() ?? "";
  if (t.length < 32) return "Token terlalu pendek — mudah ditebak.";
  const lower = t.toLowerCase();
  if (lower.includes(employee.employeeNo.trim().toLowerCase())) {
    return "Token tidak boleh memuat NIK.";
  }
  const namePart = employee.fullName.trim().toLowerCase().split(/\s+/)[0];
  if (namePart.length >= 3 && lower.includes(namePart)) {
    return "Token tidak boleh memuat nama.";
  }
  return null;
}

// ── Masa berlaku & keberlakuan ──────────────────────────────────

export interface CardValidityInput {
  status: string;
  expiresAt: Date | null;
  /** Karyawan masih aktif di CRM. */
  employeeActive: boolean;
  /** Akun tertaut sedang beku (Fase 42), bila ada akunnya. */
  userFrozenAt: Date | null;
  /** Akun tertaut sudah diarsipkan (Fase 47), bila ada akunnya. */
  userArchived: boolean;
}

/**
 * Alasan kartu tidak berlaku, atau null bila berlaku.
 *
 * Urutan pemeriksaannya dari yang paling menentukan. Yang penting di sini
 * bukan sekadar status kartunya sendiri: **pembekuan dan pengarsipan akun
 * ikut mematikan kartu secara otomatis.** Inilah yang paling sering terlewat
 * pada sistem akses — orangnya sudah tidak bekerja, tetapi kartunya masih
 * membuka pintu berbulan-bulan karena tidak ada yang ingat mencabutnya.
 */
export function cardInvalidReason(c: CardValidityInput, now: Date): string | null {
  if (c.status !== "ACTIVE") {
    const label = CARD_STATUS_LABELS[c.status as CardStatus] ?? c.status;
    return `Kartu berstatus ${label}.`;
  }
  if (c.expiresAt && c.expiresAt <= now) {
    return `Masa berlaku kartu habis ${c.expiresAt.toLocaleDateString("id-ID")}.`;
  }
  if (!c.employeeActive) return "Pegawai sudah tidak aktif.";
  if (c.userArchived) return "Akun pemiliknya sudah diarsipkan.";
  if (c.userFrozenAt) {
    return `Akun pemiliknya beku sejak ${c.userFrozenAt.toLocaleDateString("id-ID")}.`;
  }
  return null;
}

export function isCardValid(c: CardValidityInput, now: Date): boolean {
  return cardInvalidReason(c, now) === null;
}

// ── Perpindahan status ──────────────────────────────────────────

export type CardAction = "LOST" | "REVOKED" | "REPLACED";

/**
 * Alasan sebuah perubahan status ditolak, atau null bila boleh.
 *
 * Status akhir tidak pernah bisa dibalik. Kartu yang sudah dinyatakan hilang
 * lalu "diaktifkan lagi" akan membuat dua kartu fisik berlaku bersamaan —
 * dan yang satu ada di tangan entah siapa.
 */
export function statusChangeRejection(current: string, next: CardAction): string | null {
  if (!CARD_STATUSES.includes(next as CardStatus)) {
    return `Status "${next}" tidak dikenal.`;
  }
  if (current !== "ACTIVE") {
    const label = CARD_STATUS_LABELS[current as CardStatus] ?? current;
    return `Kartu sudah berstatus ${label} — status akhir tidak bisa diubah lagi.`;
  }
  return null;
}

// ── Verifikasi publik ───────────────────────────────────────────

export interface PublicVerification {
  valid: boolean;
  /** Alasan singkat bila tidak berlaku. Tidak menyebut data pribadi. */
  reason: string | null;
  employeeName: string | null;
  jobTitle: string | null;
  photoUrl: string | null;
  cardNumber: string | null;
}

/**
 * Menyusun jawaban verifikasi publik — SEMINIMAL MUNGKIN.
 *
 * Halaman ini dibuka tanpa login oleh pelanggan yang ingin memastikan orang di
 * depan pintunya benar teknisi PerumNet. Karena itu isinya cukup untuk
 * menjawab pertanyaan itu dan tidak lebih: nama, jabatan, foto, nomor kartu.
 *
 * TIDAK PERNAH: alamat, telepon, NIK, email, divisi, status kepegawaian.
 * Kartu dipakai di tempat umum sepanjang hari — anggap semua yang bisa
 * dipindai dari kartu itu akan dilihat orang asing.
 *
 * Kartu tidak berlaku pun tetap menjawab, bukan diam: pelanggan justru perlu
 * tahu bahwa kartu yang ditunjukkan kepadanya sudah tidak berlaku.
 */
export function publicVerification(
  card: (CardValidityInput & { cardNumber: string }) | null,
  employee: { fullName: string; jobTitle: string | null; photoUrl: string | null } | null,
  now: Date
): PublicVerification {
  const empty: PublicVerification = {
    valid: false,
    reason: "Kartu tidak dikenal.",
    employeeName: null,
    jobTitle: null,
    photoUrl: null,
    cardNumber: null,
  };
  if (!card || !employee) return empty;

  const reason = cardInvalidReason(card, now);
  if (reason) {
    // Nama TIDAK ditampilkan untuk kartu yang tidak berlaku. Kalau kartunya
    // dicuri, halaman ini tidak boleh berubah menjadi cara mengetahui milik
    // siapa kartu itu.
    return { ...empty, reason, cardNumber: card.cardNumber };
  }
  return {
    valid: true,
    reason: null,
    employeeName: employee.fullName,
    jobTitle: employee.jobTitle,
    photoUrl: employee.photoUrl,
    cardNumber: card.cardNumber,
  };
}

/** Alamat halaman verifikasi untuk sebuah token — inilah isi QR-nya. */
// ── Ukuran foto resmi pegawai (Fase 63) ─────────────────────────
//
// Angka di sini MENCERMINKAN tata letak kartu di `globals.css`:
//
//   .employee-card-perspective   { aspect-ratio: 250 / 353; }  ← seri ISO B
//   .employee-card-portrait-wrap { inset: 0 0 25% 24%; }       ← 76% × 75%
//
// Slot fotonya berarti 0,76 lebar × 0,75 tinggi kartu, jadi rasionya
// 0,76 ÷ (0,75 × 353/250) ≈ 0,718 — lebih ramping daripada kartunya sendiri.
//
// Foto yang rasionya berbeda akan MERUSAK TAMPILAN. Waktu slotnya masih
// memakai `object-fit: contain`, foto lanskap muncul sebagai pita tipis di
// tengah bidang tosca — itu terjadi pada kartu sungguhan yang pertama
// diterbitkan. Slotnya kini `cover`, jadi yang terjadi bukan lagi dikotaki
// melainkan dipotong sembarang oleh peramban, di bagian yang tidak dipilih
// siapa pun.
//
// Memotongnya SAAT DIUNGGAH membuat keadaan itu tidak mungkin tercapai, bukan
// sekadar jarang. Meminta HRD memotong sendiri sebelum mengunggah berarti
// menaruh syarat yang tidak terlihat di tempat yang tidak memeriksanya.
//
// Dijaga tes: tests/unit/employee-card.test.ts membaca globals.css dan gagal
// bila salah satu angka di atas bergeser tanpa nilai di sini ikut disesuaikan.
export const CARD_FACE_RATIO = { width: 250, height: 353 } as const;
export const CARD_PHOTO_INSET = { top: 0, right: 0, bottom: 0.25, left: 0.24 } as const;

/** Rasio lebar terhadap tinggi slot foto pada muka kartu. */
export function cardPhotoAspect(): number {
  const lebar = 1 - CARD_PHOTO_INSET.left - CARD_PHOTO_INSET.right;
  const tinggi = 1 - CARD_PHOTO_INSET.top - CARD_PHOTO_INSET.bottom;
  return lebar / (tinggi * (CARD_FACE_RATIO.height / CARD_FACE_RATIO.width));
}

/**
 * Tinggi simpan. Pada kartu selebar 85 mm, fotonya sekitar 65 mm — 1254 piksel
 * di sisi tinggi memberi kepadatan di atas 300 dpi, cukup untuk dicetak tanpa
 * terlihat pecah, dan masih jauh lebih ringan daripada berkas kamera aslinya.
 */
export const CARD_PHOTO_HEIGHT = 1254;

export function cardPhotoWidth(): number {
  return Math.round(CARD_PHOTO_HEIGHT * cardPhotoAspect());
}

// ── Potongan pilihan pengguna (Fase 64) ─────────────────────────
//
// HRD menggeser sendiri bidang potongnya, karena mesin tidak tahu wajah siapa
// yang penting di foto rombongan — dan pemotongan otomatis yang meleset
// menghasilkan kartu yang harus dicetak ulang.
//
// Koordinatnya PECAHAN 0..1 terhadap gambar sumber, bukan piksel. Pratinjau di
// layar selalu diperkecil agar muat, dan ukurannya berbeda di tiap perangkat;
// mengirim piksel berarti peramban harus tahu ukuran asli berkasnya dan
// menghitung skalanya sendiri — satu tempat lagi yang bisa salah, dan salahnya
// tidak terlihat sampai kartunya tercetak.

export interface CardPhotoCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Sisi terpendek yang masih layak cetak, dalam piksel gambar SUMBER.
 *
 * Bidang yang lebih kecil dari ini akan diperbesar untuk mengisi 900×1254, dan
 * hasilnya pecah justru di wajah orangnya. Ditolak di sini, bukan dibiarkan —
 * kartu yang buram baru ketahuan setelah dicetak dan dibagikan.
 */
export const CARD_CROP_MIN_WIDTH = 450;
export const CARD_CROP_MIN_HEIGHT = 627;

/** Alasan potongan ditolak, atau null bila boleh dipakai. */
export function cropRejection(
  c: CardPhotoCrop,
  sumber: { width: number; height: number }
): string | null {
  const nilai = [c.x, c.y, c.width, c.height];
  if (nilai.some((n) => typeof n !== "number" || !Number.isFinite(n))) {
    return "Area potong tidak terbaca. Geser ulang kotaknya.";
  }
  if (c.width <= 0 || c.height <= 0) return "Area potong kosong. Geser ulang kotaknya.";
  if (c.x < 0 || c.y < 0) return "Area potong keluar dari foto.";
  // Toleransi kecil: pembulatan pecahan di peramban sering menghasilkan
  // 1.0000000000000002, dan menolaknya hanya membuat orang bingung.
  if (c.x + c.width > 1.0001 || c.y + c.height > 1.0001) {
    return "Area potong keluar dari foto.";
  }
  const lebar = Math.round(c.width * sumber.width);
  const tinggi = Math.round(c.height * sumber.height);
  if (lebar < CARD_CROP_MIN_WIDTH || tinggi < CARD_CROP_MIN_HEIGHT) {
    return (
      `Area potong terlalu kecil (${lebar}×${tinggi} piksel). ` +
      `Perbesar kotaknya, minimal ${CARD_CROP_MIN_WIDTH}×${CARD_CROP_MIN_HEIGHT} — ` +
      "kalau lebih kecil, wajahnya pecah saat kartunya dicetak."
    );
  }
  return null;
}

/** Bidang potong dalam PIKSEL gambar sumber, siap diberikan ke pemroses gambar. */
export function cropToPixels(
  c: CardPhotoCrop,
  sumber: { width: number; height: number }
): { left: number; top: number; width: number; height: number } {
  const left = Math.round(c.x * sumber.width);
  const top = Math.round(c.y * sumber.height);
  // Dijepit ke tepi gambar: pembulatan bisa membuat left+width melewati sisi
  // kanan satu piksel, dan pemroses gambar menolaknya dengan galat yang tidak
  // bisa dipahami siapa pun.
  return {
    left,
    top,
    width: Math.min(Math.round(c.width * sumber.width), sumber.width - left),
    height: Math.min(Math.round(c.height * sumber.height), sumber.height - top),
  };
}

export function verificationPath(publicToken: string): string {
  return `/verify/${publicToken}`;
}

export function verificationUrl(appUrl: string, publicToken: string): string {
  return `${appUrl.replace(/\/+$/, "")}${verificationPath(publicToken)}`;
}
