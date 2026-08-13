// ── Ulang tahun pegawai (Fase 59) ───────────────────────────────
//
// Modul MURNI: aturannya bisa diuji tanpa database maupun jam sungguhan.
//
// Dua hal yang sengaja TIDAK dilakukan di sepanjang berkas ini, dan keduanya
// keputusan, bukan kelalaian:
//
//   1. UMUR TIDAK PERNAH DIHITUNG maupun ditampilkan. Yang keluar hanya
//      tanggal dan bulan. Umur di papan pengumuman kantor adalah bahan
//      canggung yang tidak diminta siapa pun, dan ia membuka pintu ke
//      pembedaan berdasarkan usia — sesuatu yang mudah ditambahkan dan sulit
//      dijelaskan.
//   2. TAHUN LAHIR TIDAK IKUT KELUAR. Ia data pribadi yang dipakai HRD, bukan
//      pengumuman.

/** Zona waktu kantor. Ulang tahun berganti tengah malam WITA, bukan UTC. */
export const OFFICE_TZ_OFFSET_HOURS = 8;

export interface BirthdayPerson {
  employeeId: string;
  fullName: string;
  jobTitle: string | null;
  divisionName: string | null;
  /** Foto profil bila ada — bukan foto resmi kartu pegawai. */
  avatarUrl: string | null;
}

/** Hari & bulan sebuah tanggal menurut jam kantor. */
export function dayMonthOf(d: Date): { day: number; month: number } {
  const wita = new Date(d.getTime() + OFFICE_TZ_OFFSET_HOURS * 3_600_000);
  return { day: wita.getUTCDate(), month: wita.getUTCMonth() + 1 };
}

/**
 * Apakah tanggal lahir ini jatuh pada hari yang sama dengan `now`?
 *
 * 29 Februari diperlakukan sebagai 28 Februari pada tahun biasa. Tanpa itu,
 * orang yang lahir di tanggal kabisat tidak pernah diucapkan selamat selama
 * tiga tahun berturut-turut — dan itu justru kebalikan dari maksud fitur ini.
 */
export function isBirthdayToday(birthDate: Date, now: Date): boolean {
  const lahir = dayMonthOf(birthDate);
  const hari = dayMonthOf(now);
  if (lahir.month === hari.month && lahir.day === hari.day) return true;

  if (lahir.month === 2 && lahir.day === 29) {
    const tahun = new Date(now.getTime() + OFFICE_TZ_OFFSET_HOURS * 3_600_000).getUTCFullYear();
    const kabisat = (tahun % 4 === 0 && tahun % 100 !== 0) || tahun % 400 === 0;
    if (!kabisat) return hari.month === 2 && hari.day === 28;
  }
  return false;
}

const UCAPAN = [
  "Selamat ulang tahun, {nama}! Semoga sehat selalu dan lancar segala urusannya.",
  "Selamat ulang tahun, {nama}. Terima kasih untuk kerja samanya selama ini — semoga tahun ini membawa banyak hal baik.",
  "Hari ini {nama} berulang tahun. Selamat, semoga panjang umur dan selalu diberi kesehatan!",
  "Selamat bertambah usia, {nama}. Semoga selalu diberi kemudahan, di kantor maupun di rumah.",
] as const;

/**
 * Kalimat ucapan untuk seseorang.
 *
 * Dipilih dari NAMA-nya, bukan acak — supaya kalimatnya tetap sama setiap kali
 * halaman dimuat ulang pada hari yang sama. Ucapan yang berganti-ganti tiap
 * kali layar disegarkan terlihat seperti mesin, bukan seperti perhatian.
 *
 * Tidak menyebut umur, dan itu disengaja.
 */
export function greetingFor(fullName: string): string {
  let jumlah = 0;
  for (const ch of fullName) jumlah = (jumlah + ch.charCodeAt(0)) % 9973;
  return UCAPAN[jumlah % UCAPAN.length].replace("{nama}", fullName.trim().split(/\s+/)[0]);
}

/** Judul panel, mengikuti berapa orang yang berulang tahun. */
export function birthdayHeadline(orang: readonly BirthdayPerson[]): string | null {
  if (!orang.length) return null;
  if (orang.length === 1) return `Hari ini ${orang[0].fullName} berulang tahun`;
  return `Hari ini ${orang.length} rekan berulang tahun`;
}
