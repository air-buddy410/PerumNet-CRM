import crypto from "crypto";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth";
import { AUDIT_ACTIONS, PERMISSIONS, USER_LEVELS } from "@/lib/constants";
import { loadMailboxOverview } from "@/lib/mailserver";
import type { Fetcher } from "@/lib/mailcow";
import {
  suggestFromEmail,
  uniqueUsername,
  normalizePersonName,
  type MailboxSuggestion,
} from "@/lib/account-provision";
import { authProviderMode } from "@/lib/oidc";
import type { CurrentUser } from "@/lib/rbac";

// ── Pembuatan akun CRM massal dari kotak surat (Fase 52) ────────
//
// Masalah yang diselesaikan: ada 30-an kotak surat di mailcow dan nyaris tidak
// ada akun CRM. Mengetiknya satu per satu berarti tiga puluh kali mengetik
// alamat email — dan salah ketik alamat adalah penyebab gagal nomor satu pada
// sinkronisasi mailbox, karena alamat itulah satu-satunya kunci pencocokan.
//
// Yang TIDAK dilakukan, dan ini disengaja: tidak ada pembuatan otomatis.
// Kotak surat tidak pernah berubah menjadi akun dengan sendirinya. Sistem
// menyiapkan usulan selengkap mungkin — nama, username, divisi dari data
// HRD — lalu MANUSIA yang mencentang dan memilih perannya.
//
// Alasannya bukan kehati-hatian abstrak: dari 32 kotak surat di PerumNet, 8 di
// antaranya bukan orang (helpdesk@, no-reply@, sales@, ...). Pembuatan
// otomatis akan melahirkan delapan akun yang bisa login tanpa ada orangnya.
// Dan peran — kewenangan sebenarnya — tidak bisa ditebak dari alamat email
// oleh siapa pun, termasuk mesin.

export interface AccountCandidate extends MailboxSuggestion {
  /** Pegawai yang namanya cocok PERSIS, bila ada. */
  employee: {
    id: string;
    employeeNo: string;
    fullName: string;
    jobTitle: string | null;
    divisionId: string | null;
    divisionName: string | null;
  } | null;
  /** Username yang dijamin belum dipakai. */
  username: string;
  /** Divisi usulan — dari data HRD bila pegawainya ketemu. */
  suggestedDivisionId: string | null;
  /** Usulan centang awal di layar. IT tetap bisa membalikkannya. */
  suggestedSelected: boolean;
}

export interface CandidateList {
  candidates: AccountCandidate[];
  /** Kotak surat yang sudah punya akun — tidak perlu ditampilkan, tapi jumlahnya berguna. */
  alreadyHaveAccount: number;
  divisions: { id: string; code: string; name: string }[];
  roles: { id: string; code: string; name: string }[];
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Menyusun daftar calon akun dari kotak surat yang belum punya akun CRM.
 *
 * Divisi diambil dari data PEGAWAI (isian HRD), bukan dari tag mailcow.
 * Membacanya dari mailcow akan membalik arah otoritas yang sudah ditetapkan:
 * siapa pun yang bisa mengedit tag kotak surat akan ikut menentukan divisi —
 * dan divisi menentukan grup Authentik serta akses ke aplikasi lain.
 */
export async function listAccountCandidates(
  user: CurrentUser,
  /** Disuntik pada tes supaya seluruh aturan di sini teruji tanpa mailserver. */
  fetcher?: Fetcher
): Promise<Result<CandidateList>> {
  if (!user.permissions.has(PERMISSIONS.USERS_CREATE)) {
    return { ok: false, error: "Anda tidak berwenang membuat akun pengguna." };
  }

  let overview: Awaited<ReturnType<typeof loadMailboxOverview>>;
  try {
    overview = await loadMailboxOverview(fetcher);
  } catch (e) {
    return { ok: false, error: `Tidak bisa membaca kotak surat: ${(e as Error).message}` };
  }

  const missing = overview.rows.filter((r) => r.state === "NO_CRM_ACCOUNT");
  const suggestions = missing.map((r) => suggestFromEmail(r.email));

  const [existingUsers, employees, divisions, roles] = await Promise.all([
    db.user.findMany({ select: { username: true } }),
    db.employee.findMany({
      where: { isActive: true, userId: null },
      select: {
        id: true,
        employeeNo: true,
        fullName: true,
        jobTitle: true,
        divisionId: true,
        division: { select: { name: true } },
      },
    }),
    db.division.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.role.findMany({ select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const taken = new Set(existingUsers.map((u) => u.username.toLowerCase()));
  // Nama pegawai yang KEMBAR tidak dipakai untuk menautkan apa pun. Menautkan
  // ke salah satunya berarti memberi akun kepada orang yang salah, dan tidak
  // ada di layar yang menunjukkan itu terjadi.
  const byName = new Map<string, (typeof employees)[number][]>();
  for (const e of employees) {
    const key = normalizePersonName(e.fullName);
    byName.set(key, [...(byName.get(key) ?? []), e]);
  }

  const candidates: AccountCandidate[] = suggestions.map((s) => {
    const matches = byName.get(normalizePersonName(s.suggestedName)) ?? [];
    const employee = matches.length === 1 ? matches[0] : null;
    const username = uniqueUsername(s.suggestedUsername, taken);
    taken.add(username);
    return {
      ...s,
      employee: employee
        ? {
            id: employee.id,
            employeeNo: employee.employeeNo,
            fullName: employee.fullName,
            jobTitle: employee.jobTitle,
            divisionId: employee.divisionId,
            divisionName: employee.division?.name ?? null,
          }
        : null,
      username,
      suggestedDivisionId: employee?.divisionId ?? null,
      // Tercentang bila kelihatan seperti orang. Alamat fungsi dibiarkan
      // kosong — bukan disembunyikan, supaya IT bisa membalikkannya.
      suggestedSelected: !s.likelyShared,
    };
  });

  return {
    ok: true,
    data: {
      candidates,
      alreadyHaveAccount: overview.rows.length - missing.length,
      divisions,
      roles,
    },
  };
}

export interface NewAccountInput {
  email: string;
  name: string;
  username: string;
  level: string;
  divisionId: string | null;
  roleIds: string[];
  /** Pegawai yang ditautkan ke akun ini, bila ada. */
  employeeId: string | null;
}

export interface ProvisionOutcome {
  created: { email: string; username: string; linkedEmployeeNo: string | null }[];
}

/**
 * Membuat akun-akun yang sudah dipilih IT.
 *
 * Sama seperti impor pegawai: SEMUA ATAU TIDAK SAMA SEKALI. Seluruh isian
 * diperiksa lebih dulu; satu yang bermasalah menahan semuanya. Pembuatan akun
 * separuh jalan menyisakan pertanyaan "yang mana tadi yang sudah jadi?", dan
 * jawabannya harus dicari manual satu per satu.
 */
export async function createAccountsFromMailboxes(
  user: CurrentUser,
  inputs: NewAccountInput[]
): Promise<Result<ProvisionOutcome>> {
  if (!user.permissions.has(PERMISSIONS.USERS_CREATE)) {
    return { ok: false, error: "Anda tidak berwenang membuat akun pengguna." };
  }
  if (!inputs.length) return { ok: false, error: "Belum ada kotak surat yang dipilih." };

  const problems: string[] = [];
  const seenEmail = new Set<string>();
  const seenUsername = new Set<string>();

  for (const i of inputs) {
    const email = i.email.trim().toLowerCase();
    const label = email || "(tanpa alamat)";
    if (!email) problems.push("Ada baris tanpa alamat email.");
    if (!i.name?.trim()) problems.push(`${label}: nama wajib diisi.`);
    if (!i.username?.trim()) problems.push(`${label}: username wajib diisi.`);
    if (!i.roleIds?.length) problems.push(`${label}: pilih minimal satu peran.`);
    if (!Object.values(USER_LEVELS).includes(i.level as never)) {
      problems.push(`${label}: level "${i.level}" tidak dikenal.`);
    }
    // Aturan yang sama dengan form pembuatan user satuan — dipinjam, bukan
    // ditulis ulang, supaya jalur massal tidak diam-diam lebih longgar.
    if (i.level !== USER_LEVELS.OWNER && !i.divisionId) {
      problems.push(`${label}: Staff dan Supervisor wajib punya divisi.`);
    }
    if (seenEmail.has(email)) problems.push(`${label}: muncul dua kali dalam pilihan.`);
    seenEmail.add(email);
    const uname = i.username.trim().toLowerCase();
    if (seenUsername.has(uname)) problems.push(`${label}: username "${uname}" dipakai dua kali.`);
    seenUsername.add(uname);
  }
  if (problems.length) return { ok: false, error: problems.join(" ") };

  const clash = await db.user.findFirst({
    where: { OR: [{ email: { in: [...seenEmail] } }, { username: { in: [...seenUsername] } }] },
    select: { email: true, username: true },
  });
  if (clash) {
    return { ok: false, error: `Sudah ada akun dengan email ${clash.email} atau username ${clash.username}.` };
  }

  const employeeIds = inputs.map((i) => i.employeeId).filter((v): v is string => !!v);
  if (employeeIds.length) {
    const taken = await db.employee.findFirst({
      where: { id: { in: employeeIds }, userId: { not: null } },
      select: { employeeNo: true },
    });
    if (taken) {
      return { ok: false, error: `Pegawai ${taken.employeeNo} sudah tertaut ke akun lain.` };
    }
  }

  const created: ProvisionOutcome["created"] = [];
  for (const i of inputs) {
    const email = i.email.trim().toLowerCase();
    // Password acak yang TIDAK PERNAH ditampilkan ke siapa pun. Login memakai
    // penyedia identitas, jadi nilai ini memang tidak dipakai — ia ada supaya
    // kolomnya tidak kosong, dan diberi tanda wajib-ganti seandainya suatu
    // saat login lokal dihidupkan lagi.
    const passwordHash = await hashPassword(crypto.randomBytes(24).toString("base64url"));
    const account = await db.user.create({
      data: {
        name: i.name.trim(),
        username: i.username.trim().toLowerCase(),
        email,
        level: i.level,
        divisionId: i.divisionId ?? null,
        passwordHash,
        // Wajib-ganti HANYA berlaku bila CRM memang yang menerbitkan
        // kredensialnya. Di mode MAILSERVER tidak: yang dipakai masuk adalah
        // password EMAIL yang sudah lama dipegang orangnya sendiri, dan
        // password lokal di sini acak serta tidak pernah dipakai siapa pun.
        //
        // Menyalakannya di mode itu memunculkan peringatan "ganti password
        // dulu" kepada orang yang tidak pernah diberi password apa pun — dan
        // mendorongnya mengganti password EMAIL tanpa sebab.
        mustChangePassword: authProviderMode() !== "MAILSERVER",
        roles: { create: i.roleIds.map((roleId) => ({ roleId })) },
      },
    });

    let linkedEmployeeNo: string | null = null;
    if (i.employeeId) {
      const emp = await db.employee.update({
        where: { id: i.employeeId },
        data: { userId: account.id },
        select: { employeeNo: true },
      });
      linkedEmployeeNo = emp.employeeNo;
    }

    await logAudit({
      userId: user.id,
      action: AUDIT_ACTIONS.USER_CREATE,
      module: "users",
      entityType: "User",
      entityId: account.id,
      description:
        `Membuat akun "${account.username}" (${account.name}) dari kotak surat ${email}` +
        (linkedEmployeeNo ? `, ditautkan ke pegawai ${linkedEmployeeNo}` : ""),
      metadata: { roleIds: i.roleIds, source: "mailbox" },
    });
    created.push({ email, username: account.username, linkedEmployeeNo });
  }

  return { ok: true, data: { created } };
}
