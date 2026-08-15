// ── Menjembatani username PPPoE lama ke nomor layanan (Fase 73) ──
//
// Lapisan MURNI. Tidak menyentuh basis data, jadi seluruh aturannya bisa
// diuji tanpa router maupun pelanggan.
//
// Masalahnya nyata dan berbentuk begini: router memakai username warisan
// (`sryb_042532_mardika`), sedangkan sistem tagihan sudah menomori ulang
// semua orang (`PN102042532`). Keduanya tidak sama, tetapi TIDAK acak —
// nomor pelanggan lama tertanam sebagai AKHIRAN nomor barunya, dan nama
// pemiliknya ikut tertulis di username.
//
// Dua sinyal itu yang dipakai, dan keduanya harus setuju sebelum sebuah
// pasangan diterima. Menautkan sesi ke pelanggan yang salah lebih buruk
// daripada membiarkannya yatim: yang yatim kelihatan sebagai pekerjaan yang
// belum selesai, yang salah kelihatan sebagai pekerjaan yang sudah beres.

export interface Kandidat {
  /** Nomor layanan / CID, mis. `PN102042532`. */
  serviceNumber: string;
  /** Nama pelanggan pemilik langganan itu. */
  customerName: string;
}

export interface Pasangan {
  username: string;
  serviceNumber: string;
  /** `EXACT` | `SUFFIX` — bagaimana pasangan itu ditemukan. */
  how: string;
  /** Nama pelanggan ikut terbaca di username? */
  nameCorroborated: boolean;
}

export interface HasilCocok {
  matched: Pasangan[];
  /** Username yang punya lebih dari satu kandidat — sengaja tidak dipilih. */
  ambiguous: string[];
  /** Username tanpa kandidat sama sekali. */
  unmatched: string[];
}

/** Angka empat digit ke atas di dalam username; itulah nomor pelanggan lama. */
export function numbersIn(username: string): string[] {
  return username.match(/\d{4,}/g) ?? [];
}

/** Potongan huruf empat karakter ke atas; itulah calon nama. */
export function wordsIn(username: string): string[] {
  return (username.toLowerCase().match(/[a-z]{4,}/g) ?? []);
}

/**
 * Nama pelanggan muncul di dalam username?
 *
 * Dicek per kata: `sryb_042532_mardika` melawan "I Kadek Toni Mardika" cocok
 * karena "mardika" ada di keduanya. Kata pendek diabaikan — "i", "ni", "made"
 * muncul di ribuan nama Bali dan tidak membuktikan apa pun.
 */
export function nameCorroborates(username: string, customerName: string): boolean {
  const u = username.toLowerCase().replace(/[^a-z]/g, "");
  if (!u) return false;
  const kata = customerName
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 5 && !UMUM.has(w));
  return kata.some((w) => u.includes(w));
}

/**
 * Kata yang terlalu sering muncul untuk membuktikan apa pun.
 *
 * Nama Bali dibangun dari urutan kelahiran dan kasta: "wayan", "kadek",
 * "komang", "ketut" muncul pada ratusan pelanggan. Membiarkannya menguatkan
 * pasangan sama saja dengan tidak memeriksa nama sama sekali.
 */
const UMUM = new Set([
  "wayan", "kadek", "komang", "ketut", "putu", "gede", "made", "nyoman",
  "dewa", "gusti", "agus", "ayu", "luh", "nengah",
]);

/**
 * Mencocokkan username PPPoE ke nomor layanan.
 *
 * Urutannya sengaja: kecocokan PERSIS lebih dulu, sebab pelanggan baru
 * memang memakai CID sebagai username dan tidak perlu ditebak sama sekali.
 * Baru sesudahnya kecocokan akhiran-angka dicoba.
 *
 * @param requireName Bila true, pasangan berbasis akhiran HANYA diterima
 *   ketika namanya ikut menguatkan. Bawaannya true — dan sebaiknya tetap
 *   begitu untuk penerapan sungguhan.
 */
export function matchUsernames(
  usernames: string[],
  kandidat: Kandidat[],
  requireName = true
): HasilCocok {
  const out: HasilCocok = { matched: [], ambiguous: [], unmatched: [] };
  const byService = new Map(kandidat.map((k) => [k.serviceNumber, k]));

  // Indeks akhiran: tiap nomor layanan didaftarkan menurut ekor angkanya,
  // supaya pencarian tidak menyapu seluruh daftar untuk tiap username.
  const byTail = new Map<string, Kandidat[]>();
  for (const k of kandidat) {
    const digits = k.serviceNumber.replace(/\D/g, "");
    if (!digits) continue;
    for (let len = 4; len <= digits.length; len++) {
      const tail = digits.slice(-len);
      const arr = byTail.get(tail) ?? [];
      arr.push(k);
      byTail.set(tail, arr);
    }
  }

  for (const u of usernames) {
    const persis = byService.get(u);
    if (persis) {
      out.matched.push({ username: u, serviceNumber: u, how: "EXACT", nameCorroborated: true });
      continue;
    }

    const kand = new Map<string, Kandidat>();
    for (const n of numbersIn(u)) {
      for (const k of byTail.get(n) ?? []) kand.set(k.serviceNumber, k);
    }
    const daftar = [...kand.values()];

    if (daftar.length === 0) {
      out.unmatched.push(u);
      continue;
    }
    if (daftar.length > 1) {
      // Lebih dari satu nomor layanan berakhiran angka yang sama. Nama bisa
      // menyaringnya menjadi satu — tetapi kalau tetap lebih dari satu,
      // tidak ada yang dipilih.
      const disaring = daftar.filter((k) => nameCorroborates(u, k.customerName));
      if (disaring.length !== 1) {
        out.ambiguous.push(u);
        continue;
      }
      out.matched.push({
        username: u, serviceNumber: disaring[0].serviceNumber, how: "SUFFIX", nameCorroborated: true,
      });
      continue;
    }

    const satu = daftar[0];
    const namaCocok = nameCorroborates(u, satu.customerName);
    if (requireName && !namaCocok) {
      // Nomornya cocok tetapi namanya tidak. Itu justru pola paling berbahaya:
      // dua pelanggan berbeda yang nomornya berdekatan. Dibiarkan yatim.
      out.ambiguous.push(u);
      continue;
    }
    out.matched.push({
      username: u, serviceNumber: satu.serviceNumber, how: "SUFFIX", nameCorroborated: namaCocok,
    });
  }
  return out;
}
