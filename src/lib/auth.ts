import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession, destroySession, getSession } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { notifyPermission } from "@/lib/notify";
import { AUDIT_ACTIONS, PERMISSIONS } from "@/lib/constants";
import { localLoginBlocker, isBreakGlassLogin } from "@/lib/oidc-rules";
import { verifyMailserverPassword } from "@/lib/mailserver";
import { authProviderMode } from "@/lib/oidc";

export async function login(
  identifier: string,
  password: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await db.user.findFirst({
    where: { OR: [{ username: identifier }, { email: identifier }] },
  });

  if (!user || !user.isActive) {
    await logAudit({
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      module: "auth",
      description: `Login gagal untuk "${identifier}" (user tidak ditemukan / nonaktif)`,
    });
    return { ok: false, error: "Username atau password salah." };
  }

  const provider = authProviderMode();

  // ── Di mana password diperiksa (Fase 53) ──────────────────────
  //
  // Mode MAILSERVER memindahkan pemeriksaan dari hash lokal ke mailserver:
  // yang sah adalah password EMAIL orang itu. Hash lokal tetap dipakai untuk
  // akun darurat (allowLocalLogin) — kalau tidak, mailserver yang mati berarti
  // tidak ada seorang pun bisa masuk untuk membetulkannya.
  //
  // Tidak ada jalan mundur diam-diam. Mailserver tak terjawab berarti login
  // GAGAL, bukan jatuh kembali ke hash lokal — jatuh balik seperti itu membuat
  // mematikan mailbox tidak lagi berarti mencabut akses.
  const lewatMailserver = provider === "MAILSERVER" && !user.allowLocalLogin;

  if (lewatMailserver) {
    const hasil = await verifyMailserverPassword(user.email, password);
    if (!hasil.ok) {
      await logAudit({
        userId: user.id,
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        module: "auth",
        // Password tidak pernah ikut dicatat — di sini pun tidak.
        description:
          hasil.reason === "REJECTED"
            ? `Login gagal untuk "${user.username}" (ditolak mailserver)`
            : `Login gagal untuk "${user.username}" (mailserver tidak terjawab: ${hasil.detail})`,
      });
      return {
        ok: false,
        error:
          hasil.reason === "REJECTED"
            ? "Username atau password salah."
            : // Dibedakan dengan sengaja: memberitahu "password salah" saat
              // mailserver-nya yang mati akan membuat orang mereset password
              // email yang sebenarnya tidak bermasalah.
              "Mailserver sedang tidak bisa dihubungi, jadi login belum bisa diproses. Coba lagi sebentar lagi atau hubungi IT.",
      };
    }
  } else {
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      await logAudit({
        userId: user.id,
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        module: "auth",
        description: `Login gagal untuk "${user.username}" (password salah)`,
      });
      return { ok: false, error: "Username atau password salah." };
    }
  }

  // Fase 45 — jalur password lokal saat identitas terpusat aktif.
  // Diperiksa setelah password benar, alasan yang sama dengan pembekuan di
  // bawah: keadaan akun tidak boleh bocor ke penebak nama pengguna.
  const blocker = localLoginBlocker(provider, user);
  if (blocker) {
    await logAudit({
      userId: user.id,
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      module: "auth",
      description: `Login lokal ditolak untuk "${user.username}" (provider ${provider})`,
    });
    return { ok: false, error: blocker };
  }

  // Fase 42 — akun beku. Diperiksa SETELAH password terbukti benar, dan itu
  // disengaja: memberi tahu "akun ini beku" sebelum password diverifikasi
  // membocorkan keadaan akun kepada siapa pun yang menebak nama pengguna.
  // Setelah passwordnya benar, orang itu memang pemilik akunnya — dan ia
  // berhak tahu kenapa tidak bisa masuk, bukan disesatkan pesan "password
  // salah" yang membuatnya mencoba mereset password berulang kali.
  if (user.frozenAt) {
    await logAudit({
      userId: user.id,
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      module: "auth",
      description: `Login ditolak untuk "${user.username}" (akun beku)`,
    });
    return {
      ok: false,
      error: `Akun Anda dibekukan sejak ${user.frozenAt.toLocaleDateString("id-ID")}${
        user.freezeReason ? ` — ${user.freezeReason}` : ""
      }. Hubungi HRD atau IT.`,
    };
  }

  await createSession({
    userId: user.id,
    username: user.username,
    name: user.name,
    epoch: user.sessionEpoch,
  });

  // Pemakaian jalur darurat TIDAK boleh senyap. Kalau suatu saat akun ini
  // dipakai orang yang tidak berhak, satu-satunya yang membuatnya ketahuan
  // adalah catatan ini dan pemberitahuannya.
  if (isBreakGlassLogin(provider, user)) {
    await logAudit({
      userId: user.id,
      action: "LOGIN_BREAK_GLASS",
      module: "auth",
      entityType: "User",
      entityId: user.id,
      description: `AKUN DARURAT dipakai: ${user.username} masuk lewat password lokal meski provider ${provider}`,
    });
    await notifyPermission(PERMISSIONS.AUDIT_LOG_VIEW, {
      type: "LOGIN_BREAK_GLASS",
      title: "Akun darurat dipakai",
      body: `${user.name} (${user.username}) masuk lewat password lokal padahal identitas terpusat sedang aktif.`,
      link: "/audit-log",
      module: "auth",
    });
  } else {
    await logAudit({
      userId: user.id,
      action: AUDIT_ACTIONS.LOGIN,
      module: "auth",
      description: `${user.name} login`,
    });
  }
  return { ok: true };
}

export async function logout(): Promise<void> {
  const session = await getSession();
  if (session) {
    await logAudit({
      userId: session.userId,
      action: AUDIT_ACTIONS.LOGOUT,
      module: "auth",
      description: `${session.name} logout`,
    });
  }
  await destroySession();
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
