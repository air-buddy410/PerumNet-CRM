// ── Menjodohkan ODP ke port PON-nya (Fase 82) ───────────────────
//
// Lapisan MURNI. Tidak menyentuh basis data.
//
// Fase 81 menyambung ODP ke SITE dengan menyimpulkannya dari pelanggan: kalau
// seluruh penghuni satu ODP menyebut OLT yang sama, ODP itu ada di site OLT
// tersebut. Cara itu menautkan 340 dari 577 ODP dan berhenti di situ — 219 ODP
// belum punya penghuni sama sekali, jadi tidak ada yang bisa disimpulkan, dan
// lima ODP penghuninya menyebut OLT yang berbeda-beda.
//
// Ternyata jalan itu memutar. Berkas ODP sistem lama MENYEBUT SENDIRI OLT dan
// port PON tiap ODP, dan nilainya sudah tersimpan di `Odp.notes` sejak impor
// ODP. Seluruh 577 ODP punya. Membacanya kembali memberi dua hal sekaligus
// yang tidak bisa diberikan penyimpulan lewat pelanggan:
//
//  1. ODP tanpa penghuni ikut tertaut — mereka justru yang paling perlu, sebab
//     port kosongnya yang dicari orang saat memasang pelanggan baru.
//  2. PORT PON-nya, bukan cuma site-nya. Rantai POP → OLT → PON → ODP →
//     pelanggan baru utuh kalau mata rantai ini ada.
//
// Catatan ODP dipakai sebagai sumber UTAMA, dan OLT yang disebut pelanggan
// menjadi pemeriksa silang — bukan sebaliknya. Alasannya: catatan ODP menyebut
// ODP itu sendiri, sedangkan OLT pada pelanggan menyebut pelanggannya, dan
// satu pelanggan yang catatannya basi tidak seharusnya memindahkan ODP.

/** Apa yang tersimpan pada catatan sebuah ODP. */
export interface CatatanOdp {
  /** Nama OLT sebagaimana ditulis berkas, mis. `OLT ZTE C600 Kecicang`. */
  olt: string | null;
  /** Nilai PIU apa adanya, mis. `1/16/9` atau `Port 6`. */
  piu: string | null;
}

/**
 * Membaca catatan ODP.
 *
 * Bentuknya `OLT menurut berkas: <olt> · PIU: <piu>`, kadang diikuti keterangan
 * lain yang juga dipisah `·` — mis. ODP yang dibuat dari rujukan ODP lain.
 * Keterangan itu dibuang; yang diambil hanya ruas pertama tiap bagian.
 */
export function bacaCatatanOdp(notes: string | null | undefined): CatatanOdp {
  const t = (notes ?? "").trim();
  if (!t) return { olt: null, piu: null };

  const olt = /OLT menurut berkas:\s*([^·]+)/.exec(t);
  const piu = /PIU:\s*([^·]+)/.exec(t);
  return {
    olt: olt ? olt[1].trim() || null : null,
    piu: piu ? piu[1].trim() || null : null,
  };
}

export interface SlotPort {
  slot: number;
  port: number;
}

/**
 * Mengubah nilai PIU menjadi slot dan nomor port.
 *
 * Dua bentuk dipakai, dan bentuknya sendiri yang membedakan — tidak perlu tahu
 * vendornya:
 *
 *   `1/16/9`  → rak 1, slot 16, port 9   (ZTE)
 *   `Port 6`  → slot 1, port 6           (HSGQ)
 *
 * RAK DIABAIKAN, bukan dibuang diam-diam: `PonPort` hanya punya slot dan port,
 * dan seluruh 577 baris berkas ini menyebut rak 1. Kalau suatu hari muncul rak
 * kedua, nilainya akan bertabrakan pada kunci unik `(oltId, slot, port)` dan
 * ketahuan sebagai galat, bukan tersimpan diam-diam sebagai port yang keliru.
 *
 * Bentuk lain menghasilkan `null`. Menebak nomor port berarti mengarang jalur
 * serat, dan ODP yang salah port lebih buruk daripada ODP yang belum tertaut:
 * yang kedua kelihatan, yang pertama tidak.
 */
export function bacaPiu(piu: string | null | undefined): SlotPort | null {
  const t = (piu ?? "").trim();
  if (!t) return null;

  const zte = /^(\d+)\/(\d+)\/(\d+)$/.exec(t);
  if (zte) {
    const slot = Number(zte[2]);
    const port = Number(zte[3]);
    return slot > 0 && port > 0 ? { slot, port } : null;
  }

  const hsgq = /^port[\s_-]*(\d+)$/i.exec(t);
  if (hsgq) {
    const port = Number(hsgq[1]);
    return port > 0 ? { slot: 1, port } : null;
  }

  return null;
}

// ── Menjodohkan nama OLT ────────────────────────────────────────
//
// Berkas ODP menulis `OLT ZTE C600 Kecicang`, berkas OLT menulis
// `ZTE-C600-100-Kecicang`, dan LibreNMS mengenalnya sebagai `192.168.100.60`.
// Tiga nama untuk satu perangkat. Yang menjodohkan MANUSIA, lewat peta yang
// diberikan sebagai masukan — sama seperti Fase 81, dan karena alasan yang
// sama: mencocokkan tiga penamaan bebas dengan aturan berarti menebak.

export type PetaOltOdp = Record<string, string>;

/** Kunci pencocokan: huruf kecil, spasi rangkap dirapikan. */
export function kunciOlt(nama: string): string {
  return nama.trim().toLowerCase().replace(/\s+/g, " ");
}

export interface OdpMasuk {
  code: string;
  notes: string | null;
}

export interface TautanOdp {
  code: string;
  olt: string | null;
  piu: string | null;
  slotPort: SlotPort | null;
  /** Hostname perangkat, kalau nama OLT-nya dikenali. */
  hostname: string | null;
  status: "SIAP" | "TOLAK";
  pesan: string;
}

/**
 * Membaca seluruh ODP menjadi rencana tautan, tanpa menyentuh basis data.
 *
 * Yang ditolak tetap dikembalikan berikut alasannya. ODP yang tidak tertaut
 * adalah lubang di peta jaringan, dan lubang yang tidak disebutkan namanya
 * tidak akan pernah ditambal.
 */
export function susunTautan(daftar: OdpMasuk[], peta: PetaOltOdp): TautanOdp[] {
  const perKunci = new Map(Object.entries(peta).map(([k, v]) => [kunciOlt(k), v]));

  return daftar.map((o) => {
    const { olt, piu } = bacaCatatanOdp(o.notes);
    const dasar = { code: o.code, olt, piu };

    if (!olt) {
      return { ...dasar, slotPort: null, hostname: null, status: "TOLAK" as const, pesan: "Catatannya tidak menyebut OLT." };
    }
    const hostname = perKunci.get(kunciOlt(olt)) ?? null;
    if (!hostname) {
      return { ...dasar, slotPort: null, hostname: null, status: "TOLAK" as const, pesan: `OLT "${olt}" belum dijodohkan dengan perangkat mana pun.` };
    }
    const slotPort = bacaPiu(piu);
    if (!slotPort) {
      return { ...dasar, slotPort: null, hostname, status: "TOLAK" as const, pesan: piu ? `PIU "${piu}" tidak terbaca sebagai slot dan port.` : "Catatannya tidak menyebut PIU." };
    }
    return { ...dasar, slotPort, hostname, status: "SIAP" as const, pesan: `${hostname} slot ${slotPort.slot} port ${slotPort.port}` };
  });
}
