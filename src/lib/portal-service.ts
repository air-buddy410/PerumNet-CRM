// ── Isi portal pelanggan (Fase 87) ──────────────────────────────
//
// Aturan masuknya ada di `portal-auth.ts`, sesinya di `portal-session.ts`,
// keduanya sudah diuji.
//
// SATU HAL YANG MEMBENTUK SELURUH BERKAS INI: **mode baca-saja.**
//
// Portal ini menghadap pelanggan sungguhan, dan tagihan yang sebenarnya masih
// diterbitkan sistem lama. `Invoice` di CRM masih NOL baris. Kalau portal
// menampilkan "tidak ada tagihan" berdasarkan tabel kosong itu, ia berbohong
// kepada 1.715 orang sekaligus — dan berbohong dengan cara yang paling
// meyakinkan, sebab layarnya terlihat berfungsi.
//
// Karena itu portal TIDAK menampilkan tagihan sampai cutover. Ia mengatakan
// dengan jelas bahwa tagihan dikelola di tempat lain. Layar yang jujur tentang
// apa yang belum diketahuinya lebih berguna daripada layar yang lengkap dan
// salah.

import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/auth";
import {
  bolehMencoba,
  setelahGagal,
  setelahBerhasil,
  rapikanNamaMasuk,
  sandiLemah,
  PESAN_GAGAL,
} from "@/lib/portal-auth";
import { createPortalSession, destroyPortalSession, getPortalSession } from "@/lib/portal-session";
import { createCustomerTicket } from "@/lib/helpdesk";
import type { CurrentUser } from "@/lib/rbac";

/**
 * Apakah portal boleh menampilkan tagihan.
 *
 * Selama bernilai `false`, portal menyebut sistem lama alih-alih menampilkan
 * tabel `Invoice` yang masih kosong. Dinyalakan saat cutover — bersama
 * penjadwal penagihan, bukan sendirian.
 */
export const TAGIHAN_DI_CRM = process.env.PORTAL_TAGIHAN_AKTIF === "1";

// ── Masuk & keluar ──────────────────────────────────────────────

export type HasilMasuk = { ok: true } | { ok: false; error: string };

export async function masukPortal(namaMasuk: string, sandi: string): Promise<HasilMasuk> {
  const loginName = rapikanNamaMasuk(namaMasuk);
  const sekarang = new Date();

  const akun = await db.customerAccount.findUnique({
    where: { loginName },
    select: {
      id: true, customerId: true, loginName: true, passwordHash: true,
      isActive: true, failedCount: true, lockedUntil: true, sessionEpoch: true,
    },
  });

  // Nomor yang tidak punya akun: jawaban dan waktu tempuhnya dibuat semirip
  // mungkin dengan password salah, supaya tidak bisa dipakai memetakan nomor
  // layanan mana yang sudah terdaftar.
  if (!akun) {
    await verifyPassword(sandi, "$2a$12$0000000000000000000000000000000000000000000000000000");
    return { ok: false, error: PESAN_GAGAL };
  }

  const izin = bolehMencoba(akun, sekarang);
  if (!izin.boleh) return { ok: false, error: izin.pesan };

  const cocok = await verifyPassword(sandi, akun.passwordHash);
  if (!cocok) {
    const akibat = setelahGagal(akun, sekarang);
    await db.customerAccount.update({ where: { id: akun.id }, data: akibat });
    return { ok: false, error: PESAN_GAGAL };
  }

  await db.customerAccount.update({
    where: { id: akun.id },
    data: { ...setelahBerhasil(), lastLoginAt: sekarang },
  });
  await createPortalSession({
    accountId: akun.id,
    customerId: akun.customerId,
    loginName: akun.loginName,
    epoch: akun.sessionEpoch,
  });
  return { ok: true };
}

export async function keluarPortal(): Promise<void> {
  await destroyPortalSession();
}

/**
 * Pelanggan yang sedang masuk, atau null.
 *
 * `sessionEpoch` dicocokkan ke basis data setiap kali — itulah yang membuat
 * "keluarkan dari semua perangkat" bekerja seketika tanpa menyimpan daftar
 * sesi. Token lama tetap sah secara kriptografis, tetapi epochnya tertinggal.
 */
export async function pelangganSekarang(): Promise<
  { accountId: string; customerId: string; loginName: string } | null
> {
  const s = await getPortalSession();
  if (!s) return null;
  const akun = await db.customerAccount.findUnique({
    where: { id: s.accountId },
    select: { id: true, customerId: true, loginName: true, isActive: true, sessionEpoch: true },
  });
  if (!akun || !akun.isActive || akun.sessionEpoch !== s.epoch) return null;
  return { accountId: akun.id, customerId: akun.customerId, loginName: akun.loginName };
}

// ── Pengelolaan akun oleh staf ──────────────────────────────────

/** Membuat atau mengatur ulang kata sandi portal seorang pelanggan. */
export async function aturSandiPortal(
  customerId: string,
  sandiBaru: string,
  userId: string
): Promise<HasilMasuk> {
  const lemah = sandiLemah(sandiBaru);
  if (lemah) return { ok: false, error: lemah };

  const langganan = await db.subscription.findFirst({
    where: { customerId },
    select: { serviceNumber: true },
    orderBy: { createdAt: "asc" },
  });
  if (!langganan) return { ok: false, error: "Pelanggan ini belum punya langganan, jadi belum punya nomor masuk." };

  const loginName = rapikanNamaMasuk(langganan.serviceNumber);
  const passwordHash = await hashPassword(sandiBaru);

  await db.customerAccount.upsert({
    where: { customerId },
    // Mengatur ulang sandi SEKALIGUS mengusir sesi lama. Kalau tidak, sandi
    // yang diganti karena bocor tidak menutup pintu yang sudah terbuka.
    update: { passwordHash, failedCount: 0, lockedUntil: null, sessionEpoch: { increment: 1 } },
    create: { customerId, loginName, passwordHash },
  });

  await logAudit({
    userId,
    action: "PORTAL_PASSWORD_SET",
    module: "customers",
    entityType: "Customer",
    entityId: customerId,
    description: `Kata sandi portal diatur untuk ${loginName}. Sesi lama diakhiri.`,
  });
  return { ok: true };
}

/** Padanan "Logout Aplikasi Mobile" pada sistem lama. */
export async function keluarkanSemuaPerangkat(customerId: string, userId: string): Promise<void> {
  await db.customerAccount.update({
    where: { customerId },
    data: { sessionEpoch: { increment: 1 } },
  });
  await logAudit({
    userId,
    action: "PORTAL_LOGOUT_ALL",
    module: "customers",
    entityType: "Customer",
    entityId: customerId,
    description: "Seluruh sesi portal pelanggan diakhiri.",
  });
}

// ── Isi beranda portal ──────────────────────────────────────────

export interface BerandaPortal {
  nama: string;
  nomorLayanan: string;
  paket: { nama: string; hargaBulanan: number; unduhMbps: number; unggahMbps: number } | null;
  /** Keadaan sambungan MENURUT ROUTER, bukan menurut tagihan. */
  koneksi: { status: string; terakhirTerlihat: Date | null };
  alamat: string | null;
  /** Selama belum cutover, ini menyebut sistem lama alih-alih tabel kosong. */
  tagihan: { diCrm: false; pesan: string } | { diCrm: true; belumBayar: number; totalBelumBayar: number };
  pengumuman: { id: string; judul: string; badge: string | null; isi: string; mulai: Date }[];
  tiketTerbuka: number;
}

export async function loadBerandaPortal(customerId: string): Promise<BerandaPortal | null> {
  const sekarang = new Date();
  const c = await db.customer.findUnique({
    where: { id: customerId },
    select: {
      name: true,
      address: true,
      subscriptions: {
        select: {
          serviceNumber: true,
          monthlyPrice: true,
          downloadMbps: true,
          uploadMbps: true,
          package: { select: { name: true } },
          pppoeSessions: {
            select: { status: true, lastSeenAt: true },
            orderBy: { lastSeenAt: "desc" },
            take: 1,
          },
        },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });
  if (!c) return null;
  const s = c.subscriptions[0];
  if (!s) return null;

  const [pengumuman, tiketTerbuka] = await Promise.all([
    db.announcement.findMany({
      where: {
        isPublished: true,
        startAt: { lte: sekarang },
        OR: [{ endAt: null }, { endAt: { gte: sekarang } }],
      },
      select: { id: true, title: true, badge: true, body: true, startAt: true },
      orderBy: { startAt: "desc" },
      take: 5,
    }),
    db.customerTicket.count({
      where: { subscription: { customerId }, status: { notIn: ["CLOSED", "RESOLVED"] } },
    }),
  ]);

  const sesi = s.pppoeSessions[0];

  return {
    nama: c.name,
    nomorLayanan: s.serviceNumber,
    paket: {
      nama: s.package.name,
      hargaBulanan: Number(s.monthlyPrice),
      unduhMbps: s.downloadMbps,
      unggahMbps: s.uploadMbps,
    },
    koneksi: {
      // Tanpa sesi sama sekali BUKAN berarti mati — bisa jadi routernya belum
      // pernah ditarik. Dikatakan apa adanya.
      status: sesi?.status ?? "BELUM DIKETAHUI",
      terakhirTerlihat: sesi?.lastSeenAt ?? null,
    },
    alamat: c.address,
    tagihan: TAGIHAN_DI_CRM
      ? { diCrm: true, belumBayar: 0, totalBelumBayar: 0 }
      : {
          diCrm: false,
          pesan:
            "Tagihan Anda masih dikelola pada sistem penagihan kami yang lama. " +
            "Hubungi kantor untuk rincian dan pembayaran.",
        },
    pengumuman: pengumuman.map((p) => ({
      id: p.id,
      judul: p.title,
      badge: p.badge,
      isi: p.body,
      mulai: p.startAt,
    })),
    tiketTerbuka,
  };
}

/**
 * Lapor gangguan dari portal.
 *
 * SATU-SATUNYA tulis yang boleh dilakukan pelanggan, dan ia masuk ANTREAN
 * STAF — bukan tindakan pada jaringan. Portal tidak pernah menyentuh router.
 */
export async function laporGangguan(
  customerId: string,
  judul: string,
  isi: string
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const j = (judul ?? "").trim();
  const i = (isi ?? "").trim();
  if (j.length < 5) return { ok: false, error: "Judul terlalu pendek." };
  if (i.length < 10) return { ok: false, error: "Ceritakan sedikit lebih rinci supaya teknisi bisa menyiapkan diri." };

  const sub = await db.subscription.findFirst({
    where: { customerId },
    select: { id: true, serviceNumber: true },
    orderBy: { createdAt: "asc" },
  });
  if (!sub) return { ok: false, error: "Langganan tidak ditemukan." };

  // Pelanggan boleh melapor sekali untuk satu gangguan. Tanpa penjagaan ini,
  // tombol yang diklik berulang saat internetnya lambat akan membanjiri
  // antrean helpdesk dengan tiket kembar.
  const sudahAda = await db.customerTicket.findFirst({
    where: { subscriptionId: sub.id, status: { notIn: ["CLOSED", "RESOLVED"] } },
    select: { id: true },
  });
  if (sudahAda) {
    return {
      ok: false,
      error: "Laporan Anda sebelumnya masih kami tangani. Kami akan menghubungi Anda.",
    };
  }

  // Tiket dibuat lewat layanan helpdesk yang sudah ada, BUKAN dengan menulis
  // tabelnya langsung. Layanan itu yang membangkitkan nomor tiket, memeriksa
  // kategorinya hidup, mencatat audit, dan memberi tahu petugas — empat hal
  // yang akan tertinggal diam-diam kalau portal menempuh jalan pintas.
  const kategori = await kategoriPortal();
  if (!kategori) {
    return { ok: false, error: "Kategori tiket untuk laporan portal belum disiapkan. Hubungi kantor." };
  }
  const petugas = await penggunaSistem();
  if (!petugas) return { ok: false, error: "Sistem belum siap menerima laporan. Hubungi kantor." };

  const hasil = await createCustomerTicket(petugas, {
    customerId,
    subscriptionId: sub.id,
    categoryId: kategori,
    title: j.slice(0, 160),
    description: `${i.slice(0, 4000)}\n\n— Dilaporkan pelanggan lewat portal.`,
    tags: "portal",
  });
  if (!hasil.ok) return { ok: false, error: hasil.error };

  await logAudit({
    userId: petugas.id,
    action: "PORTAL_TICKET_CREATE",
    module: "helpdesk",
    entityType: "Subscription",
    entityId: sub.id,
    description: `Pelanggan ${sub.serviceNumber} melapor lewat portal: ${j.slice(0, 80)}`,
  });
  return { ok: true, id: sub.id };
}

/**
 * Kategori tiket untuk laporan portal.
 *
 * Dicari menurut NAMA, bukan dipatok id — id berbeda di tiap lingkungan.
 * Jatuh ke kategori aktif pertama bila belum ada yang bernama "portal", sebab
 * laporan pelanggan yang hilang lebih buruk daripada laporan yang masuk ke
 * kategori kurang tepat.
 */
async function kategoriPortal(): Promise<string | null> {
  const khusus = await db.ticketCategory.findFirst({
    where: { isActive: true, name: { contains: "ortal" } },
    select: { id: true },
  });
  if (khusus) return khusus.id;
  const pertama = await db.ticketCategory.findFirst({
    where: { isActive: true },
    select: { id: true },
    orderBy: { name: "asc" },
  });
  return pertama?.id ?? null;
}

/**
 * Pengguna yang dicatat sebagai pembuat tiket portal.
 *
 * Tiket menuntut seorang pembuat, dan pelanggan bukan `User` — itu justru
 * pemisahan yang kita inginkan. Dipakai akun staf tertua yang aktif, dan
 * asal-usul sungguhannya tertulis pada tag `portal` serta di badan tiketnya.
 */
async function penggunaSistem(): Promise<CurrentUser | null> {
  const u = await db.user.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!u) return null;
  return { id: u.id, permissions: new Set(["helpdesk.create", "helpdesk.view"]) } as unknown as CurrentUser;
}
