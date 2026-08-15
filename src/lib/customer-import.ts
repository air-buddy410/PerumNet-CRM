import { coordinateRejection } from "@/lib/recovery";

// ── Pembacaan pelanggan & langganan dari ekspor sistem tagihan ───
//
// Lapisan MURNI: tabel teks masuk, baris tervalidasi keluar. Tidak menyentuh
// basis data, jadi seluruh aturannya bisa diuji tanpa koneksi apa pun dan
// bisa dijalankan untuk PRATINJAU sebelum satu baris pun tersimpan.
//
// Kolom dikenali dari NAMANYA lewat daftar alias, bukan dari posisinya. Itu
// disengaja: sumber pertama adalah lembar "Data Billing Baru", tetapi basis
// pelanggan yang sebenarnya ada di Wifinetbill dan akan datang dengan judul
// kolom yang berbeda. Dengan alias, ekspor baru cukup ditambahkan namanya di
// satu tempat — parser, validasi, dan tesnya tidak perlu ditulis ulang.
//
// KOLOM PASSWORD TIDAK PERNAH DIBACA. Bukan dibaca lalu dibuang — memang
// tidak punya alias, tidak punya bidang, dan tidak bisa muncul di keluaran.
// Kredensial PPPoE datang dari MikroTik, dan satu-satunya cara memastikan
// sebuah spreadsheet tidak membocorkannya adalah tidak menyediakan jalannya.

export interface RowIssue {
  rowNumber: number;
  /** Judul kolom seperti yang tertulis di berkas — orang mencarinya di sana. */
  column: string;
  message: string;
}

/** Satu pelanggan yang lolos seluruh pemeriksaan. */
export interface CustomerRow {
  rowNumber: number;
  /** Customer ID dari sistem sumber; jadi nomor layanan langganan. */
  cid: string;
  name: string;
  identityNumber: string | null;
  /** Diambil dari NIK bila kolomnya cocok; lihat birthDateFromNik(). */
  birthDate: Date | null;
  phone: string;
  email: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  /** Nama paket apa adanya; dicocokkan ke tabel Package saat penerapan. */
  packageRef: string;
  /** Nama sales apa adanya; dicocokkan ke tabel User saat penerapan. */
  salesRef: string | null;
  /** Kode ODP apa adanya setelah diseragamkan; dicocokkan saat penerapan. */
  odpRef: string | null;
  /** Username PPPoE. Password TIDAK pernah ikut. */
  pppoeUsername: string | null;
  billingStartAt: Date | null;
  notes: string[];
}

export interface ParsedCustomers {
  rows: CustomerRow[];
  issues: RowIssue[];
  /** Baris kosong yang dilewati. */
  skipped: number;
}

// ── Pengenalan kolom ────────────────────────────────────────────

function normalizeHeader(s: string): string {
  return s.replace(/\*/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Alias per bidang. Tambahkan judul dari ekspor baru DI SINI, bukan di
 * tempat lain — itulah gunanya daftar ini ada.
 *
 * Perhatikan yang TIDAK ada: password, dalam bentuk apa pun.
 */
const ALIAS: Record<keyof typeof FIELD_LABEL, readonly string[]> = {
  cid: ["customer id (cid)", "cid", "customer id", "id pelanggan", "no pelanggan"],
  name: ["nama", "nama pelanggan", "customer name", "nama kapital"],
  identityNumber: ["id card no ktp", "no ktp", "ktp", "nik"],
  phone: ["phone no", "no hp", "whatsapp", "telepon", "phone", "no telepon"],
  birthDate: ["date of birth", "tanggal lahir", "dob"],
  email: ["email", "e-mail", "alamat email"],
  address: ["customer address", "alamat", "alamat pelanggan"],
  coordinate: ["kordinat client", "koordinat client", "koordinat", "kordinat"],
  packageRef: ["paket", "packet", "package", "paket internet"],
  salesRef: ["sales", "nama sales", "sales person"],
  odpRef: ["distribution point (odp)", "kode odp", "odp", "distribution point"],
  pppoeUsername: ["pppoe user", "pppoe username", "username pppoe", "pppoe cid"],
  billingStartAt: ["billing start tanggal pemasangan", "billing start", "tanggal pemasangan", "tanggal pasang"],
} as const;

/** Judul yang ditampilkan pada pesan masalah. */
const FIELD_LABEL = {
  cid: "Customer Id (CID)",
  name: "Nama",
  identityNumber: "ID Card No KTP",
  phone: "Phone No",
  birthDate: "Date of Birth",
  email: "Email",
  address: "Customer Address",
  coordinate: "Kordinat Client",
  packageRef: "Paket",
  salesRef: "Sales",
  odpRef: "Distribution Point (ODP)",
  pppoeUsername: "PPPOE User",
  billingStartAt: "Billing Start",
} as const;

type Field = keyof typeof FIELD_LABEL;

/** Bidang yang absennya membuat berkas tidak bisa dipakai sama sekali. */
const WAJIB: readonly Field[] = ["cid", "name", "packageRef"] as const;

// ── Penyeragaman nilai ──────────────────────────────────────────

/**
 * Membersihkan nomor telepon dari karakter tak terlihat.
 *
 * Sumbernya memuat U+00A0 (spasi tanpa pemutus), U+2011 (tanda hubung tanpa
 * pemutus), serta U+202A/U+202C (penanda arah teks) — semuanya tidak
 * kelihatan di layar tetapi membuat pencocokan nomor gagal diam-diam, dan
 * itu jenis kegagalan yang paling lama tidak ketahuan.
 */
export function normalizePhone(raw: string): string {
  const s = raw
    .replace(/[ ​-‏‪-‮⁦-⁩]/g, "")
    .replace(/[‐-―−]/g, "-")
    .replace(/[\s()-]/g, "")
    .trim();
  // Nol di depan yang hilang dikembalikan. Spreadsheet memperlakukan kolom
  // telepon sebagai ANGKA dan membuang nol pertamanya, jadi `081236023387`
  // tersimpan sebagai `81236023387`. Ini bukan tebakan: tidak ada nomor
  // seluler Indonesia yang sah diawali `8` tanpa `0` atau `+62` di depannya,
  // sehingga hanya ada satu bentuk yang mungkin dimaksud.
  if (/^8\d{8,12}$/.test(s)) return `0${s}`;
  return s;
}

export const PHONE_RE = /^(?:\+62|62|0)\d{7,13}$/;

/**
 * Tanggal lahir yang TERSIMPAN di dalam NIK.
 *
 * Susunannya PPRRSS DDMMYY NNNN. Enam digit tengah adalah tanggal lahir,
 * dengan HARI DITAMBAH 40 untuk perempuan — itu aturan Dukcapil, bukan
 * tebakan. Karena nomornya sendiri membawa tanggal lahir, kolom tanggal lahir
 * yang diketik terpisah bisa DIPERIKSA terhadapnya, dan pemeriksaan itulah
 * yang menemukan 19 dari 65 baris tidak sinkron pada ekspor pertama.
 *
 * @returns null bila nomornya bukan 16 digit atau tanggalnya mustahil.
 */
export function birthDateFromNik(nik: string, tahunIni = new Date().getFullYear()): Date | null {
  const s = nik.replace(/\D/g, "");
  if (s.length !== 16) return null;
  let hari = Number(s.slice(6, 8));
  const bulan = Number(s.slice(8, 10));
  const yy = Number(s.slice(10, 12));
  if (hari > 40) hari -= 40; // perempuan
  if (hari < 1 || hari > 31 || bulan < 1 || bulan > 12) return null;
  // Dua digit tahun tidak menyebut abadnya. Tahun yang melewati tahun ini
  // pasti abad lalu — tidak ada pelanggan yang lahir di masa depan.
  const abad = yy <= tahunIni % 100 ? 2000 : 1900;
  const d = new Date(Date.UTC(abad + yy, bulan - 1, hari));
  // Menolak tanggal yang bergeser sendiri (31 Februari menjadi 3 Maret).
  if (d.getUTCMonth() !== bulan - 1 || d.getUTCDate() !== hari) return null;
  return d;
}

export const NIK_RE = /^\d{16}$/;

/** Tanggal `DD/MM/YYYY` atau `YYYY-M-D`; nol di depan boleh tidak ada. */
export function parseLooseDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return utc(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return utc(Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
}

function utc(y: number, mo: number, d: number): Date | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

/** `-8.410412, 115.601331` menjadi sepasang angka. */
export function parseCoordinatePair(raw: string): { latitude: number; longitude: number } | null {
  const s = raw.trim();
  if (!s) return null;
  const m = /^(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)$/.exec(s);
  if (!m) return null;
  return { latitude: Number(m[1]), longitude: Number(m[2]) };
}

/**
 * Kode ODP diseragamkan huruf besar dan spasi tunggal — TIDAK lebih.
 *
 * Sumbernya memuat `BSS 011204`, `ABG1 05DC01`, `GKS 05120101`: panjang dan
 * susunannya berbeda-beda, dan tidak ada aturan yang bisa dipercaya untuk
 * menormalkannya lebih jauh. Yang mirip tapi tidak sama — `BSS 011204` dan
 * `BBS 011204` — sengaja dibiarkan berbeda; menggabungkannya berarti menaruh
 * pelanggan pada tiang yang salah.
 */
export function normalizeOdpCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, " ");
}

// ── Pembacaan ───────────────────────────────────────────────────

interface HeaderMap {
  index: Partial<Record<Field, number>>;
  /** Judul asli per bidang, untuk pesan masalah. */
  label: Partial<Record<Field, string>>;
}

function mapHeader(header: string[]): HeaderMap {
  const norm = header.map(normalizeHeader);
  const out: HeaderMap = { index: {}, label: {} };
  for (const field of Object.keys(ALIAS) as Field[]) {
    for (const alias of ALIAS[field]) {
      const i = norm.indexOf(alias);
      // Kolom yang sudah terpetakan tidak diambil alih bidang lain: "Nama"
      // dan "Nama Kapital" sama-sama cocok untuk `name`, dan yang pertama
      // yang menang — bukan yang terakhir.
      if (i >= 0 && !Object.values(out.index).includes(i)) {
        out.index[field] = i;
        out.label[field] = header[i].trim() || FIELD_LABEL[field];
        break;
      }
    }
  }
  return out;
}

function cell(row: string[], i: number | undefined): string {
  return i === undefined ? "" : (row[i] ?? "").trim();
}

/**
 * @param rows Tabel teks, baris pertama adalah judul.
 * @param tahunIni Disuntikkan agar tes tidak bergantung pada tanggal sistem.
 */
export function parseCustomerSheet(rows: string[][], tahunIni = new Date().getFullYear()): ParsedCustomers {
  const out: ParsedCustomers = { rows: [], issues: [], skipped: 0 };
  if (rows.length === 0) {
    out.issues.push({ rowNumber: 0, column: "-", message: "Berkas tidak memuat baris apa pun." });
    return out;
  }

  const head = mapHeader(rows[0]);
  const hilang = WAJIB.filter((f) => head.index[f] === undefined);
  if (hilang.length) {
    out.issues.push({
      rowNumber: 1,
      column: hilang.map((f) => FIELD_LABEL[f]).join(", "),
      message: `Kolom wajib tidak ditemukan: ${hilang.map((f) => FIELD_LABEL[f]).join(", ")}. Tambahkan judulnya di berkas, atau daftarkan aliasnya di src/lib/customer-import.ts.`,
    });
    return out;
  }

  const label = (f: Field) => head.label[f] ?? FIELD_LABEL[f];
  const seen = new Map<string, number>();

  for (let i = 1; i < rows.length; i++) {
    const rowNumber = i + 1;
    const r = rows[i];
    const cid = cell(r, head.index.cid);
    const name = cell(r, head.index.name);
    if (!cid && !name) {
      out.skipped++;
      continue;
    }

    const push = (f: Field, message: string) =>
      out.issues.push({ rowNumber, column: label(f), message });

    if (!cid) {
      push("cid", "Baris punya nama tetapi tidak punya CID.");
      continue;
    }
    const sudah = seen.get(cid.toUpperCase());
    if (sudah !== undefined) {
      push("cid", `CID ${cid} sudah dipakai di baris ${sudah}.`);
      continue;
    }
    if (!name) {
      push("name", `${cid} tanpa nama pelanggan.`);
      continue;
    }

    const notes: string[] = [];

    // ── NIK dan tanggal lahir ──
    const nikRaw = cell(r, head.index.identityNumber).replace(/\s/g, "");
    let identityNumber: string | null = null;
    let birthDate: Date | null = null;
    if (nikRaw) {
      if (!NIK_RE.test(nikRaw)) {
        push("identityNumber", `NIK "${nikRaw}" bukan 16 digit angka.`);
        continue;
      }
      identityNumber = nikRaw;
      birthDate = birthDateFromNik(nikRaw, tahunIni);
      if (!birthDate) notes.push("NIK tidak memuat tanggal lahir yang masuk akal.");
    }

    const dobRaw = cell(r, head.index.birthDate);
    if (dobRaw) {
      const diketik = parseLooseDate(dobRaw);
      if (!diketik) {
        push("birthDate", `Tanggal lahir "${dobRaw}" tidak terbaca (pakai DD/MM/YYYY atau YYYY-MM-DD).`);
        continue;
      }
      if (birthDate && diketik.getTime() !== birthDate.getTime()) {
        // NIK YANG MENANG, dan itu keputusan yang dicatat — bukan lemparan
        // koin. Nomornya diterbitkan Dukcapil dan tanggal lahirnya terkunci
        // di dalam struktur nomor itu sendiri; kolom di sebelahnya diketik
        // ulang oleh manusia dari formulir kertas. Ketika keduanya berselisih
        // pada 19 dari 65 baris, yang jauh lebih mungkin salah adalah yang
        // diketik ulang.
        //
        // Selisihnya TIDAK disembunyikan: catatannya membawa kedua nilai,
        // sehingga siapa pun yang meninjau bisa membalik keputusan ini
        // per-orang tanpa menggali NIK-nya sendiri.
        notes.push(
          `Tanggal lahir diambil dari NIK (${iso(birthDate)}); kolom berkas menulis ${iso(diketik)}. ` +
            `Periksa bila pelanggan ini penting.`
        );
      }
      if (!birthDate) birthDate = diketik;
    }

    // ── Telepon ──
    const phone = normalizePhone(cell(r, head.index.phone));
    if (!phone) {
      push("phone", `${cid} tanpa nomor telepon.`);
      continue;
    }
    if (!PHONE_RE.test(phone)) {
      push("phone", `Nomor "${phone}" bukan nomor Indonesia yang sah.`);
      continue;
    }

    // ── Koordinat ──
    const koordRaw = cell(r, head.index.coordinate);
    let latitude: number | null = null;
    let longitude: number | null = null;
    if (koordRaw) {
      const pair = parseCoordinatePair(koordRaw);
      if (!pair) {
        push("coordinate", `Koordinat "${koordRaw}" tidak terbaca (harap "lintang, bujur").`);
        continue;
      }
      const tolak = coordinateRejection(pair);
      if (tolak) {
        push("coordinate", tolak);
        continue;
      }
      latitude = pair.latitude;
      longitude = pair.longitude;
    } else {
      notes.push("Tanpa koordinat — tidak akan muncul di peta.");
    }

    // ── Paket, sales, ODP ──
    const packageRef = cell(r, head.index.packageRef);
    if (!packageRef) {
      push("packageRef", `${cid} tanpa paket.`);
      continue;
    }
    const salesRef = cell(r, head.index.salesRef) || null;
    if (!salesRef) notes.push("Tanpa sales — pemilik pelanggan akan kosong.");
    const odpRaw = cell(r, head.index.odpRef);
    const odpRef = odpRaw ? normalizeOdpCode(odpRaw) : null;
    if (!odpRef) notes.push("Tanpa kode ODP — port tidak akan tertaut.");

    // ── PPPoE & tanggal tagihan ──
    const pppoeUsername = cell(r, head.index.pppoeUsername) || null;
    const billRaw = cell(r, head.index.billingStartAt);
    let billingStartAt: Date | null = null;
    if (billRaw) {
      billingStartAt = parseLooseDate(billRaw);
      if (!billingStartAt) {
        push("billingStartAt", `Tanggal "${billRaw}" tidak terbaca.`);
        continue;
      }
    }

    const email = cell(r, head.index.email) || null;
    const address = cell(r, head.index.address);
    if (!address) notes.push("Tanpa alamat.");

    seen.set(cid.toUpperCase(), rowNumber);
    out.rows.push({
      rowNumber,
      cid,
      name,
      identityNumber,
      birthDate,
      phone,
      email,
      address,
      latitude,
      longitude,
      packageRef,
      salesRef,
      odpRef,
      pppoeUsername,
      billingStartAt,
      notes,
    });
  }

  out.issues.sort((a, b) => a.rowNumber - b.rowNumber);
  return out;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
