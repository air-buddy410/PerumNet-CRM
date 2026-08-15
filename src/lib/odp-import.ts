import { coordinateRejection } from "@/lib/recovery";

// ── Pembacaan ODP & Master Splitter dari sheet Operasional (Fase 72) ─
//
// Lapisan MURNI: tabel teks masuk, baris tervalidasi keluar.
//
// Sumbernya satu spreadsheet berisi BANYAK tabel ODP dengan susunan kolom
// yang berbeda-beda — tujuh blok, sebagian punya kolom `Port 1`..`Port 16`,
// sebagian tidak, dan judul kodenya berganti antara `KODE ODP/MS`, `ODP`,
// dan `Kode`. Karena itu kolom dikenali dari NAMANYA, dan blok yang judulnya
// tidak dikenali dilewati tanpa menggagalkan yang lain.
//
// Yang membedakan berkas ini dari importir lain: ia membangun HIERARKI.
// Kolom `Master Spliter` menunjuk ODP lain sebagai induk, dan induk itu belum
// tentu sudah terbaca ketika anaknya dibaca. Penautannya karena itu ditunda
// sampai seluruh baris terkumpul.

export interface RowIssue {
  rowNumber: number;
  column: string;
  message: string;
}

/** Satu pelanggan yang menempati satu port, menurut sheet. */
export interface PortOccupant {
  portNumber: number;
  /** Nama pelanggan apa adanya; dicocokkan ke Customer saat penerapan. */
  customerName: string;
}

export interface OdpRow {
  rowNumber: number;
  code: string;
  /** ODP | MS — Master Splitter diperlakukan sebagai simpul induk. */
  role: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  /** Redaman masuk dalam dBm; negatif itu normal. */
  opticPowerDbm: number | null;
  /** Kode Master Splitter induknya, apa adanya. */
  parentRef: string | null;
  /** Port pada Master Splitter yang ditempati ODP ini. */
  parentPort: number | null;
  /** Nama OLT apa adanya dari sheet. */
  oltRef: string | null;
  /** PIU / kartu-slot-port PON, apa adanya. */
  ponRef: string | null;
  /** Kapasitas port menurut sheet; null bila tidak tercatat. */
  portCapacity: number | null;
  occupants: PortOccupant[];
  notes: string[];
}

export interface ParsedOdp {
  rows: OdpRow[];
  issues: RowIssue[];
  skipped: number;
  /** Blok tabel yang judulnya tidak dikenali sebagai tabel ODP. */
  ignoredBlocks: number;
}

// ── Pengenalan kolom ────────────────────────────────────────────

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Judul yang mungkin dipakai untuk tiap bidang, di seluruh blok. */
const ALIAS = {
  code: ["kode odp/ms", "odp", "kode odp", "kode dp / ms", "kode dp"],
  role: ["tipe"],
  status: ["status"],
  coordinate: ["kordinat odp", "koordinat odp"],
  opticIn: ["redaman input", "redaman input dp"],
  parent: ["master spliter", "master splitter", "kode ms"],
  parentPort: ["port ms"],
  olt: ["olt"],
  pon: ["piu"],
  capacity: ["port odp"],
  msCoordinate: ["kordinat ms", "koordinat ms"],
} as const;

type Field = keyof typeof ALIAS;

function mapHeader(header: string[]): Partial<Record<Field, number>> {
  const n = header.map(norm);
  const out: Partial<Record<Field, number>> = {};
  for (const f of Object.keys(ALIAS) as Field[]) {
    for (const a of ALIAS[f]) {
      const i = n.indexOf(a);
      // Satu kolom tidak boleh dipakai dua bidang: beberapa blok memuat
      // `Kode` dua kali, dan tanpa penjagaan ini bidang kedua akan membaca
      // kolom yang sama dengan yang pertama.
      if (i >= 0 && !Object.values(out).includes(i)) {
        out[f] = i;
        break;
      }
    }
  }
  return out;
}

/** Kolom `Port 1` … `Port 16`, diurut menurut nomornya. */
function portColumns(header: string[]): { index: number; portNumber: number }[] {
  const out: { index: number; portNumber: number }[] = [];
  header.forEach((h, i) => {
    const m = /^port\s+(\d{1,2})$/.exec(norm(h));
    if (m) out.push({ index: i, portNumber: Number(m[1]) });
  });
  return out.sort((a, b) => a.portNumber - b.portNumber);
}

// ── Penyeragaman nilai ──────────────────────────────────────────

/**
 * Kode ODP diseragamkan huruf besar dan spasi tunggal — TIDAK lebih.
 *
 * Sama seperti pada importir pelanggan: `BSS 011204` dan `BBS 011204` sengaja
 * tetap berbeda. Menggabungkan dua tiang berarti menaruh pelanggan di tempat
 * yang salah, dan tidak ada yang menyadarinya sampai ada gangguan.
 */
export function normalizeOdpCode(raw: string): string {
  return (raw ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

/** `ODP` atau `MS`; Master Splitter dikenali dari kodenya bila Tipe kosong. */
export function roleOf(tipe: string, code: string): string {
  const t = norm(tipe);
  if (t === "ms" || t.includes("master") || t.includes("splitter") || t.includes("spliter")) return "MS";
  if (t === "odp" || t === "dp") return "ODP";
  return /^MS\b/.test(code.toUpperCase()) ? "MS" : "ODP";
}

export function statusOf(raw: string): string {
  const s = norm(raw);
  if (!s) return "ACTIVE";
  // YANG MENYANGKAL DIPERIKSA LEBIH DULU. "nonaktif" memuat "aktif", jadi
  // urutan terbalik akan membaca setiap ODP mati sebagai hidup — dan peta
  // yang menyatakan semuanya sehat lebih berbahaya daripada peta kosong.
  if (s.includes("nonaktif") || s.includes("non-aktif") || s === "inactive" || s === "off" || s.includes("mati")) {
    return "INACTIVE";
  }
  if (s.includes("plan") || s.includes("rencana")) return "PLANNED";
  if (s.includes("aktif") || s === "active" || s === "on" || s.includes("live")) return "ACTIVE";
  return "ACTIVE";
}

/** `-8.459547, 115.604957` menjadi sepasang angka. */
export function parseCoordinatePair(raw: string): { latitude: number; longitude: number } | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const m = /^(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)$/.exec(s);
  if (!m) return null;
  return { latitude: Number(m[1]), longitude: Number(m[2]) };
}

/**
 * Redaman dalam dBm. Nilai NEGATIF itu normal dan wajib dipertahankan —
 * daya optik selalu di bawah nol, dan membuang tandanya mengubah "lemah"
 * menjadi "kuat".
 */
export function parseDbm(raw: string): number | null {
  const s = (raw ?? "").replace(/dbm/gi, "").replace(/,/g, ".").trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  // Di luar rentang ini nilainya bukan pengukuran optik.
  if (n > 5 || n < -40) return null;
  return n;
}

function intOf(raw: string): number | null {
  const n = Number((raw ?? "").replace(/[^\d-]/g, ""));
  return Number.isInteger(n) && n > 0 ? n : null;
}

function cell(row: string[], i: number | undefined): string {
  return i === undefined ? "" : (row[i] ?? "").trim();
}

// ── Pembacaan ───────────────────────────────────────────────────

/**
 * Membaca beberapa blok tabel ODP sekaligus.
 *
 * @param blocks Tiap blok adalah satu tabel; baris pertamanya judul.
 */
export function parseOdpBlocks(blocks: string[][][]): ParsedOdp {
  const out: ParsedOdp = { rows: [], issues: [], skipped: 0, ignoredBlocks: 0 };
  const terlihat = new Map<string, number>();

  for (const rows of blocks) {
    if (rows.length < 2) {
      out.ignoredBlocks++;
      continue;
    }
    const head = mapHeader(rows[0]);
    if (head.code === undefined) {
      out.ignoredBlocks++;
      continue;
    }
    const ports = portColumns(rows[0]);

    for (let i = 1; i < rows.length; i++) {
      const rowNumber = i + 1;
      const r = rows[i];
      const code = normalizeOdpCode(cell(r, head.code));
      if (!code) {
        out.skipped++;
        continue;
      }
      // Baris judul yang terbawa ke dalam data — dilewati diam-diam, bukan
      // dilaporkan: ia bukan kesalahan operator, hanya bentuk spreadsheet.
      if (["KODE", "ODP", "KODE ODP/MS", "KODE DP"].includes(code)) {
        out.skipped++;
        continue;
      }

      const sudah = terlihat.get(code);
      if (sudah !== undefined) {
        // Blok yang berbeda memang memuat ODP yang sama pada tahap berbeda
        // (pembuatan, lalu kunjungan). Yang pertama menang, dan itu bukan
        // masalah yang perlu dilaporkan — hanya dicatat sebagai dilewati.
        out.skipped++;
        continue;
      }

      const notes: string[] = [];
      let latitude: number | null = null;
      let longitude: number | null = null;
      const koord = cell(r, head.coordinate);
      if (koord) {
        const pair = parseCoordinatePair(koord);
        if (!pair) {
          notes.push(`Koordinat "${koord.slice(0, 30)}" tidak terbaca — ODP tetap dibuat tanpa titik peta.`);
        } else {
          const tolak = coordinateRejection(pair);
          if (tolak) notes.push(`${tolak} ODP tetap dibuat tanpa titik peta.`);
          else {
            latitude = pair.latitude;
            longitude = pair.longitude;
          }
        }
      } else {
        notes.push("Tanpa koordinat — tidak akan muncul di peta.");
      }

      const occupants: PortOccupant[] = [];
      for (const p of ports) {
        const nama = cell(r, p.index);
        if (!nama) continue;
        // Angka atau tanda hubung pada kolom port berarti "terpakai" tanpa
        // menyebut siapa. Itu bukan nama, jadi tidak diteruskan sebagai nama.
        if (/^[\d\-–—.]+$/.test(nama)) continue;
        occupants.push({ portNumber: p.portNumber, customerName: nama });
      }

      const parentRaw = cell(r, head.parent);
      const parentRef = parentRaw ? normalizeOdpCode(parentRaw) : null;

      // Master Splitter yang disebut sebagai induk sering TIDAK punya barisnya
      // sendiri di berkas — ia hanya muncul sebagai nama di kolom `Master
      // Spliter`. Padahal sebagian blok membawa `Kordinat MS`, jadi titiknya
      // ada; yang tidak ada hanya barisnya. MS seperti itu dilahirkan di sini
      // supaya hierarki OLT → MS → ODP utuh, bukan putus di tengah.
      if (parentRef && !terlihat.has(parentRef)) {
        const koordMs = parseCoordinatePair(cell(r, head.msCoordinate));
        const sah = koordMs && !coordinateRejection(koordMs) ? koordMs : null;
        terlihat.set(parentRef, rowNumber);
        out.rows.push({
          rowNumber,
          code: parentRef,
          role: "MS",
          status: "ACTIVE",
          latitude: sah?.latitude ?? null,
          longitude: sah?.longitude ?? null,
          opticPowerDbm: null,
          parentRef: null,
          parentPort: null,
          oltRef: cell(r, head.olt) || null,
          ponRef: cell(r, head.pon) || null,
          portCapacity: null,
          occupants: [],
          notes: [`Dibuat dari rujukan "${parentRef}" pada ODP ${code}; tidak punya barisnya sendiri di berkas.`],
        });
      }

      terlihat.set(code, rowNumber);
      out.rows.push({
        rowNumber,
        code,
        role: roleOf(cell(r, head.role), code),
        status: statusOf(cell(r, head.status)),
        latitude,
        longitude,
        opticPowerDbm: parseDbm(cell(r, head.opticIn)),
        parentRef: parentRef && parentRef !== code ? parentRef : null,
        parentPort: intOf(cell(r, head.parentPort)),
        oltRef: cell(r, head.olt) || null,
        ponRef: cell(r, head.pon) || null,
        portCapacity: intOf(cell(r, head.capacity)),
        occupants,
        notes,
      });
    }
  }

  // ── Hierarki: induk baru bisa diperiksa setelah semuanya terbaca ──
  const ada = new Set(out.rows.map((x) => x.code));
  for (const row of out.rows) {
    if (row.parentRef && !ada.has(row.parentRef)) {
      // Induk yang tidak ada di berkas TIDAK menggagalkan ODP-nya. Tiangnya
      // nyata dan koordinatnya berguna; yang hilang hanya kaitannya ke atas,
      // dan itu bisa disambung belakangan tanpa membuat ulang apa pun.
      row.notes.push(`Master Splitter "${row.parentRef}" tidak ada di berkas — kaitan induk dilewati.`);
      row.parentRef = null;
    }
  }

  if (out.rows.length === 0 && out.issues.length === 0) {
    out.issues.push({
      rowNumber: 0,
      column: "KODE ODP/MS",
      message: "Tidak ada blok tabel ODP yang dikenali. Blok harus punya kolom kode ODP.",
    });
  }
  return out;
}
