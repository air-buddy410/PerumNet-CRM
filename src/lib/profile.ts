import { db } from "@/lib/db";
import { authProviderMode } from "@/lib/oidc";
import { logAudit } from "@/lib/audit";
import type { CurrentUser } from "@/lib/rbac";

// ── Profil & identitas (Fase 34, PRD Frontend §10, §11, §13) ────
//
// Bentuk `ProfileView` mengikuti kontrak frontend apa adanya.
//
// Soal identitas (diperbarui Fase 45): nilai yang dilaporkan mengikuti
// AUTH_PROVIDER yang benar-benar aktif, bukan yang dicita-citakan.
//
//   LOCAL      — password ada di tabel User sebagai hash bcrypt; ganti
//                password bekerja sungguhan.
//   OIDC       — kredensial milik penyedia identitas (Authentik). CRM tidak
//                pernah memegangnya, jadi ganti password ditutup.
//   MAILSERVER — sama seperti OIDC dari sudut pandang UI: bukan milik CRM.
//
// Menutup ganti password bukan sekadar menyembunyikan tombol: server pun
// menolaknya. Tanpa itu, orang bisa mengubah hash lokal lalu merasa aman
// padahal kredensial yang sebenarnya dipakai tidak berubah sama sekali.

export type AuthProvider = "MAILSERVER" | "LOCAL" | "OIDC";

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
    // Fase 41, ditambahkan ke DTO pada Fase 49a atas permintaan frontend.
    // Semuanya HANYA BACA di sini: halaman profil tidak boleh mengubah data
    // kepegawaian — itu urusan HRD lewat modulnya sendiri, dengan izinnya
    // sendiri. Lihat updateOwnContact() di bawah: hanya nama dan telepon.
    address: string | null;
    workPattern: string;
    jobLevel: string;
    /// Keduanya null untuk yang bukan karyawan kontrak — dibedakan dari
    /// "kontrak tanpa tanggal", yang tidak mungkin ada karena ditolak
    /// contractRejection() saat penyimpanan.
    contractStartAt: string | null;
    contractEndAt: string | null;
  } | null;
  auth: {
    provider: AuthProvider;
    passwordChangeAvailable: boolean;
  };
}

export function authProvider(): AuthProvider {
  // Fase 45 — nilai OIDC menyusul MAILSERVER: keduanya sama-sama berarti
  // kredensialnya BUKAN milik CRM, jadi keduanya menutup ganti password.
  return authProviderMode();
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
          address: user.employee.address,
          workPattern: user.employee.workPattern,
          jobLevel: user.employee.jobLevel,
          contractStartAt: user.employee.contractStartAt?.toISOString() ?? null,
          contractEndAt: user.employee.contractEndAt?.toISOString() ?? null,
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
