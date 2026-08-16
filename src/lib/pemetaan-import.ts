// ── Membaca keputusan tim atas pemetaan tertunda (Fase 75) ──────
//
// Lapisan MURNI: tabel teks masuk, keputusan keluar. Tidak menyentuh basis
// data, jadi seluruh aturannya bisa diuji tanpa satu pun baris sungguhan.
//
// Berkas yang dibaca di sini adalah berkas yang dikeluarkan
// `scripts/_ekspor-tertunda.ts`, sesudah diisi orang. Berarti ia sudah lewat
// Excel, lewat surel, mungkin lewat Google Sheets, dan mungkin lewat beberapa
// tangan. Yang harus diasumsikan: kolom berpindah, lembar berganti urutan,
// huruf besar-kecil berubah, dan sebagian orang menulis "benar" alih-alih
// "BENAR".
//
// Karena itu kolom dikenali dari NAMANYA lewat daftar alias, tidak pernah
// dari posisinya — sama seperti seluruh importir lain di aplikasi ini.
//
// Satu aturan yang berlaku di semua lembar: BARIS YANG TIDAK BISA DIPAHAMI
// DILAPORKAN, TIDAK DITEBAK. Keputusan yang salah menautkan sesi ke pelanggan
// yang keliru, dan kesalahan seperti itu menyamar sebagai pekerjaan selesai.

export interface Masalah {
  /** Nama lembar, apa adanya dari berkasnya. */
  lembar: string;
  /** Nomor baris di dalam lembar, 1 = judul. */
  baris: number;
  pesan: string;
}

/** Sesi PPPoE yang diputuskan menjadi milik sebuah langganan. */
export interface KeputusanTaut {
  username: string;
  serviceNumber: string;
  catatan: string | null;
}

/** Username yang diputuskan memang sudah tidak dipakai. */
export interface KeputusanAbaikan {
  username: string;
  catatan: string | null;
}

/** Pelanggan yang diberi port ODP oleh tim lapangan. */
export interface KeputusanPort {
  serviceNumber: string;
  odpCode: string;
  portNumber: number;
  catatan: string | null;
}

/** ODP yang kapasitas sebenarnya berbeda dari catatan. */
export interface KeputusanKapasitas {
  odpCode: string;
  kapasitas: number;
  catatan: string | null;
}

export interface HasilBaca {
  taut: KeputusanTaut[];
  abaikan: KeputusanAbaikan[];
  port: KeputusanPort[];
  kapasitas: KeputusanKapasitas[];
  masalah: Masalah[];
  /** Baris yang sengaja dikosongkan tim. Bukan masalah — itu jawaban "ragu". */
  dilewati: number;
}

// ── Pengenalan kolom ────────────────────────────────────────────

/**
 * Nama kolom diseragamkan sebelum dibandingkan.
 *
 * Excel menyisipkan spasi tak-terputus saat menyalin, dan orang menulis
 * "KEPUTUSAN:Kode ODP" tanpa spasi sesering dengan spasi.
 */
function normalKolom(s: string): string {
  return s
    .replace(/\u00A0/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Indeks kolom pertama yang namanya cocok salah satu alias. */
function cariKolom(judul: string[], alias: string[]): number {
  const n = judul.map(normalKolom);
  for (const a of alias) {
    const cari = normalKolom(a);
    const at = n.indexOf(cari);
    if (at >= 0) return at;
  }
  // Kecocokan awalan menyusul, supaya "KEPUTUSAN (isi: BENAR / SALAH ...)"
  // tetap dikenali sebagai kolom keputusan tanpa harus menyalin seluruh
  // kalimat petunjuknya ke daftar alias.
  for (const a of alias) {
    const cari = normalKolom(a);
    const at = n.findIndex((x) => x.startsWith(cari));
    if (at >= 0) return at;
  }
  return -1;
}

// Alias yang paling KHUSUS ditulis lebih dulu, dan alias sepotong-sepotong
// ("port", "kapasitas", "odp") sengaja TIDAK ada. Lembar-lembar ini memuat
// kolom keterangan yang namanya mirip kolom keputusan — "Port terpakai" di
// sebelah "KEPUTUSAN: Nomor Port", dan "Kapasitas tercatat" di sebelah
// "KEPUTUSAN: Kapasitas sebenarnya". Alias yang longgar akan membaca kolom
// keterangan itu sebagai jawaban, lalu menyimpan kembali angka yang sudah ada
// seolah tim baru saja memutuskannya. Tidak ada galat, tidak ada yang berubah,
// dan seluruh pekerjaan lapangan hilang tanpa jejak.
const ALIAS = {
  username: ["username pppoe", "username", "user pppoe", "pppoe"],
  kandidat: ["kandidat nomor layanan", "nomor layanan kandidat", "kandidat"],
  keputusan: ["keputusan"],
  catatan: ["catatan", "keterangan", "note"],
  serviceNumber: ["nomor layanan", "no layanan", "service number", "cid"],
  odpCode: ["keputusan kode odp", "kode odp"],
  portNumber: ["keputusan nomor port", "nomor port"],
  kapasitas: ["keputusan kapasitas sebenarnya", "keputusan kapasitas", "kapasitas sebenarnya"],
} as const;

// ── Pembacaan nilai ─────────────────────────────────────────────

function sel(baris: string[], at: number): string {
  if (at < 0 || at >= baris.length) return "";
  return (baris[at] ?? "").replace(/\u00A0/g, " ").trim();
}

/**
 * Nomor layanan: HANYA spasi yang dibuang.
 *
 * Huruf besar-kecil sengaja DIPERTAHANKAN. Sistem penagihan menyimpan
 * `Free102gor` dan `FreekadesTgl` apa adanya, dan menyeragamkannya menjadi
 * huruf besar membuat pencarian meleset pada nomor yang sebenarnya ada.
 * Perbandingan yang mengabaikan besar-kecil dilakukan saat MENCOCOKKAN, bukan
 * dengan merusak nilainya lebih dulu.
 *
 * Angkanya tidak pernah disentuh — `PN102042532` tidak boleh diam-diam
 * menjadi `PN10204253`.
 */
export function rapikanNomor(s: string): string {
  return s.replace(/\s+/g, "");
}

/** Kunci pembanding yang mengabaikan besar-kecil. Untuk pencocokan saja. */
export function kunciNomor(s: string): string {
  return rapikanNomor(s).toUpperCase();
}

/** Kode ODP: spasi dalam dipertahankan, sebab `SRY 020105S1` memang berbeda dari `SRY020105S1`. */
export function rapikanOdp(s: string): string {
  return s.replace(/\s+/g, " ").trim().toUpperCase();
}

const YA = new Set(["benar", "ya", "y", "yes", "betul", "cocok", "true", "1", "v", "ok"]);
const TIDAK = new Set(["salah", "tidak", "t", "n", "no", "bukan", "false", "0", "x"]);
const TIDAK_DIPAKAI = new Set([
  "tidak dipakai", "tdk dipakai", "tidak terpakai", "tidak digunakan",
  "hapus", "buang", "mati", "nonaktif", "unused",
]);

/**
 * Membaca jawaban ya/tidak.
 *
 * `null` berarti TIDAK BISA DIBACA, dan itu berbeda dari "tidak". Yang tidak
 * terbaca dilaporkan; yang "tidak" diterima sebagai jawaban.
 */
export function bacaYaTidak(s: string): boolean | null {
  const v = normalKolom(s);
  if (!v) return null;
  if (YA.has(v)) return true;
  if (TIDAK.has(v)) return false;
  return null;
}

/** Nilai ini menyatakan "username ini memang sudah tidak dipakai"? */
export function adalahTidakDipakai(s: string): boolean {
  return TIDAK_DIPAKAI.has(normalKolom(s));
}

/**
 * Nomor port dari teks.
 *
 * Menolak apa pun yang bukan bilangan bulat positif. "port 5" diterima —
 * orang memang menulis begitu — tetapi "5-6" ditolak, sebab satu langganan
 * hanya boleh menempati satu port dan menebak yang mana justru berbahaya.
 */
export function bacaPort(s: string): number | null {
  const v = s.trim();
  if (!v) return null;
  const m = /^(?:port\s*)?(\d{1,3})$/i.exec(v);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 ? n : null;
}

/**
 * Kapasitas splitter.
 *
 * Hanya 8 dan 16 yang diterima, dan itu keputusan lapangan yang ditegaskan
 * pemilik jaringan: splitter yang dipakai hanya 1:8 dan 1:16. Angka lain
 * berarti orangnya salah baca, bukan berarti ada splitter jenis baru.
 */
export function bacaKapasitas(s: string): number | null {
  const m = /(\d{1,3})/.exec(s.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n === 8 || n === 16 ? n : null;
}

// ── Pembacaan tiap lembar ───────────────────────────────────────

function isiCatatan(baris: string[], at: number): string | null {
  const v = sel(baris, at);
  return v || null;
}

/** Lembar mana ini? Dikenali dari JUDUL KOLOMNYA, bukan dari nama tabnya. */
export function kenaliLembar(judul: string[]): "ambigu" | "tanpa-kandidat" | "port" | "kapasitas" | null {
  const ada = (a: readonly string[]) => cariKolom(judul, a as string[]) >= 0;
  // Urutannya dari yang paling khusus ke yang paling umum, dan itu bukan
  // selera. Lembar port memuat "Username PPPoE" sebagai keterangan, sehingga
  // pemeriksaan "punya username dan punya keputusan" akan mengakuinya sebagai
  // lembar tanpa-kandidat — lalu membaca kode ODP sebagai nomor layanan.
  if (ada(ALIAS.odpCode) && ada(ALIAS.portNumber)) return "port";
  if (ada(ALIAS.odpCode) && ada(ALIAS.kapasitas)) return "kapasitas";
  if (ada(ALIAS.username) && ada(ALIAS.kandidat)) return "ambigu";
  if (ada(ALIAS.username) && ada(ALIAS.keputusan)) return "tanpa-kandidat";
  return null;
}

/**
 * Membaca satu buku kerja yang sudah diisi.
 *
 * Nama tab TIDAK dipakai untuk mengenali lembar — orang mengganti nama tab,
 * menyalin lembar ke berkas baru, dan mengurutkannya ulang. Yang dipakai
 * judul kolomnya, sebab itulah yang tidak berubah selama isinya masih sama.
 */
export function bacaKeputusan(lembar: { nama: string; baris: string[][] }[]): HasilBaca {
  const out: HasilBaca = { taut: [], abaikan: [], port: [], kapasitas: [], masalah: [], dilewati: 0 };

  for (const l of lembar) {
    if (l.baris.length < 2) continue;
    const judul = l.baris[0];
    const jenis = kenaliLembar(judul);
    if (!jenis) continue; // lembar petunjuk dan lembar tambahan tim dilewati

    const iCatatan = cariKolom(judul, [...ALIAS.catatan]);

    if (jenis === "ambigu") {
      const iUser = cariKolom(judul, [...ALIAS.username]);
      const iKand = cariKolom(judul, [...ALIAS.kandidat]);
      const iKep = cariKolom(judul, [...ALIAS.keputusan]);
      if (iKep < 0) {
        out.masalah.push({ lembar: l.nama, baris: 1, pesan: "Kolom KEPUTUSAN tidak ditemukan." });
        continue;
      }
      // Satu username boleh punya beberapa baris kandidat. Yang ditandai
      // benar dikumpulkan dulu, baru diperiksa bersama — dua "BENAR" pada
      // username yang sama adalah kontradiksi, bukan dua keputusan.
      const benarPer = new Map<string, { serviceNumber: string; baris: number; catatan: string | null }[]>();
      for (let r = 1; r < l.baris.length; r++) {
        const b = l.baris[r];
        const username = sel(b, iUser);
        if (!username) continue;
        const jawab = sel(b, iKep);
        if (!jawab) { out.dilewati++; continue; }
        const ya = bacaYaTidak(jawab);
        if (ya === null) {
          out.masalah.push({
            lembar: l.nama, baris: r + 1,
            pesan: `Keputusan "${jawab}" tidak dikenali untuk ${username}. Tulis BENAR atau SALAH.`,
          });
          continue;
        }
        if (!ya) continue; // "SALAH" adalah jawaban sah: bukan kandidat ini.
        const nomor = rapikanNomor(sel(b, iKand));
        if (!nomor) {
          out.masalah.push({
            lembar: l.nama, baris: r + 1,
            pesan: `${username} ditandai BENAR tetapi barisnya tidak memuat nomor layanan kandidat.`,
          });
          continue;
        }
        benarPer.set(username, [
          ...(benarPer.get(username) ?? []),
          { serviceNumber: nomor, baris: r + 1, catatan: isiCatatan(b, iCatatan) },
        ]);
      }
      for (const [username, dipilih] of benarPer) {
        if (dipilih.length > 1) {
          out.masalah.push({
            lembar: l.nama, baris: dipilih[0].baris,
            pesan:
              `${username} ditandai BENAR pada ${dipilih.length} kandidat ` +
              `(${dipilih.map((d) => d.serviceNumber).join(", ")}). Satu sesi hanya boleh milik satu langganan.`,
          });
          continue;
        }
        out.taut.push({ username, serviceNumber: dipilih[0].serviceNumber, catatan: dipilih[0].catatan });
      }
      continue;
    }

    if (jenis === "tanpa-kandidat") {
      const iUser = cariKolom(judul, [...ALIAS.username]);
      const iKep = cariKolom(judul, [...ALIAS.keputusan]);
      for (let r = 1; r < l.baris.length; r++) {
        const b = l.baris[r];
        const username = sel(b, iUser);
        if (!username) continue;
        const jawab = sel(b, iKep);
        if (!jawab) { out.dilewati++; continue; }
        if (adalahTidakDipakai(jawab)) {
          out.abaikan.push({ username, catatan: isiCatatan(b, iCatatan) });
          continue;
        }
        const nomor = rapikanNomor(jawab);
        // Yang ditolak di sini hanya yang JELAS bukan nomor: kalimat bebas.
        //
        // Sempat lebih ketat dari ini — `^[A-Z]+\d+$`, ditulis dari pola
        // `PN102042532` saja — dan aturan itu menolak 23 nomor yang sah.
        // Akun gratis bernomor `Free102gor`, `Free102kadesBkt`, bahkan
        // `FreekadesTgl` yang tidak memuat satu angka pun. Bentuk nomor
        // layanan adalah keputusan bagian penagihan, bukan sesuatu yang boleh
        // ditebak dari contoh yang kebetulan terlihat.
        //
        // Yang memutuskan sah atau tidak adalah ADA-TIDAKNYA di basis data,
        // dan itu diperiksa di lapisan berikutnya — lengkap dengan pesan yang
        // menyebut nomornya. Di sini cukup menyingkirkan yang tidak mungkin
        // menjadi nomor: yang memuat spasi, atau yang terlalu panjang.
        // Yang menandai kalimat bebas adalah JUMLAH KATANYA. Nomor yang
        // terketik dengan spasi nyasar ("PN 104022613") masih dua potong dan
        // pantas diterima; "nanti dicek dulu" tiga potong dan jelas bukan
        // nomor. Ambang ini longgar dengan sengaja — yang benar-benar
        // memutuskan tetap ada-tidaknya nomor itu di basis data.
        const potong = jawab.trim().split(/\s+/).length;
        if (!nomor || potong > 2 || nomor.length > 32) {
          out.masalah.push({
            lembar: l.nama, baris: r + 1,
            pesan: `Keputusan "${jawab}" untuk ${username} bukan nomor layanan dan bukan TIDAK DIPAKAI.`,
          });
          continue;
        }
        out.taut.push({ username, serviceNumber: nomor, catatan: isiCatatan(b, iCatatan) });
      }
      continue;
    }

    if (jenis === "port") {
      const iNomor = cariKolom(judul, [...ALIAS.serviceNumber]);
      const iOdp = cariKolom(judul, [...ALIAS.odpCode]);
      const iPort = cariKolom(judul, [...ALIAS.portNumber]);
      for (let r = 1; r < l.baris.length; r++) {
        const b = l.baris[r];
        const nomor = rapikanNomor(sel(b, iNomor));
        if (!nomor) continue;
        const odp = rapikanOdp(sel(b, iOdp));
        const portTeks = sel(b, iPort);
        if (!odp && !portTeks) { out.dilewati++; continue; }
        if (!odp) {
          out.masalah.push({ lembar: l.nama, baris: r + 1, pesan: `${nomor} diberi nomor port tetapi kode ODP-nya kosong.` });
          continue;
        }
        const port = bacaPort(portTeks);
        if (port === null) {
          out.masalah.push({
            lembar: l.nama, baris: r + 1,
            pesan: portTeks
              ? `Nomor port "${portTeks}" untuk ${nomor} tidak bisa dibaca sebagai satu angka.`
              : `${nomor} diberi ODP ${odp} tetapi nomor portnya kosong.`,
          });
          continue;
        }
        out.port.push({ serviceNumber: nomor, odpCode: odp, portNumber: port, catatan: isiCatatan(b, iCatatan) });
      }
      continue;
    }

    // jenis === "kapasitas"
    const iOdp = cariKolom(judul, [...ALIAS.odpCode]);
    const iKap = cariKolom(judul, [...ALIAS.kapasitas]);
    for (let r = 1; r < l.baris.length; r++) {
      const b = l.baris[r];
      const odp = rapikanOdp(sel(b, iOdp));
      if (!odp) continue;
      const teks = sel(b, iKap);
      if (!teks) { out.dilewati++; continue; }
      const kap = bacaKapasitas(teks);
      if (kap === null) {
        out.masalah.push({
          lembar: l.nama, baris: r + 1,
          pesan: `Kapasitas "${teks}" untuk ${odp} bukan 8 maupun 16. Splitter yang dipakai hanya 1:8 dan 1:16.`,
        });
        continue;
      }
      out.kapasitas.push({ odpCode: odp, kapasitas: kap, catatan: isiCatatan(b, iCatatan) });
    }
  }

  // Satu username tidak boleh muncul sebagai keputusan di dua lembar sekaligus.
  const perUser = new Map<string, number>();
  for (const t of out.taut) perUser.set(t.username, (perUser.get(t.username) ?? 0) + 1);
  for (const a of out.abaikan) perUser.set(a.username, (perUser.get(a.username) ?? 0) + 1);
  for (const [username, n] of perUser) {
    if (n > 1) {
      out.masalah.push({ lembar: "(seluruh berkas)", baris: 0, pesan: `${username} punya ${n} keputusan yang berbeda.` });
    }
  }
  const bentrok = new Set([...perUser].filter(([, n]) => n > 1).map(([u]) => u));
  if (bentrok.size) {
    out.taut = out.taut.filter((t) => !bentrok.has(t.username));
    out.abaikan = out.abaikan.filter((a) => !bentrok.has(a.username));
  }

  return out;
}
