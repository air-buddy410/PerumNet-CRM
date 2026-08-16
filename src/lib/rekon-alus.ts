// ── Menyandingkan CRM dengan sistem lama (Fase 83) ──────────────
//
// Lapisan MURNI. Tidak menyentuh basis data, tidak menyentuh sistem lama.
//
// Selama operasional masih berjalan di sistem lama, DUA sistem memegang
// kebenaran yang sama tentang pelanggan yang sama, dan keduanya bergerak:
// pelanggan baru masuk ke sana, paket berubah di sana, orang diblokir di sana.
// CRM diam. Selisihnya melebar tiap hari, dan tidak ada yang tahu berapa
// lebarnya sampai ada yang menghitung.
//
// Berkas ini yang menghitung. Ia dipanggil berulang — sebelum tiap keputusan
// besar, dan sekali lagi tepat sebelum cutover — bukan sekali seumur proyek.
//
// SATU HAL YANG MEMBENTUKNYA: ia tidak memutuskan apa pun. Tidak menimpa,
// tidak menyarankan siapa yang benar. Selisih adalah pertanyaan untuk manusia,
// dan alat yang menjawabnya sendiri akan menyembunyikan justru yang perlu
// dilihat.

/** Satu pelanggan menurut sistem lama. */
export interface BarisAlus {
  cid: string;
  nama: string;
  status: string;
  /** Nama paket berikut harganya dalam kurung, mis. `Paket-Berdua (225,000)`. */
  plan: string;
  odp: string | null;
  onu: string | null;
}

/** Satu langganan menurut CRM. */
export interface BarisCrm {
  serviceNumber: string;
  nama: string;
  /** Status langganan: ACTIVE | ISOLATED | INACTIVE | PROSPECT | … */
  status: string;
  monthlyPrice: number;
  odp: string | null;
  onuPosition: string | null;
  /** Keadaan sambungan menurut router — SUMBU LAIN dari status langganan. */
  linkStatus: string | null;
}

export type JenisSelisih =
  | "HANYA_DI_ALUS"
  | "HANYA_DI_CRM"
  | "STATUS"
  | "HARGA"
  | "ODP"
  | "ONU";

export interface Selisih {
  jenis: JenisSelisih;
  cid: string;
  nama: string;
  alus: string;
  crm: string;
}

export interface HasilRekon {
  /** Berapa pelanggan ada di kedua sistem. */
  bersama: number;
  hanyaAlus: number;
  hanyaCrm: number;
  /** Berapa yang seluruh bidangnya cocok. */
  cocokPenuh: number;
  selisih: Selisih[];
  perJenis: Record<JenisSelisih, number>;
  /**
   * Status penagihan sistem lama disandingkan dengan keadaan secret di router.
   * DUA SUMBU BERBEDA — "Blocked" itu keputusan penagihan, "DISABLED" itu
   * keadaan perangkat. Keduanya sering tidak sama, dan itu belum tentu salah;
   * yang perlu dilihat adalah pelanggan yang diblokir tetapi masih menyala.
   */
  blokirVsRouter: { alus: string; link: string; jumlah: number }[];
}

/**
 * Tanda arah teks dan spasi nol yang tidak terlihat mata.
 *
 * Sistem lama menyimpannya di dalam nilai — `‎‎PN102052675` dan
 * `KCC‎ 1440701` keduanya sungguhan. Karena tak terlihat, satu pelanggan bisa
 * muncul di KEDUA sisi laporan sekaligus: "hanya di sistem lama" dan "hanya di
 * CRM", padahal ia orang yang sama. Itu persis yang terjadi pada laporan
 * pertama sebelum pembersihan ini dipasang.
 */
const TAK_TERLIHAT = /[​-‏‪-‮﻿]/g;

/** Kunci pencocokan nomor layanan: tanpa spasi, tanpa tanda tak terlihat, huruf besar. */
export function kunci(n: string): string {
  return (n ?? "").replace(TAK_TERLIHAT, "").replace(/\s+/g, "").toUpperCase();
}

/** Kode ODP: aturan yang sama. */
export function kunciOdp(n: string | null | undefined): string {
  return (n ?? "").replace(TAK_TERLIHAT, "").replace(/\s+/g, "").toUpperCase();
}

/**
 * Harga bulanan dari nama paket sistem lama.
 *
 * Nama paket TIDAK dibandingkan, hanya harganya. Alasannya: master paket kedua
 * sistem dinamai berbeda sejak awal (`Paket-Berdua` di sana, `Berdua` di sini)
 * dan menyamakan namanya bukan pekerjaan rekonsiliasi. Yang harus sama adalah
 * yang dibayar pelanggan.
 */
export function hargaDariPlan(plan: string | null | undefined): number | null {
  const m = /\((\d[\d.,]*)\)\s*$/.exec((plan ?? "").trim());
  if (!m) return null;
  const n = Number(m[1].replace(/[.,]/g, ""));
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

/** Status sistem lama → status langganan CRM. */
export function statusSetara(alus: string): string {
  const s = (alus ?? "").trim().toLowerCase();
  if (s === "active" || s === "aktif") return "ACTIVE";
  if (s === "block" || s === "blocked" || s === "isolir") return "ISOLATED";
  if (s === "inactive" || s === "nonaktif") return "INACTIVE";
  if (s === "potensial" || s === "prospect") return "PROSPECT";
  return "ACTIVE";
}

export function bandingkan(alus: BarisAlus[], crm: BarisCrm[]): HasilRekon {
  const perCrm = new Map(crm.map((c) => [kunci(c.serviceNumber), c]));
  const perAlus = new Map(alus.map((a) => [kunci(a.cid), a]));

  const selisih: Selisih[] = [];
  const perJenis: Record<JenisSelisih, number> = {
    HANYA_DI_ALUS: 0, HANYA_DI_CRM: 0, STATUS: 0, HARGA: 0, ODP: 0, ONU: 0,
  };
  const tambah = (s: Selisih) => {
    selisih.push(s);
    perJenis[s.jenis]++;
  };

  const blokir = new Map<string, number>();
  let bersama = 0;
  let cocokPenuh = 0;

  for (const a of alus) {
    const c = perCrm.get(kunci(a.cid));
    if (!c) {
      tambah({ jenis: "HANYA_DI_ALUS", cid: a.cid, nama: a.nama, alus: a.status, crm: "—" });
      continue;
    }
    bersama++;
    let utuh = true;

    const statusAlus = statusSetara(a.status);
    if (statusAlus !== c.status) {
      tambah({ jenis: "STATUS", cid: a.cid, nama: a.nama, alus: `${a.status} → ${statusAlus}`, crm: c.status });
      utuh = false;
    }

    const harga = hargaDariPlan(a.plan);
    if (harga !== null && harga !== c.monthlyPrice) {
      tambah({ jenis: "HARGA", cid: a.cid, nama: a.nama, alus: String(harga), crm: String(c.monthlyPrice) });
      utuh = false;
    }

    if (kunciOdp(a.odp) !== kunciOdp(c.odp)) {
      tambah({ jenis: "ODP", cid: a.cid, nama: a.nama, alus: a.odp ?? "—", crm: c.odp ?? "—" });
      utuh = false;
    }

    // ONU hanya dibandingkan bila sistem lama memang mencatatnya. Kolom kosong
    // di sana berarti "tidak tahu", bukan "tidak ada" — dan menghitungnya
    // sebagai selisih akan menenggelamkan yang sungguhan.
    if ((a.onu ?? "").trim() && (a.onu ?? "").trim() !== (c.onuPosition ?? "").trim()) {
      tambah({ jenis: "ONU", cid: a.cid, nama: a.nama, alus: a.onu!, crm: c.onuPosition ?? "—" });
      utuh = false;
    }

    if (utuh) cocokPenuh++;

    const k = `${a.status}|${c.linkStatus ?? "—"}`;
    blokir.set(k, (blokir.get(k) ?? 0) + 1);
  }

  for (const c of crm) {
    if (perAlus.has(kunci(c.serviceNumber))) continue;
    tambah({ jenis: "HANYA_DI_CRM", cid: c.serviceNumber, nama: c.nama, alus: "—", crm: c.status });
  }

  return {
    bersama,
    hanyaAlus: perJenis.HANYA_DI_ALUS,
    hanyaCrm: perJenis.HANYA_DI_CRM,
    cocokPenuh,
    selisih,
    perJenis,
    blokirVsRouter: [...blokir.entries()]
      .map(([k, jumlah]) => {
        const [a, l] = k.split("|");
        return { alus: a, link: l, jumlah };
      })
      .sort((x, y) => y.jumlah - x.jumlah),
  };
}
