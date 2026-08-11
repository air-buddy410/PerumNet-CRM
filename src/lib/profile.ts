import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import type { CurrentUser } from "@/lib/rbac";

// ── Profil & identitas (Fase 34, PRD Frontend §10, §11, §13) ────
//
// Bentuk `ProfileView` mengikuti kontrak frontend apa adanya.
//
// Soal identitas: hari ini autentikasi CRM bersifat LOKAL — password ada di
// tabel User sebagai hash bcrypt, dan `changePasswordAction` benar-benar
// bekerja. PRD frontend §11 menyebut rencana identitas terpusat lewat
// mailserver/LDAP, tetapi antarmuka resminya BELUM ADA. Yang dilaporkan di
// sini karena itu adalah keadaan sebenarnya, bukan keadaan yang dicita-citakan
// — melaporkan MAILSERVER sekarang berarti berbohong kepada UI.
//
// Ketika penyedia identitas resmi dipasang, cukup set AUTH_PROVIDER=MAILSERVER:
// tombol ganti password otomatis menjadi nonaktif sampai adapter-nya ditulis,
// dan CRM tidak akan pernah menerima password mailserver sebagai nilai biasa.

export type AuthProvider = "MAILSERVER" | "LOCAL";

export interface ProfileView {
  user: {
    id: string;
    name: string;
    username: string;
    email: string;
    phone: string | null;
    roles: string[];
    level: string;
    divisionName: string | null;
    isActive: boolean;
  };
  employee: {
    employeeNo: string;
    fullName: string;
    jobTitle: string | null;
    employeeType: string;
    joinedAt: string;
    supervisorName: string | null;
  } | null;
  auth: {
    provider: AuthProvider;
    passwordChangeAvailable: boolean;
  };
}

export function authProvider(): AuthProvider {
  return process.env.AUTH_PROVIDER === "MAILSERVER" ? "MAILSERVER" : "LOCAL";
}

/**
 * Ganti password hanya tersedia bila CRM memang pemilik kredensialnya.
 * Untuk identitas terpusat, jawabannya false sampai adapter resmi ada —
 * bukan diarahkan ke jalur lokal, karena itu akan mengubah password yang
 * salah dan memberi rasa aman palsu.
 */
export function passwordChangeAvailable(): boolean {
  return authProvider() === "LOCAL";
}

export async function profileView(userId: string): Promise<ProfileView | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      division: true,
      roles: { include: { role: true } },
      employee: { include: { supervisor: { select: { fullName: true } } } },
    },
  });
  if (!user) return null;

  return {
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      phone: user.phone,
      roles: user.roles.map((r) => r.role.name),
      level: user.level,
      divisionName: user.division?.name ?? null,
      isActive: user.isActive,
    },
    employee: user.employee
      ? {
          employeeNo: user.employee.employeeNo,
          fullName: user.employee.fullName,
          jobTitle: user.employee.jobTitle,
          employeeType: user.employee.employeeType,
          joinedAt: user.employee.joinedAt.toISOString(),
          supervisorName: user.employee.supervisor?.fullName ?? null,
        }
      : null,
    auth: {
      provider: authProvider(),
      passwordChangeAvailable: passwordChangeAvailable(),
    },
  };
}

type Result = { ok: true; id: string } | { ok: false; error: string };

/**
 * Memperbarui kontak milik sendiri — nama tampilan dan nomor telepon.
 *
 * Sengaja TIDAK menerima userId: satu-satunya akun yang bisa diubah lewat
 * jalur ini adalah milik pemanggil. Field lain (email, username, role,
 * divisi, NIK, jabatan) tidak dapat disentuh dari sini sesuai §10 — semuanya
 * punya konsekuensi RBAC atau kepegawaian dan harus lewat modul masing-masing.
 */
export async function updateOwnContact(
  user: CurrentUser,
  data: { name: string; phone: string | null }
): Promise<Result> {
  const name = data.name?.trim();
  if (!name) return { ok: false, error: "Nama tampilan wajib diisi." };
  if (name.length > 100) return { ok: false, error: "Nama tampilan terlalu panjang." };

  const phone = data.phone?.trim() || null;
  if (phone && !/^[0-9+()\s-]{6,25}$/.test(phone)) {
    return { ok: false, error: "Nomor telepon tidak valid." };
  }

  const before = await db.user.findUnique({
    where: { id: user.id },
    select: { name: true, phone: true },
  });
  if (!before) return { ok: false, error: "Akun tidak ditemukan." };
  if (before.name === name && before.phone === phone) {
    return { ok: false, error: "Tidak ada perubahan untuk disimpan." };
  }

  await db.user.update({ where: { id: user.id }, data: { name, phone } });
  await logAudit({
    userId: user.id,
    action: "PROFILE_CONTACT_UPDATE",
    module: "users",
    entityType: "User",
    entityId: user.id,
    description:
      `Memperbarui kontak sendiri: nama "${before.name}" → "${name}", ` +
      `telepon "${before.phone ?? "-"}" → "${phone ?? "-"}"`,
  });
  return { ok: true, id: user.id };
}
