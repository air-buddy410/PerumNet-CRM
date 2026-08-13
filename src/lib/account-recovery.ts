import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { notifyPermission } from "@/lib/notify";
import { PERMISSIONS } from "@/lib/constants";
import { smtpConfig, smtpBlocker, sendMailSmtp, isPlainEmail, type MailSender } from "@/lib/smtp";

// ── Permintaan pemulihan akses (Fase 55) ────────────────────────
//
// Kenapa ini bukan "reset password" biasa: di mode MAILSERVER, password yang
// hendak dipulihkan ITU password email. Alur reset yang normal mengirim
// tautan ke kotak surat — kotak surat yang justru sedang tidak bisa dibuka
// orangnya. Berputar, tidak ada ujungnya.
//
// Jadi yang dikerjakan di sini bukan memulihkan, melainkan MENYAMPAIKAN
// PERMINTAAN: IT diberi tahu, lalu IT yang mereset lewat mailcow.
//
// Email ke alamat pemohon SENGAJA tetap dikirim meski ia tidak bisa
// membacanya sekarang. Gunanya bukan pemulihan — melainkan supaya kalau
// ternyata ORANG LAIN yang mengajukan atas namanya, ia melihatnya dari
// perangkat yang masih tersambung, dan bisa segera melapor.

/** Jeda minimum antar permintaan untuk satu alamat yang sama. */
export const RECOVERY_COOLDOWN_MINUTES = 15;
/** Batas permintaan yang diproses seluruh sistem per jam. */
export const RECOVERY_HOURLY_CAP = 30;

export const RECOVERY_ACTION = "ACCOUNT_RECOVERY_REQUEST";

/** Ke mana permintaan diteruskan. */
export function itSupportEmail(): string {
  return (process.env.IT_SUPPORT_EMAIL ?? "it@perumnet.id").trim();
}

/**
 * Jawaban yang SELALU sama, apa pun yang terjadi di belakang.
 *
 * Membedakan "email terdaftar" dari "tidak terdaftar" mengubah formulir ini
 * menjadi alat pemeriksa: siapa pun bisa mencoba daftar alamat dan mengetahui
 * mana yang benar-benar karyawan PerumNet. Karena itu pesannya tunggal, dan
 * fungsinya tidak pernah mengembalikan kegagalan.
 */
export const RECOVERY_REPLY =
  "Permintaan Anda sudah diteruskan ke tim IT. Bila alamat tersebut terdaftar, " +
  "tim IT akan menghubungi Anda untuk memulihkan akses. Mohon tunggu tanpa mengirim ulang.";

export interface RecoveryDeps {
  sender?: MailSender;
  now?: Date;
}

function waktuIndonesia(d: Date): string {
  return d.toLocaleString("id-ID", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Makassar" });
}

/** Surat untuk tim IT. */
export function itEmailBody(o: {
  nama: string;
  email: string;
  username: string;
  nik: string | null;
  divisi: string | null;
  waktu: Date;
}): string {
  return [
    "Kepada Tim IT PerumNet,",
    "",
    "Sebuah permintaan pemulihan akses telah diterima melalui halaman masuk PerumNet CRM.",
    "Berikut rinciannya:",
    "",
    `    Nama pengguna   : ${o.nama}`,
    `    Alamat email    : ${o.email}`,
    `    Nama akun       : ${o.username}`,
    `    NIK             : ${o.nik ?? "-"}`,
    `    Divisi          : ${o.divisi ?? "-"}`,
    `    Waktu permintaan: ${waktuIndonesia(o.waktu)} WITA`,
    "",
    "Tindakan yang diperlukan:",
    "",
    "  1. Pastikan lebih dahulu bahwa permintaan ini benar berasal dari yang bersangkutan.",
    "     Hubungi melalui jalur yang sudah dikenal — bukan membalas email ini.",
    "  2. Setelah dipastikan, atur ulang kata sandi surel yang bersangkutan.",
    "  3. Sampaikan kata sandi sementara melalui jalur langsung, dan mintakan",
    "     penggantian pada kesempatan pertama melalui menu Profil.",
    "",
    "Permintaan ini tidak mengubah apa pun secara otomatis. Tidak ada kata sandi",
    "yang telah diatur ulang oleh sistem.",
    "",
    "Hormat kami,",
    "PerumNet CRM",
    "",
    "— Pesan ini dibangkitkan otomatis oleh sistem. Mohon tidak dibalas.",
  ].join("\n");
}

/** Surat pemberitahuan untuk pemilik akun. */
export function userEmailBody(o: { nama: string; waktu: Date }): string {
  return [
    `Yth. ${o.nama},`,
    "",
    "Kami menerima permintaan pemulihan akses untuk akun PerumNet CRM Anda pada",
    `${waktuIndonesia(o.waktu)} WITA.`,
    "",
    "Permintaan tersebut telah diteruskan kepada tim IT. Tim kami akan menghubungi",
    "Anda untuk memastikan identitas sebelum melakukan pemulihan. Tidak ada kata sandi",
    "yang berubah sampai langkah tersebut selesai.",
    "",
    "Apabila permintaan ini BUKAN berasal dari Anda:",
    "",
    "    Mohon segera hubungi tim IT PerumNet. Adanya permintaan atas nama Anda",
    "    tanpa sepengetahuan Anda perlu ditindaklanjuti, meskipun tidak ada",
    "    perubahan yang terjadi pada akun Anda.",
    "",
    "Demikian pemberitahuan ini kami sampaikan.",
    "",
    "Hormat kami,",
    "Tim IT PerumNet",
    "",
    "— Pesan ini dibangkitkan otomatis oleh sistem. Mohon tidak dibalas.",
  ].join("\n");
}

/**
 * Menerima permintaan pemulihan akses dari halaman masuk.
 *
 * SELALU mengembalikan jawaban yang sama — lihat RECOVERY_REPLY. Yang berbeda
 * hanyalah apa yang terjadi di belakang, dan itu tidak boleh terlihat dari luar.
 */
export async function requestAccountRecovery(
  rawEmail: string,
  deps: RecoveryDeps = {}
): Promise<{ ok: true; message: string }> {
  const now = deps.now ?? new Date();
  const sender = deps.sender ?? sendMailSmtp;
  const email = (rawEmail ?? "").trim().toLowerCase();
  const jawaban = { ok: true as const, message: RECOVERY_REPLY };

  // Bentuk yang jelas salah dihentikan di sini — tapi jawabannya tetap sama.
  if (!isPlainEmail(email)) return jawaban;

  // ── Pagar penyalahgunaan ──
  // Formulir ini bisa dipanggil tanpa login. Tanpa pagar, ia menjadi alat
  // membanjiri kotak surat IT maupun kotak surat seorang karyawan.
  const sejakCooldown = new Date(now.getTime() - RECOVERY_COOLDOWN_MINUTES * 60_000);
  const baruSaja = await db.auditLog.count({
    where: { action: RECOVERY_ACTION, description: { contains: email }, createdAt: { gte: sejakCooldown } },
  });
  if (baruSaja > 0) return jawaban;

  const sejakSejam = new Date(now.getTime() - 60 * 60_000);
  const totalSejam = await db.auditLog.count({
    where: { action: RECOVERY_ACTION, createdAt: { gte: sejakSejam } },
  });
  if (totalSejam >= RECOVERY_HOURLY_CAP) {
    await logAudit({
      action: "ACCOUNT_RECOVERY_THROTTLED",
      module: "auth",
      description: `Permintaan pemulihan ditahan — batas ${RECOVERY_HOURLY_CAP} per jam tercapai.`,
    });
    return jawaban;
  }

  const user = await db.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: {
      id: true, name: true, username: true, email: true, isActive: true,
      division: { select: { name: true } },
      employee: { select: { employeeNo: true } },
    },
  });

  // Alamat tak dikenal: dicatat, TIDAK dikirimi email. Mengirim email untuk
  // alamat sembarangan menjadikan formulir ini pengirim surat bagi siapa pun.
  if (!user || !user.isActive) {
    await logAudit({
      action: RECOVERY_ACTION,
      module: "auth",
      description: `Permintaan pemulihan untuk ${email} — tidak ada akun aktif dengan alamat itu.`,
    });
    return jawaban;
  }

  await logAudit({
    userId: user.id,
    action: RECOVERY_ACTION,
    module: "auth",
    entityType: "User",
    entityId: user.id,
    description: `Permintaan pemulihan akses untuk ${user.email} (${user.username}) diteruskan ke tim IT.`,
  });

  // Pemberitahuan dalam aplikasi lebih dulu: ia tidak bergantung pada SMTP,
  // jadi IT tetap tahu meski pengiriman email gagal.
  await notifyPermission(PERMISSIONS.USERS_EDIT, {
    type: "ACCOUNT_RECOVERY",
    title: "Permintaan pemulihan akses",
    body: `${user.name} (${user.email}) meminta pemulihan akses. Pastikan identitasnya sebelum mereset.`,
    link: `/settings/users/${user.id}`,
    module: "auth",
  });

  const cfg = smtpConfig();
  const blocker = smtpBlocker(cfg);
  if (!cfg || blocker) {
    await logAudit({
      action: "ACCOUNT_RECOVERY_MAIL_SKIPPED",
      module: "auth",
      description: `Email pemulihan tidak terkirim: ${blocker}. Pemberitahuan dalam aplikasi tetap terkirim.`,
    });
    return jawaban;
  }

  const it = itSupportEmail();
  const hasilIT = await sender(
    cfg,
    it,
    `[PerumNet CRM] Permintaan pemulihan akses — ${user.name}`,
    itEmailBody({
      nama: user.name,
      email: user.email,
      username: user.username,
      nik: user.employee?.employeeNo ?? null,
      divisi: user.division?.name ?? null,
      waktu: now,
    })
  );
  const hasilUser = await sender(
    cfg,
    user.email,
    "[PerumNet CRM] Permintaan pemulihan akses Anda telah diterima",
    userEmailBody({ nama: user.name, waktu: now })
  );

  if (!hasilIT.ok || !hasilUser.ok) {
    await logAudit({
      action: "ACCOUNT_RECOVERY_MAIL_FAILED",
      module: "auth",
      entityType: "User",
      entityId: user.id,
      description:
        `Pengiriman email pemulihan gagal sebagian — IT: ${hasilIT.ok ? "terkirim" : hasilIT.error}, ` +
        `pemohon: ${hasilUser.ok ? "terkirim" : hasilUser.error}. Pemberitahuan dalam aplikasi tetap terkirim.`,
    });
  }
  return jawaban;
}
