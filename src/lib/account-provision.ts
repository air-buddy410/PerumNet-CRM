// ── Menyiapkan akun CRM dari kotak surat (Fase 52) ──────────────
//
// Modul MURNI. Tugasnya cuma satu: mengubah sebuah alamat email menjadi
// USULAN — nama tampilan, username, dan dugaan apakah alamat itu milik orang
// atau milik fungsi (helpdesk@, no-reply@).
//
// Kata "usulan" itu inti seluruh berkas ini. Tidak ada satu pun keputusan yang
// diambil di sini. Kalau kotak surat bisa langsung menjadi akun CRM tanpa
// manusia menyetujuinya, maka siapa pun yang bisa membuat kotak surat bisa
// membuat akun di CRM — dan mailserver berubah menjadi pintu masuk ke sistem.
// Batas itu sama dengan yang sudah dipegang untuk tag divisi.

/** Kata yang menandakan alamat fungsi, bukan orang. */
const SHARED_WORDS = [
  "admin", "administrator", "info", "support", "helpdesk", "help", "cs",
  "sales", "marketing", "billing", "finance", "hrd", "hr", "it", "noc",
  "operation", "operations", "ops", "enterprise", "project", "warehouse",
  "no-reply", "noreply", "donotreply", "postmaster", "abuse", "webmaster",
  "office", "contact", "mail", "team", "sistem", "system",
];

export interface MailboxSuggestion {
  email: string;
  /** Bagian sebelum @, apa adanya. */
  localPart: string;
  /** Usulan nama tampilan, mis. "wayan_budiarta" → "Wayan Budiarta". */
  suggestedName: string;
  /** Usulan username, selalu huruf kecil dan aman dipakai. */
  suggestedUsername: string;
  /** Dugaan bahwa ini alamat fungsi, bukan orang. */
  likelyShared: boolean;
  /** Kenapa diduga begitu — supaya IT bisa menilai, bukan disuruh percaya. */
  sharedReason: string | null;
}

/**
 * Nama tampilan dari bagian lokal alamat.
 *
 * "wayan_budiarta" → "Wayan Budiarta". Pemisah titik, garis bawah, garis
 * datar, dan angka diperlakukan sama.
 */
export function nameFromLocalPart(localPart: string): string {
  return localPart
    .split(/[._\-+]+/)
    .filter(Boolean)
    .map((w) => (w.length <= 1 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ")
    .trim();
}

/**
 * Username dari bagian lokal.
 *
 * Dipangkas ke huruf/angka/titik/garis bawah — bentuk yang diterima form
 * pembuatan user. Yang di luar itu dibuang, bukan diganti, supaya hasilnya
 * bisa ditebak orang.
 */
export function usernameFromLocalPart(localPart: string): string {
  return localPart.toLowerCase().replace(/[^a-z0-9._-]/g, "");
}

/**
 * Menduga apakah sebuah alamat milik fungsi, bukan orang.
 *
 * DUGAAN, bukan penyaring. Hasilnya dipakai untuk menentukan centang awal di
 * layar — IT tetap bisa membalikkannya. Kalau ini dijadikan penyaring diam-
 * diam, seorang karyawan yang kebetulan beralamat `sales@` akan hilang dari
 * daftar tanpa ada yang tahu.
 */
export function sharedMailboxReason(localPart: string): string | null {
  const s = localPart.toLowerCase();
  if (SHARED_WORDS.includes(s)) return `"${s}" adalah alamat fungsi, bukan nama orang.`;
  // Satu kata tanpa pemisah DAN tanpa angka biasanya bukan nama lengkap.
  // Sengaja tidak dijadikan alasan sendiri — terlalu sering salah pada nama
  // Indonesia satu kata seperti "supratman".
  if (/^(no-?reply|do-?not-?reply)/.test(s)) return "Alamat ini memang tidak untuk dibalas.";
  return null;
}

export function suggestFromEmail(email: string): MailboxSuggestion {
  const normalized = email.trim().toLowerCase();
  const localPart = normalized.split("@")[0] ?? "";
  const reason = sharedMailboxReason(localPart);
  return {
    email: normalized,
    localPart,
    suggestedName: nameFromLocalPart(localPart),
    suggestedUsername: usernameFromLocalPart(localPart),
    likelyShared: reason !== null,
    sharedReason: reason,
  };
}

/**
 * Membuat username unik terhadap yang sudah dipakai.
 *
 * Menambahkan angka di belakang, bukan menolak. Dua orang bernama sama itu
 * wajar; membuat IT memikirkan username baru sendiri hanya memperlambat.
 */
export function uniqueUsername(base: string, taken: ReadonlySet<string>): string {
  const clean = base || "user";
  if (!taken.has(clean)) return clean;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${clean}${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`Tidak bisa menyusun username unik dari "${base}".`);
}

/**
 * Menyandingkan nama pegawai dengan nama hasil terkaan dari alamat email.
 *
 * Dinormalkan: huruf kecil, spasi dirapatkan. TIDAK ada pencocokan
 * sebagian — "Budi Prabhawa" tidak dianggap sama dengan "Budi Dharma
 * Prabhawa". Menebak di sini berarti menautkan akun ke orang yang salah, dan
 * itu jauh lebih buruk daripada meminta IT memilih sendiri.
 */
export function normalizePersonName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
