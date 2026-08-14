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
// Foto yang rasionya berbeda akan DIKOTAKI: `object-fit: contain` menyisakan
// bidang kosong di kiri-kanan atau atas-bawah. Itu bukan kemungkinan teoretis —
// kartu sungguhan yang pertama diterbitkan menampilkan foto lanskap sebagai
// pita tipis di tengah bidang tosca, dan kartunya terlihat rusak.
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

export function verificationPath(publicToken: string): string {
  return `/verify/${publicToken}`;
}

export function verificationUrl(appUrl: string, publicToken: string): string {
  return `${appUrl.replace(/\/+$/, "")}${verificationPath(publicToken)}`;
}
