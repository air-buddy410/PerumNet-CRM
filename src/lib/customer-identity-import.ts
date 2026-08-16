// ── Melengkapi identitas pelanggan dari sistem lama (Fase 80) ───
//
// Lapisan MURNI. Tidak menyentuh basis data, jadi seluruh aturannya bisa diuji
// tanpa satu pun pelanggan sungguhan.
//
// Impor pelanggan pertama hanya membawa nama, alamat, dan paket. Audit 16
// Agustus 2026 menemukan akibatnya: SELURUH 1.711 pelanggan tidak punya
// telepon — kolomnya berisi "-" secara harfiah, bukan null, sehingga tampak
// terisi sampai seseorang mencoba menelepon. NIK dan koordinat kosong
// seluruhnya. Sistem lama menyimpan ketiganya.
//
// Yang membentuk berkas ini: **NIK memeriksa tanggal lahirnya sendiri.** Enam
// digit di tengahnya adalah tanggal lahir pemiliknya, dengan hari +40 untuk
// perempuan. Jadi dua bidang yang datang dari sumber yang sama bisa saling
// membuktikan, dan yang tidak cocok TIDAK dipakai — bukan dipilih salah satu.

import { NIK_RE, birthDateFromNik } from "@/lib/customer-import";

export interface IdentitasMasuk {
  serviceNumber: string;
  phone?: string;
  nik?: string;
  dob?: string;
  email?: string;
  lat?: string;
  lng?: string;
}

export interface IdentitasBersih {
  serviceNumber: string;
  phone: string | null;
  identityNumber: string | null;
  birthDate: Date | null;
  email: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface MasalahIdentitas {
  serviceNumber: string;
  pesan: string;
}

export interface HasilIdentitas {
  bersih: IdentitasBersih[];
  masalah: MasalahIdentitas[];
}

/** Nilai yang artinya "tidak ada", meski selnya terisi. */
const KOSONG = new Set(["", "-", "--", "n/a", "na", "null", "0", "tidak ada"]);

function adaIsinya(v: string | undefined): string {
  const s = (v ?? "").replace(/\u00A0/g, " ").trim();
  return KOSONG.has(s.toLowerCase()) ? "" : s;
}

/**
 * Nomor telepon Indonesia yang bisa dihubungi.
 *
 * Nol di depan DIKEMBALIKAN bila hilang: spreadsheet dan sebagian ekspor
 * membuang nol pertama karena menganggap kolomnya angka, dan `81236…` yang
 * kelihatan seperti nomor sebenarnya `081236…`.
 */
export function rapikanTelepon(raw: string): string | null {
  let s = adaIsinya(raw).replace(/[\s\-().]/g, "");
  if (!s) return null;
  if (s.startsWith("+62")) s = "0" + s.slice(3);
  else if (s.startsWith("62") && s.length >= 11) s = "0" + s.slice(2);
  else if (/^8\d{7,13}$/.test(s)) s = "0" + s;
  if (!/^0\d{8,14}$/.test(s)) return null;
  return s;
}

/** Koordinat yang benar-benar berada di Bali. */
export function rapikanKoordinat(lat: string, lng: string): { lat: number; lng: number } | null {
  const a = Number(adaIsinya(lat));
  const b = Number(adaIsinya(lng));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a === 0 && b === 0) return null; // (0,0) berarti belum diisi, bukan Teluk Guinea
  // Kotak Bali. Titik di luar ini bukan koordinat pelanggan PerumNet, dan
  // menyimpannya akan melemparkan penanda peta ke tengah samudra.
  if (a < -9.2 || a > -8.0) return null;
  if (b < 114.4 || b > 115.8) return null;
  return { lat: a, lng: b };
}

/** Tanggal `YYYY-MM-DD` saja; bentuk lain ditolak alih-alih ditebak. */
export function rapikanTanggal(raw: string): Date | null {
  const s = adaIsinya(raw);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  const tahun = d.getUTCFullYear();
  if (tahun < 1900 || tahun > new Date().getUTCFullYear()) return null;
  return d;
}

export function rapikanEmail(raw: string): string | null {
  const s = adaIsinya(raw).toLowerCase();
  if (!s) return null;
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(s) ? s : null;
}

/**
 * Membersihkan satu baris identitas.
 *
 * NIK dan tanggal lahir saling memeriksa. Kalau keduanya ada dan berselisih,
 * KEDUANYA ditolak dan barisnya dilaporkan — sebab yang salah bisa NIK-nya,
 * bisa tanggalnya, dan dari sini tidak ada cara membedakannya. Menyimpan salah
 * satu berarti menebak pada bidang yang justru dipakai untuk membuktikan
 * identitas orang.
 */
export function bersihkanIdentitas(m: IdentitasMasuk): {
  bersih: IdentitasBersih;
  masalah: string[];
} {
  const masalah: string[] = [];

  const nikMentah = adaIsinya(m.nik).replace(/\s/g, "");
  let identityNumber: string | null = null;
  if (nikMentah) {
    if (NIK_RE.test(nikMentah)) identityNumber = nikMentah;
    else masalah.push(`NIK "${nikMentah}" bukan 16 digit angka.`);
  }

  const lahirKetik = rapikanTanggal(m.dob ?? "");
  const lahirNik = identityNumber ? birthDateFromNik(identityNumber) : null;
  let birthDate: Date | null = lahirNik ?? lahirKetik;

  if (identityNumber && lahirKetik && !lahirNik) {
    // NIK enam belas digit tetapi tanggal di dalamnya tidak masuk akal.
    masalah.push(`NIK ${identityNumber} tidak memuat tanggal lahir yang sah.`);
    identityNumber = null;
    birthDate = lahirKetik;
  } else if (lahirNik && lahirKetik && lahirNik.getTime() !== lahirKetik.getTime()) {
    masalah.push(
      `NIK memuat tanggal lahir ${lahirNik.toISOString().slice(0, 10)} ` +
        `tetapi tertulis ${lahirKetik.toISOString().slice(0, 10)} — keduanya tidak dipakai.`
    );
    identityNumber = null;
    birthDate = null;
  }

  const koord = rapikanKoordinat(m.lat ?? "", m.lng ?? "");
  const teleponMentah = adaIsinya(m.phone);
  const phone = rapikanTelepon(teleponMentah);
  if (teleponMentah && !phone) masalah.push(`Telepon "${teleponMentah}" tidak terbaca.`);

  return {
    bersih: {
      serviceNumber: m.serviceNumber.trim(),
      phone,
      identityNumber,
      birthDate,
      email: rapikanEmail(m.email ?? ""),
      latitude: koord?.lat ?? null,
      longitude: koord?.lng ?? null,
    },
    masalah,
  };
}

/**
 * Membersihkan seluruh baris, dan menolak NIK yang dipakai lebih dari satu
 * orang.
 *
 * `Customer.identityNumber` unik pada skema. Dua pelanggan bernomor sama
 * berarti salah satunya salah ketik di sumber; menyimpan yang pertama dan
 * menolak yang kedua akan memilih berdasarkan urutan baris, yang tidak berarti
 * apa-apa. Keduanya dilepas dan dilaporkan.
 */
/**
 * Berapa kali satu titik boleh berulang sebelum dianggap titik bawaan peta.
 *
 * Beberapa pelanggan memang bisa berbagi koordinat — satu pekarangan, satu kos,
 * satu ruko bertingkat. Enam puluh tidak. Pada salinan 16 Agustus 2026, satu
 * titik muncul 59 kali dengan lima belas angka di belakang koma: itu pusat peta
 * yang tersimpan ketika operator membuka formulir tanpa menggeser penanda.
 * Menyimpannya menumpuk 59 rumah di satu titik dan membuat petanya berbohong
 * dengan cara yang meyakinkan.
 */
const MAKS_TITIK_SAMA = 5;

export function bersihkanSemua(rows: IdentitasMasuk[]): HasilIdentitas {
  const out: HasilIdentitas = { bersih: [], masalah: [] };
  const hasil = rows.map((r) => ({ r, ...bersihkanIdentitas(r) }));

  const titik = new Map<string, number>();
  for (const h of hasil) {
    if (h.bersih.latitude === null || h.bersih.longitude === null) continue;
    const k = `${h.bersih.latitude},${h.bersih.longitude}`;
    titik.set(k, (titik.get(k) ?? 0) + 1);
  }
  for (const h of hasil) {
    if (h.bersih.latitude === null || h.bersih.longitude === null) continue;
    const k = `${h.bersih.latitude},${h.bersih.longitude}`;
    const n = titik.get(k) ?? 0;
    if (n > MAKS_TITIK_SAMA) {
      h.masalah.push(`Koordinat ${k} dipakai ${n} pelanggan — titik bawaan peta, tidak disimpan.`);
      h.bersih.latitude = null;
      h.bersih.longitude = null;
    }
  }

  const hitung = new Map<string, number>();
  for (const h of hasil) {
    if (h.bersih.identityNumber) {
      hitung.set(h.bersih.identityNumber, (hitung.get(h.bersih.identityNumber) ?? 0) + 1);
    }
  }

  for (const h of hasil) {
    const nik = h.bersih.identityNumber;
    if (nik && (hitung.get(nik) ?? 0) > 1) {
      out.masalah.push({
        serviceNumber: h.bersih.serviceNumber,
        pesan: `NIK ${nik} dipakai ${hitung.get(nik)} pelanggan — tidak satu pun disimpan.`,
      });
      h.bersih.identityNumber = null;
      // Tanggal lahirnya tetap dipakai: yang meragukan nomornya, bukan
      // tanggalnya, dan tanggal lahir tidak harus unik.
    }
    for (const p of h.masalah) out.masalah.push({ serviceNumber: h.bersih.serviceNumber, pesan: p });
    out.bersih.push(h.bersih);
  }
  return out;
}
