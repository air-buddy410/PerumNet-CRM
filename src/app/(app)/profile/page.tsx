import { notFound } from "next/navigation";
import { requireUser } from "@/lib/rbac";
import { profileView } from "@/lib/profile";
import { USER_LEVEL_LABELS } from "@/lib/constants";
import { PageHeader, Flash } from "@/components/ui";
import { ProfileContactForm } from "@/components/profile-contact-form";
import { ProfilePasswordForm } from "@/components/profile-password-form";
import { BadgeCheck, BriefcaseBusiness, Building2, KeyRound, LockKeyhole, Mail, Phone, ShieldCheck, UserRound } from "lucide-react";
import { updateContactAction, changePasswordAction } from "./actions";

export const metadata = { title: "Profil" };

const employeeTypeLabels: Record<string, string> = {
  FULL_TIME: "Karyawan tetap",
  PART_TIME: "Paruh waktu",
  CONTRACT: "Kontrak",
  PROBATION: "Masa percobaan",
};

function formatJoinedAt(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
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
  const isMailserver = auth.provider === "MAILSERVER";
  const providerLabel = isMailserver ? "Identity mailserver terpusat" : "Akun CRM lokal";

  return (
    <div className="crm-profile-page">
      <PageHeader
        title="Profil Saya"
        subtitle="Kelola informasi kontak dan lihat status akses akun Anda."
      />
      <Flash ok={sp.ok} error={sp.error} />

      <section className="crm-profile-hero card" aria-labelledby="profile-overview-title">
        <div className="crm-profile-avatar" aria-hidden="true">
          {user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}
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
          {isMailserver ? (
            <div className="crm-profile-password-note"><Building2 aria-hidden="true" /><p>Password dikelola oleh identity mailserver terpusat. CRM tidak menyimpan, menampilkan, atau mengirim password email.</p></div>
          ) : auth.passwordChangeAvailable ? (
            <div className="crm-profile-password-local"><p>Anda dapat mengganti password akun CRM lokal. Sesi aktif akan diperbarui setelah berhasil.</p><ProfilePasswordForm action={changePasswordAction} /></div>
          ) : (
            <div className="crm-profile-password-note"><Building2 aria-hidden="true" /><p>Perubahan password belum tersedia untuk penyedia identitas ini.</p></div>
          )}
        </div>
      </section>
    </div>
  );
}
