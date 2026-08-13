import { parseCellDate, XlsxError } from "@/lib/xlsx-read";
import { contractRejection } from "@/lib/employment";
import { EMPLOYEE_TYPES, WORK_PATTERNS, JOB_LEVELS, EDUCATION_LEVELS, BLOOD_TYPES } from "@/lib/constants";

// ── Pembacaan tabel pegawai dari template HRD (Fase 51) ─────────
//
// Lapisan ini MURNI: tabel teks masuk, baris tervalidasi keluar. Tidak
// menyentuh basis data sama sekali, jadi seluruh aturannya bisa diuji tanpa
// koneksi apa pun — dan yang lebih penting, bisa dijalankan untuk PRATINJAU
// sebelum satu baris pun tersimpan.
//
// Sikap yang dipegang di sepanjang berkas ini: lebih baik menolak satu baris
// dengan alamat sel yang jelas daripada menebaknya. Impor yang gagal terang-
// terangan bisa diperbaiki dalam lima detik; impor yang menebak melahirkan
// data salah yang baru ketahuan berbulan-bulan kemudian, saat sudah menempel
// di absensi, kontrak, dan kartu pegawai.

/** Judul kolom pada template, dipetakan ke bidang Employee. */
interface ColumnDef {
  key: keyof RawRow;
  label: string;
  /** Kolom yang absennya membuat berkas tidak bisa dipakai sama sekali. */
  required?: boolean;
}

const COLUMNS: readonly ColumnDef[] = [
  { key: "employeeNo", label: "NIK" },
  { key: "fullName", label: "Nama Lengkap", required: true },
  { key: "jobTitle", label: "Jabatan" },
  { key: "jobLevel", label: "Jenjang Jabatan", required: true },
  { key: "employeeType", label: "Status Kepegawaian", required: true },
  { key: "workPattern", label: "Pola Kerja", required: true },
  { key: "joinedAt", label: "Tanggal Bergabung", required: true },
  { key: "contractStartAt", label: "Kontrak Mulai" },
  { key: "contractEndAt", label: "Kontrak Berakhir" },
  { key: "address", label: "Alamat" },
  { key: "supervisorNo", label: "NIK Atasan" },
  { key: "accountEmail", label: "Email Akun CRM" },
  { key: "isActive", label: "Aktif", required: true },
  // Kolomnya TIDAK wajib ada — berkas yang HRD sudah mulai isi sebelum kolom
  // ini ditambahkan tetap bisa diimpor. Tapi kalau kolomnya ADA, isinya wajib:
  // kolom kosong berarti seseorang terlewat, dan pegawai tanpa divisi tidak
  // bisa dibuatkan akun maupun dilabeli kotak emailnya.
  { key: "divisionRef", label: "Divisi" },
  // Fase 60 — data diri. Sama seperti Divisi, kolomnya boleh TIDAK ADA sama
  // sekali. Bedanya: kalau kolomnya ada, selnya BOLEH kosong. Empatnya bukan
  // syarat untuk apa pun — orang tetap bisa dibuatkan akun, kartu, dan kontrak
  // tanpanya. Memaksa mengisinya hanya akan membuat HRD menebak, dan golongan
  // darah yang ditebak lebih berbahaya daripada yang kosong.
  { key: "birthPlace", label: "Tempat Lahir" },
  { key: "birthDate", label: "Tanggal Lahir" },
  { key: "education", label: "Pendidikan Terakhir" },
  { key: "bloodType", label: "Golongan Darah" },
] as const;

type RawRow = Record<
  | "employeeNo"
  | "fullName"
  | "jobTitle"
  | "jobLevel"
  | "employeeType"
  | "workPattern"
  | "joinedAt"
  | "contractStartAt"
  | "contractEndAt"
  | "address"
  | "supervisorNo"
  | "accountEmail"
  | "isActive"
  | "divisionRef"
  | "birthPlace"
  | "birthDate"
  | "education"
  | "bloodType",
  string
>;

/** Satu baris yang lolos seluruh pemeriksaan dan siap disimpan. */
export interface ImportRow {
  /** Nomor baris seperti yang DILIHAT HRD di Excel, supaya bisa ditunjuk. */
  rowNumber: number;
  employeeNo: string;
  fullName: string;
  jobTitle: string | null;
  jobLevel: string;
  employeeType: string;
  workPattern: string;
  joinedAt: Date;
  contractStartAt: Date | null;
  contractEndAt: Date | null;
  address: string | null;
  /**
   * Isi kolom "NIK Atasan" apa adanya — bisa NIK, bisa nama.
   *
   * Pada impor PERTAMA belum ada seorang pun yang punya NIK, jadi kolom itu
   * mustahil diisi dengan NIK dan seluruh hierarki akan kosong. Karena itu
   * nama persis juga diterima. Nama yang muncul lebih dari sekali DITOLAK,
   * bukan diambil yang pertama.
   */
  supervisorRef: string | null;
  /** Baris atasan di berkas yang sama, bila ketemu. */
  supervisorRowNumber: number | null;
  accountEmail: string | null;
  isActive: boolean;
  /**
   * Nama divisi apa adanya dari berkas; dicocokkan ke tabel Division saat
   * penerapan, bukan di sini — daftarnya data, bukan konstanta kode.
   */
  divisionRef: string | null;
  /// Fase 60 — data diri. Semuanya boleh null; lihat COLUMNS di atas.
  birthPlace: string | null;
  birthDate: Date | null;
  /** Kode EDUCATION_LEVELS, bukan label yang diketik HRD. */
  education: string | null;
  /** Kode BLOOD_TYPES. "UNKNOWN" adalah jawaban yang sah, bukan kegagalan. */
  bloodType: string | null;
}

export interface RowIssue {
  rowNumber: number;
  /** Judul kolom, bukan nama bidang — HRD mencarinya di Excel. */
  column: string;
  message: string;
}

export interface ParsedSheet {
  rows: ImportRow[];
  issues: RowIssue[];
  /** Baris kosong yang dilewati — template menyediakan 200 baris kosong. */
  skipped: number;
}

// ── Penyeragaman nilai ──────────────────────────────────────────

function normalizeHeader(s: string): string {
  return s.replace(/\*/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function loose(s: string): string {
  return s.toLowerCase().replace(/[\s_-]+/g, "");
}

/**
 * Menerima label maupun kode.
 *
 * HRD memilih dari dropdown ("Kontrak"), tetapi berkas hasil ekspor sistem
 * lain bisa berisi kodenya ("CONTRACT"). Keduanya jelas maksudnya, jadi
 * keduanya diterima. Yang di luar itu ditolak, bukan dianggap nilai baku —
 * salah ketik "Kontark" yang diam-diam menjadi Karyawan Tetap akan mematikan
 * seluruh pengingat masa kontraknya.
 */
/**
 * Kata yang dipakai HRD di lapangan, dipetakan ke kode yang sama.
 *
 * Fase 52 — berkas HRD yang pertama menulis "Jadwal Kantor" dan "Jam Shift"
 * untuk seluruh 23 barisnya. Maknanya tidak ambigu sedikit pun, dan menyuruh
 * mereka memperbaiki dua puluh tiga baris demi perbedaan kata adalah cara
 * paling cepat membuat orang berhenti memakai sistemnya.
 *
 * Yang boleh masuk daftar ini HANYA padanan yang maknanya tunggal. Begitu
 * sebuah kata bisa berarti dua hal, ia harus ditolak dan ditanyakan — bukan
 * dimasukkan ke sini.
 */
const ALIASES: Record<string, string> = {
  jadwalkantor: "NON_SHIFT",
  jamkantor: "NON_SHIFT",
  jamshift: "SHIFT",
  jadwalshift: "SHIFT",
};

function codeFromLabel(pairs: readonly (readonly [string, string])[], raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  for (const [code, label] of pairs) {
    if (loose(code) === loose(s) || loose(label) === loose(s)) return code;
  }
  // Padanan hanya berlaku bila kodenya memang ada di daftar yang diminta —
  // supaya alias pola kerja tidak bisa nyasar menjadi jawaban kolom lain.
  const alias = ALIASES[loose(s)];
  if (alias && pairs.some(([code]) => code === alias)) return alias;
  return null;
}

function labelsOf(pairs: readonly (readonly [string, string])[]): string {
  return pairs.map(([, label]) => label).join(", ");
}

const TRUE_WORDS = ["ya", "yes", "true", "aktif", "y", "1"];
const FALSE_WORDS = ["tidak", "no", "false", "nonaktif", "tidakaktif", "n", "0"];

function parseBoolean(raw: string): boolean | null {
  const s = loose(raw.trim());
  if (TRUE_WORDS.includes(s)) return true;
  if (FALSE_WORDS.includes(s)) return false;
  return null;
}

// ── Golongan darah ──────────────────────────────────────────────
//
// Punya penerjemah SENDIRI, tidak lewat codeFromLabel(), dan itu bukan
// duplikasi yang terlewat.
//
// codeFromLabel() membandingkan lewat loose(), yang MEMBUANG tanda hubung
// supaya "Non-Shift" cocok dengan "NON_SHIFT". Untuk golongan darah, tandanya
// justru bagian paling penting dari jawabannya: kalau tanda dibuang, "A" dan
// "A−" menjadi teks yang sama persis, dan seseorang yang menulis "A" akan
// diam-diam tercatat A-negatif. Golongan darah yang salah dipakai justru pada
// saat tidak ada waktu memeriksanya ulang.
//
// Karena itu di sini tandanya WAJIB. Golongan tanpa tanda ditolak dan
// ditanyakan, bukan ditebak.

/** Semua bentuk garis yang mungkin muncul: strip biasa, minus, en dash, em dash. */
const DASHES = /[-‐‑‒–—−]/g;
const UNKNOWN_WORDS = ["UNKNOWN", "TIDAKDIKETAHUI", "TIDAKTAHU", "BELUMTAHU", "?"];

/**
 * Menerima "A+", "A-", "A −", "O negatif", "AB_POS", maupun kodenya sendiri.
 *
 * Mengembalikan null bila tidak dikenal, dan string kosong TIDAK dianggap
 * kesalahan — kolom ini memang boleh kosong.
 */
export function bloodTypeFromLabel(raw: string): string | null {
  let s = raw.trim().toUpperCase().replace(DASHES, "-");
  s = s.replace(/[\s_]+/g, "");
  if (!s) return null;
  if (UNKNOWN_WORDS.includes(s)) return "UNKNOWN";

  // Kata di UJUNG diterjemahkan jadi tanda, supaya "O negatif" dan "O-" sama.
  s = s.replace(/(POSITIF|POSITIVE|POS|PLUS)$/, "+").replace(/(NEGATIF|NEGATIVE|NEG|MINUS|MIN)$/, "-");

  const m = /^(AB|A|B|O)([+-])$/.exec(s);
  if (!m) return null;
  return `${m[1]}_${m[2] === "+" ? "POS" : "NEG"}`;
}

/** Apakah isian ini golongan yang benar tapi TANPA tanda? Dipakai untuk pesan yang menolong. */
function bloodMissingSign(raw: string): boolean {
  const s = raw.trim().toUpperCase().replace(/[\s_]+/g, "");
  return ["A", "B", "AB", "O"].includes(s);
}

/**
 * Bentuk NIK yang disepakati, sama persis dengan saveEmployee().
 *
 * Diekspor karena penaut atasan harus memakai penyeragaman yang IDENTIK saat
 * mencocokkan "NIK Atasan" dengan isi basis data. Dua penyeragaman yang
 * sedikit berbeda berarti atasan yang ada tidak ketemu, dan hierarkinya diam-
 * diam kosong.
 */
export function normalizeEmployeeNo(raw: string): string {
  return raw.trim().toUpperCase();
}

export const EMPLOYEE_NO_RE = /^[A-Z0-9-]{2,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Baris contoh yang ikut terkirim bila HRD lupa menghapusnya. */
const SAMPLE_NAME = "teguh santoso";
const SAMPLE_EMAIL = "teguh@perumnet.id";

// ── Penemuan baris judul ────────────────────────────────────────

const HEADER_SEARCH_ROWS = 20;

interface HeaderMap {
  rowIndex: number;
  columns: Map<keyof RawRow, number>;
}

/**
 * Mencari baris judul, alih-alih menganggapnya selalu baris ketiga.
 *
 * Kolom dipetakan berdasarkan JUDULNYA, bukan urutannya. Menyisipkan satu
 * kolom catatan di tengah adalah hal paling wajar yang dilakukan orang pada
 * sebuah spreadsheet, dan pembaca yang mengandalkan urutan akan menyimpan
 * seluruh sisa kolom pada bidang yang salah tanpa satu pun galat.
 */
function findHeader(rows: string[][]): HeaderMap {
  const limit = Math.min(rows.length, HEADER_SEARCH_ROWS);
  for (let i = 0; i < limit; i++) {
    const cells = rows[i].map(normalizeHeader);
    if (!cells.includes("nama lengkap")) continue;

    const columns = new Map<keyof RawRow, number>();
    for (const def of COLUMNS) {
      // Kecocokan PERSIS. "Jabatan" dan "Jenjang Jabatan" adalah dua kolom
      // berbeda; pencocokan longgar akan menukar keduanya.
      const at = cells.indexOf(normalizeHeader(def.label));
      if (at >= 0) columns.set(def.key, at);
    }
    const missing = COLUMNS.filter((c) => c.required && !columns.has(c.key)).map((c) => c.label);
    if (missing.length) {
      throw new XlsxError(
        `Berkas tidak memuat kolom wajib: ${missing.join(", ")}. Pakai template resmi dari HRD.`
      );
    }
    return { rowIndex: i, columns };
  }
  throw new XlsxError(
    'Baris judul tidak ditemukan — kolom "Nama Lengkap" tidak ada di 20 baris pertama. Pakai template resmi dari HRD.'
  );
}

// ── Pembacaan ───────────────────────────────────────────────────

export function parseEmployeeSheet(rows: string[][]): ParsedSheet {
  const header = findHeader(rows);
  const out: ImportRow[] = [];
  const issues: RowIssue[] = [];
  let skipped = 0;

  // Kepemilikan nilai yang harus unik SEBERKAS, bukan hanya terhadap basis
  // data: dua baris dengan NIK sama akan lolos pemeriksaan basis data satu per
  // satu, lalu yang kedua menimpa yang pertama.
  const seenNo = new Map<string, number>();
  const seenEmail = new Map<string, number>();

  for (let i = header.rowIndex + 1; i < rows.length; i++) {
    const rowNumber = i + 1;
    const raw = {} as RawRow;
    for (const def of COLUMNS) {
      const at = header.columns.get(def.key);
      raw[def.key] = at === undefined ? "" : (rows[i][at] ?? "").trim();
    }

    if (Object.values(raw).every((v) => v === "")) {
      skipped++;
      continue;
    }

    const problem = (column: string, message: string) => issues.push({ rowNumber, column, message });
    const before = issues.length;

    // Baris contoh bawaan template. Bukan kerewelan: kalau lolos, PerumNet
    // punya seorang "Teguh Santoso" berkontrak setahun yang tidak ada orangnya,
    // lengkap dengan pengingat kontrak dan kartu pegawai.
    if (
      raw.fullName.toLowerCase() === SAMPLE_NAME &&
      raw.accountEmail.toLowerCase() === SAMPLE_EMAIL
    ) {
      problem("Nama Lengkap", "Ini masih baris contoh bawaan template. Hapus atau ganti dengan data asli.");
      continue;
    }

    const fullName = raw.fullName;
    if (!fullName) problem("Nama Lengkap", "Wajib diisi.");

    let employeeNo = "";
    if (raw.employeeNo) {
      employeeNo = normalizeEmployeeNo(raw.employeeNo);
      if (!EMPLOYEE_NO_RE.test(employeeNo)) {
        problem("NIK", "Hanya huruf/angka/strip, 2–20 karakter.");
      } else {
        const first = seenNo.get(employeeNo);
        if (first) problem("NIK", `NIK ${employeeNo} sudah dipakai di baris ${first}.`);
        else seenNo.set(employeeNo, rowNumber);
      }
    }

    const jobLevel = codeFromLabel(JOB_LEVELS, raw.jobLevel);
    if (!jobLevel) {
      problem("Jenjang Jabatan", raw.jobLevel ? `"${raw.jobLevel}" tidak dikenal. Pilih: ${labelsOf(JOB_LEVELS)}.` : "Wajib diisi.");
    }

    const employeeType = codeFromLabel(EMPLOYEE_TYPES, raw.employeeType);
    if (!employeeType) {
      problem("Status Kepegawaian", raw.employeeType ? `"${raw.employeeType}" tidak dikenal. Pilih: ${labelsOf(EMPLOYEE_TYPES)}.` : "Wajib diisi.");
    }

    const workPattern = codeFromLabel(WORK_PATTERNS, raw.workPattern);
    if (!workPattern) {
      problem("Pola Kerja", raw.workPattern ? `"${raw.workPattern}" tidak dikenal. Pilih: ${labelsOf(WORK_PATTERNS)}.` : "Wajib diisi.");
    }

    const joinedAt = parseCellDate(raw.joinedAt);
    if (!joinedAt) {
      problem(
        "Tanggal Bergabung",
        raw.joinedAt ? `"${raw.joinedAt}" bukan tanggal yang jelas. Pakai format tanggal Excel atau tulis 2026-01-31.` : "Wajib diisi."
      );
    }

    // Kolom kontrak boleh kosong; yang TIDAK boleh adalah terisi tapi tak
    // terbaca — itu berarti masa kontrak hilang diam-diam.
    const contractStartAt = parseCellDate(raw.contractStartAt);
    if (raw.contractStartAt && !contractStartAt) {
      problem("Kontrak Mulai", `"${raw.contractStartAt}" bukan tanggal yang jelas. Tulis 2026-01-31.`);
    }
    const contractEndAt = parseCellDate(raw.contractEndAt);
    if (raw.contractEndAt && !contractEndAt) {
      problem("Kontrak Berakhir", `"${raw.contractEndAt}" bukan tanggal yang jelas. Tulis 2026-12-31.`);
    }

    // Aturan kontrak DIPINJAM dari employment.ts, tidak ditulis ulang. Kalau
    // impor punya salinan aturannya sendiri, suatu hari keduanya berbeda
    // pendapat dan hanya satu jalur yang diperbaiki.
    if (employeeType) {
      const contractError = contractRejection({
        employeeType,
        contractStartAt: contractStartAt ?? null,
        contractEndAt: contractEndAt ?? null,
      });
      if (contractError) problem("Status Kepegawaian", contractError);
    }

    const isActive = parseBoolean(raw.isActive);
    if (isActive === null) {
      // Sengaja TIDAK dianggap aktif saat kosong. Menganggap "aktif" pada sel
      // yang tak terbaca berarti menghidupkan orang yang sudah keluar.
      problem("Aktif", raw.isActive ? `"${raw.isActive}" tidak dikenal. Isi Ya atau Tidak.` : "Wajib diisi (Ya / Tidak).");
    }

    let accountEmail: string | null = null;
    if (raw.accountEmail) {
      accountEmail = raw.accountEmail.trim().toLowerCase();
      if (!EMAIL_RE.test(accountEmail)) {
        problem("Email Akun CRM", `"${raw.accountEmail}" bukan alamat email yang sah.`);
      } else {
        const first = seenEmail.get(accountEmail);
        if (first) problem("Email Akun CRM", `Email ini sudah dipakai di baris ${first}.`);
        else seenEmail.set(accountEmail, rowNumber);
      }
    }

    // Kolom Divisi boleh TIDAK ADA sama sekali (berkas lama), tapi kalau ada,
    // sel kosong berarti seseorang terlewat — dan pegawai tanpa divisi tidak
    // bisa dibuatkan akun maupun dilabeli kotak emailnya. Lebih baik ketahuan
    // sekarang daripada saat IT bingung kenapa satu orang tidak muncul.
    if (header.columns.has("divisionRef") && !raw.divisionRef) {
      problem("Divisi", "Wajib diisi. Pilih dari daftar di dropdown.");
    }

    // ── Data diri (Fase 60) ─────────────────────────────────────
    //
    // Semuanya boleh kosong. Yang TIDAK boleh adalah terisi tapi tak terbaca —
    // itu berarti data hilang diam-diam, dan yang paling terasa adalah tanggal
    // lahir: ucapan ulang tahun akan muncul di hari yang salah, atau tidak
    // muncul sama sekali, tanpa ada yang tahu kenapa.
    const birthDate = parseCellDate(raw.birthDate);
    if (raw.birthDate && !birthDate) {
      problem("Tanggal Lahir", `"${raw.birthDate}" bukan tanggal yang jelas. Tulis 1990-08-17.`);
    } else if (birthDate) {
      // Dua pemeriksaan yang menangkap salah ketik tahun — bentuk salah ketik
      // paling sering pada tanggal, dan yang paling tidak terlihat.
      if (birthDate.getTime() > Date.now()) {
        problem("Tanggal Lahir", "Tanggal lahir ada di masa depan. Periksa tahunnya.");
      } else if (birthDate.getUTCFullYear() < 1930) {
        problem("Tanggal Lahir", `Tahun ${birthDate.getUTCFullYear()} tidak masuk akal. Periksa tahunnya.`);
      } else if (joinedAt && birthDate.getTime() >= joinedAt.getTime()) {
        problem("Tanggal Lahir", "Tanggal lahir tidak boleh sama atau setelah Tanggal Bergabung.");
      }
    }

    let education: string | null = null;
    if (raw.education) {
      education = codeFromLabel(EDUCATION_LEVELS, raw.education);
      if (!education) {
        problem("Pendidikan Terakhir", `"${raw.education}" tidak dikenal. Pilih: ${labelsOf(EDUCATION_LEVELS)}.`);
      }
    }

    let bloodType: string | null = null;
    if (raw.bloodType) {
      bloodType = bloodTypeFromLabel(raw.bloodType);
      if (!bloodType) {
        problem(
          "Golongan Darah",
          bloodMissingSign(raw.bloodType)
            ? `"${raw.bloodType}" belum menyebut tandanya. Tulis ${raw.bloodType.trim().toUpperCase()}+ atau ${raw.bloodType.trim().toUpperCase()}−, atau pilih "Tidak diketahui".`
            : `"${raw.bloodType}" tidak dikenal. Pilih: ${labelsOf(BLOOD_TYPES)}.`
        );
      }
    }

    if (issues.length > before) continue;

    out.push({
      rowNumber,
      employeeNo,
      fullName,
      jobTitle: raw.jobTitle || null,
      jobLevel: jobLevel!,
      employeeType: employeeType!,
      workPattern: workPattern!,
      joinedAt: joinedAt!,
      contractStartAt,
      contractEndAt,
      address: raw.address || null,
      supervisorRef: raw.supervisorNo || null,
      supervisorRowNumber: null,
      accountEmail,
      isActive: isActive!,
      divisionRef: raw.divisionRef || null,
      birthPlace: raw.birthPlace || null,
      birthDate,
      education,
      bloodType,
    });
  }

  // Penautan atasan sengaja ditunda sampai SELURUH baris terbaca: atasan
  // seseorang boleh berada di baris mana pun, termasuk di bawahnya.
  const broken = new Set<number>();
  issues.push(...linkSupervisors(out, broken));
  issues.push(...cycleIssues(out, broken));
  return { rows: out.filter((r) => !broken.has(r.rowNumber)), issues, skipped };
}

// ── Penautan atasan ─────────────────────────────────────────────

/**
 * Mencocokkan isi kolom "NIK Atasan" dengan baris lain di berkas yang sama.
 *
 * Menerima NIK maupun nama persis. Nama diterima karena pada impor pertama
 * belum ada satu pun NIK yang terbit — tanpa itu, seluruh hierarki dari impor
 * perdana akan kosong dan harus diisi ulang satu per satu lewat CRM.
 *
 * Nama yang muncul lebih dari sekali DITOLAK. Mengambil yang pertama berarti
 * separuh tim melapor kepada orang yang salah, dan tidak ada yang tahu.
 *
 * Rujukan yang tidak ketemu di berkas ini BUKAN kesalahan di sini — orangnya
 * bisa sudah terdaftar lebih dulu. Itu diperiksa saat penerapan, terhadap
 * basis data.
 */
function linkSupervisors(rows: ImportRow[], broken: Set<number>): RowIssue[] {
  const issues: RowIssue[] = [];
  const byNo = new Map<string, ImportRow>();
  const byName = new Map<string, ImportRow[]>();
  for (const r of rows) {
    if (r.employeeNo) byNo.set(r.employeeNo, r);
    const key = r.fullName.toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), r]);
  }

  for (const r of rows) {
    if (!r.supervisorRef) continue;
    const ref = r.supervisorRef.trim();

    const byNik = byNo.get(normalizeEmployeeNo(ref));
    let target = byNik ?? null;
    if (!target) {
      const named = byName.get(ref.toLowerCase()) ?? [];
      if (named.length > 1) {
        issues.push({
          rowNumber: r.rowNumber,
          column: "NIK Atasan",
          message: `Ada ${named.length} orang bernama "${ref}" di berkas ini. Tulis NIK-nya supaya jelas yang mana.`,
        });
        broken.add(r.rowNumber);
        continue;
      }
      target = named[0] ?? null;
    }

    if (target && target.rowNumber === r.rowNumber) {
      issues.push({
        rowNumber: r.rowNumber,
        column: "NIK Atasan",
        message: "Seseorang tidak bisa menjadi atasan dirinya sendiri.",
      });
      broken.add(r.rowNumber);
      continue;
    }
    r.supervisorRowNumber = target?.rowNumber ?? null;
  }
  return issues;
}

/**
 * Siklus atasan yang seluruhnya berada DI DALAM berkas ini.
 *
 * Penerapan berjalan dua tahap — semua orang dibuat dulu, atasannya ditaut
 * belakangan — dan pada tahap kedua saveEmployee() memang menolak siklus. Tapi
 * saat itu separuh datanya sudah masuk. Menangkapnya di pratinjau berarti HRD
 * melihatnya sebelum apa pun tersimpan.
 *
 * Ditelusuri lewat NOMOR BARIS, bukan NIK: baris tanpa NIK pun bisa menjadi
 * atasan lewat namanya, dan siklus di antara mereka sama merusaknya.
 */
function cycleIssues(rows: ImportRow[], broken: Set<number>): RowIssue[] {
  const issues: RowIssue[] = [];
  const byRow = new Map(rows.map((r) => [r.rowNumber, r]));

  for (const start of rows) {
    const path = new Set<number>([start.rowNumber]);
    let cursor = start.supervisorRowNumber;
    let guard = 0;
    while (cursor !== null && guard++ < 100) {
      if (path.has(cursor)) {
        issues.push({
          rowNumber: start.rowNumber,
          column: "NIK Atasan",
          message: `Hierarki atasan berputar kembali ke baris ${cursor}.`,
        });
        broken.add(start.rowNumber);
        break;
      }
      path.add(cursor);
      cursor = byRow.get(cursor)?.supervisorRowNumber ?? null;
    }
  }
  return issues;
}
