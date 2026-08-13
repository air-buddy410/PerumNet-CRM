import { db } from "@/lib/db";
import { avatarPath } from "@/lib/avatar";
import { isBirthdayToday, greetingFor, type BirthdayPerson } from "@/lib/birthday";

// Pembacaan ulang tahun untuk dashboard (Fase 59).
//
// Penyaringannya dilakukan di aplikasi, bukan di SQL. Alasannya: aturan 29
// Februari tidak bisa ditulis rapi sebagai kueri, dan jumlah pegawai PerumNet
// puluhan — bukan puluhan ribu. Menukar kejelasan dengan kecepatan di sini
// adalah tukar-tambah yang merugi.

export interface BirthdayToday extends BirthdayPerson {
  greeting: string;
}

/**
 * Siapa yang berulang tahun hari ini.
 *
 * Hanya pegawai AKTIF. Orang yang sudah keluar tidak diucapkan selamat di
 * papan pengumuman kantor — dan menampilkannya justru memberitahu semua orang
 * bahwa datanya masih ada di sistem.
 */
export async function birthdaysToday(now: Date = new Date()): Promise<BirthdayToday[]> {
  const kandidat = await db.employee.findMany({
    where: { isActive: true, birthDate: { not: null } },
    select: {
      id: true,
      fullName: true,
      jobTitle: true,
      birthDate: true,
      division: { select: { name: true } },
      user: { select: { avatarToken: true, isActive: true } },
    },
    orderBy: { fullName: "asc" },
  });

  return kandidat
    .filter((e) => e.birthDate && isBirthdayToday(e.birthDate, now))
    .map((e) => ({
      employeeId: e.id,
      fullName: e.fullName,
      jobTitle: e.jobTitle,
      divisionName: e.division?.name ?? null,
      // Foto PROFIL, bukan foto resmi kartu pegawai. Yang resmi milik HRD dan
      // tempatnya di kartu, bukan di papan ucapan selamat.
      avatarUrl: e.user?.isActive ? avatarPath(e.user.avatarToken) : null,
      greeting: greetingFor(e.fullName),
    }));
}
