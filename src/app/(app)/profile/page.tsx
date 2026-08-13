import { notFound } from "next/navigation";
import { requireUser } from "@/lib/rbac";
import { profileView } from "@/lib/profile";
import { initialsOf } from "@/lib/avatar";
import { BLOOD_TYPES, EDUCATION_LEVELS, JOB_LEVELS, USER_LEVEL_LABELS } from "@/lib/constants";
import { PageHeader, Flash } from "@/components/ui";
import { ProfileContactForm } from "@/components/profile-contact-form";
import { ProfilePasswordForm } from "@/components/profile-password-form";
import { ProfileAvatarForm } from "@/components/profile-avatar-form";
import { formatUiDate } from "@/components/ui-formatters";
import { BadgeCheck, BriefcaseBusiness, Building2, KeyRound, LockKeyhole, Mail, Phone, ShieldCheck, UserRound } from "lucide-react";
import { changePasswordAction, removeAvatarAction, updateContactAction, uploadAvatarAction } from "./actions";

export const metadata = { title: "Profil" };

const employeeTypeLabels: Record<string, string> = {
  FULL_TIME: "Karyawan tetap",
  PART_TIME: "Paruh waktu",
  CONTRACT: "Kontrak",
  PROBATION: "Masa percobaan",
};

const workPatternLabels: Record<string, string> = {
  SHIFT: "Shift",
  NON_SHIFT: "Non-shift",
};

const jobLevelLabels = Object.fromEntries(JOB_LEVELS) as Record<string, string>;
const educationLabels = Object.fromEntries(EDUCATION_LEVELS) as Record<string, string>;
const bloodTypeLabels = Object.fromEntries(BLOOD_TYPES) as Record<string, string>;

function formatJoinedAt(value: string | null | undefined) {
  return formatUiDate(value);
}

function ProfileField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="crm-profile-field">
      <dt>{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const sessionUser = await requireUser();
  const sp = await searchParams;
  const profile = await profileView(sessionUser.id);
  if (!profile) notFound();

  const { user, employee, auth } = profile;
  const isOidcIdentity = auth.provider === "OIDC";
  const providerLabel = auth.provider === "MAILSERVER"
    ? "Identity mailserver terpusat"
    : auth.provider === "OIDC"
      ? "Identity Authentik terpusat"
      : "Akun CRM lokal";

  return (
    <div className="crm-profile-page">
      <PageHeader
        title="Profil Saya"
        subtitle="Kelola informasi kontak dan lihat status akses akun Anda."
      />
      <Flash ok={sp.ok} error={sp.error} />

      <section className="crm-profile-hero card" aria-labelledby="profile-overview-title">
        <div className="crm-profile-avatar" role="img" aria-label={user.avatarUrl ? "Foto profil aplikasi" : `Inisial ${initialsOf(user.name)}`}>
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt={`Foto profil ${user.name}`} />
          ) : (
            <span aria-hidden="true">{initialsOf(user.name)}</span>
          )}
        </div>
        <div className="crm-profile-hero-copy">
          <span className="crm-profile-eyebrow">Identitas akun</span>
          <h2 id="profile-overview-title">{user.name}</h2>
          <p>@{user.username} · {user.email}</p>
          <div className="crm-profile-status-row">
            <span className={`crm-profile-status ${user.isActive ? "is-active" : "is-inactive"}`}>
              <span aria-hidden="true" />
              {user.isActive ? "Akun aktif" : "Akun nonaktif"}
            </span>
            <span className="crm-profile-auth-source"><Mail aria-hidden="true" /> {providerLabel}</span>
          </div>
          <p className="crm-profile-avatar-note">Foto ini hanya untuk tampilan aplikasi, bukan foto resmi kartu pegawai.</p>
          <ProfileAvatarForm
            currentUrl={user.avatarUrl}
            uploadAction={uploadAvatarAction}
            removeAction={removeAvatarAction}
          />
        </div>
      </section>

      <div className="crm-profile-grid">
        <section className="crm-profile-card card" aria-labelledby="account-data-title">
          <div className="crm-profile-card-heading">
            <span className="crm-profile-card-icon"><UserRound aria-hidden="true" /></span>
            <div><h2 id="account-data-title">Data akun</h2><p>Identitas dasar yang terdaftar pada sistem.</p></div>
          </div>
          <dl className="crm-profile-fields">
            <ProfileField label="Nama" value={user.name} />
            <ProfileField label="Username" value={`@${user.username}`} />
            <ProfileField label="Email" value={user.email} />
            <ProfileField label="Divisi" value={user.divisionName} />
          </dl>
        </section>

        <section className="crm-profile-card card" aria-labelledby="employee-data-title">
          <div className="crm-profile-card-heading">
            <span className="crm-profile-card-icon"><BriefcaseBusiness aria-hidden="true" /></span>
            <div><h2 id="employee-data-title">Data pegawai</h2><p>Informasi kepegawaian yang tertaut ke akun.</p></div>
          </div>
          {employee ? (
            <dl className="crm-profile-fields">
              <ProfileField label="NIK / No. pegawai" value={employee.employeeNo} />
              <ProfileField label="Nama lengkap" value={employee.fullName} />
              <ProfileField label="Jabatan" value={employee.jobTitle} />
              <ProfileField label="Jenis karyawan" value={employeeTypeLabels[employee.employeeType] ?? employee.employeeType} />
              <ProfileField label="Tanggal bergabung" value={formatJoinedAt(employee.joinedAt)} />
              <ProfileField label="Atasan" value={employee.supervisorName} />
              <ProfileField label="Alamat" value={employee.address} />
              <ProfileField label="Pola kerja" value={workPatternLabels[employee.workPattern] ?? employee.workPattern} />
              <ProfileField label="Jenjang jabatan" value={jobLevelLabels[employee.jobLevel] ?? employee.jobLevel} />
              <ProfileField label="Mulai kontrak" value={formatJoinedAt(employee.contractStartAt)} />
              <ProfileField label="Berakhir kontrak" value={formatJoinedAt(employee.contractEndAt)} />
              <ProfileField label="Tempat lahir" value={employee.birthPlace} />
              <ProfileField label="Tanggal lahir" value={formatJoinedAt(employee.birthDate)} />
              <ProfileField label="Pendidikan terakhir" value={employee.education ? (educationLabels[employee.education] ?? employee.education) : null} />
              <ProfileField label="Golongan darah" value={employee.bloodType ? (bloodTypeLabels[employee.bloodType] ?? employee.bloodType) : null} />
            </dl>
          ) : <div className="crm-profile-empty">Belum ada data pegawai yang tertaut ke akun ini.</div>}
        </section>

        <section className="crm-profile-card card" aria-labelledby="contact-data-title">
          <div className="crm-profile-card-heading">
            <span className="crm-profile-card-icon"><Phone aria-hidden="true" /></span>
            <div><h2 id="contact-data-title">Kontak</h2><p>Nama tampilan dan nomor telepon untuk kebutuhan operasional.</p></div>
          </div>
          <ProfileContactForm initialName={user.name} initialPhone={user.phone} updateAction={updateContactAction} />
        </section>

        <section className="crm-profile-card card" aria-labelledby="access-data-title">
          <div className="crm-profile-card-heading">
            <span className="crm-profile-card-icon"><ShieldCheck aria-hidden="true" /></span>
            <div><h2 id="access-data-title">Role & akses</h2><p>Read-only agar perubahan akses tetap melalui kontrol RBAC.</p></div>
          </div>
          <dl className="crm-profile-fields">
            <ProfileField label="Role" value={user.roles.join(", ")} />
            <ProfileField label="Level" value={USER_LEVEL_LABELS[user.level] ?? user.level} />
            <ProfileField label="Divisi" value={user.divisionName} />
            <div className="crm-profile-field crm-profile-field-wide"><dt>Source autentikasi</dt><dd><KeyRound aria-hidden="true" /> {auth.provider}</dd></div>
          </dl>
        </section>
      </div>

      <section className="crm-profile-password card" aria-labelledby="password-title">
        <div className="crm-profile-card-heading">
          <span className="crm-profile-card-icon"><LockKeyhole aria-hidden="true" /></span>
          <div><h2 id="password-title">Password akun</h2><p>Password mengikuti penyedia identitas yang aktif.</p></div>
          <span className="crm-profile-contract-badge"><BadgeCheck aria-hidden="true" /> {auth.provider}</span>
        </div>
        <div className="crm-profile-password-body">
          {isOidcIdentity ? (
            <div className="crm-profile-password-note"><Building2 aria-hidden="true" /><p>Password dikelola oleh {providerLabel.toLowerCase()}. CRM tidak menyimpan, menampilkan, atau mengirim password identity terpusat.</p></div>
          ) : auth.passwordChangeAvailable ? (
            <div className="crm-profile-password-local"><p>{auth.provider === "MAILSERVER" ? "Ganti password di sini untuk memperbarui password email, CRM, dan webmail. Sesi aktif akan diperbarui setelah berhasil." : "Anda dapat mengganti password akun CRM lokal. Sesi aktif akan diperbarui setelah berhasil."}</p><ProfilePasswordForm action={changePasswordAction} /></div>
          ) : (
            <div className="crm-profile-password-note"><Building2 aria-hidden="true" /><p>Perubahan password belum tersedia untuk penyedia identitas ini.</p></div>
          )}
        </div>
      </section>
    </div>
  );
}
