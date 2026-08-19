import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import sharp from "sharp";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { saveAttachment } from "@/lib/files";
import { PERMISSIONS } from "@/lib/constants";
import {
  cardNumberFor,
  CARD_TOKEN_BYTES,
  statusChangeRejection,
  publicVerification,
  verificationUrl,
  isCardValid,
  cardPhotoWidth,
  CARD_PHOTO_HEIGHT,
  cropRejection,
  cropToPixels,
  type CardPhotoCrop,
  type CardAction,
  type PublicVerification,
} from "@/lib/employee-card";
import type { CurrentUser } from "@/lib/rbac";

// ── Penerbitan & pencabutan kartu pegawai (Fase 49) ─────────────
//
// Foto resmi diunggah HRD (keputusan K5), jadi seluruh pengelolaan kartu
// memakai izin yang sama: `hrd.manage`. Kartu adalah dokumen kepegawaian,
// bukan perangkat IT.
//
// Yang ditegakkan DI SINI, bukan di halaman:
//
//  - SATU KARTU AKTIF PER PEGAWAI. Menerbitkan kartu kedua tanpa mematikan
//    yang pertama berarti dua kartu fisik berlaku bersamaan, dan yang satu
//    entah di mana.
//  - KARTU LAMA TIDAK DIHAPUS. Diganti statusnya dan ditunjuk penggantinya,
//    sehingga riwayat pemegang kartu bisa ditelusuri.
//  - PENCABUTAN BERLAKU SEKETIKA, dan alasannya wajib.

type Result<T = undefined> =
  | { ok: true; id: string; data?: T }
  | { ok: false; error: string };

export const EMPLOYEE_PHOTO_ENTITY = "EmployeePhoto";

/** Token QR: acak, buram, tidak bermakna di luar sistem ini. */
export function newCardToken(): string {
  return randomBytes(CARD_TOKEN_BYTES).toString("base64url");
}

// ── Foto resmi pegawai ──────────────────────────────────────────

export const CARD_PHOTO_INPUT_MIME = ["image/jpeg", "image/png", "image/webp"];

/**
 * Memotong foto agar PERSIS mengisi slot foto di muka kartu.
 *
 * Tiga hal didapat sekaligus, dan yang pertama alasan utamanya:
 *
 *   1. BENTUKNYA SELALU PAS. Slot kartu memakai `object-fit: cover`, jadi foto
 *      dengan rasio lain akan dipotong sembarang oleh peramban — di bagian
 *      yang tidak dipilih siapa pun. Dipotong lebih dulu di sini berarti yang
 *      tampil adalah bidang yang memang dimaksudkan.
 *   2. EXIF HILANG. Foto pegawai disajikan di URL PUBLIK yang dipindai siapa
 *      pun; foto langsung dari ponsel bisa membawa koordinat GPS tempat ia
 *      diambil. Sharp membuang metadata kecuali diminta menyimpannya.
 *   3. Ukurannya turun drastis. Foto kamera 1,8 MB terkirim ulang setiap kali
 *      ada orang memindai kartu, sering lewat kuota, sambil berdiri di pintu.
 *
 * Hasilnya JPEG — kartu ini dicetak, dan JPEG diterima setiap alur cetak.
 */
async function potongFotoKartu(
  file: File,
  crop?: CardPhotoCrop | null
): Promise<{ ok: true; file: File } | { ok: false; error: string }> {
  if (!CARD_PHOTO_INPUT_MIME.includes(file.type)) {
    return { ok: false, error: "Foto harus berformat JPG, PNG, atau WebP." };
  }
  const masuk = Buffer.from(await file.arrayBuffer());
  try {
    // Orientasi EXIF diterapkan LEBIH DULU, lalu hasilnya dijadikan gambar
    // sumber tersendiri. Ini bukan langkah tambahan yang bisa dihemat:
    // koordinat potong berasal dari apa yang DILIHAT HRD di layar, dan
    // peramban sudah menampilkan foto dalam orientasi tegaknya. Memotong
    // sebelum diputar berarti memotong bagian yang salah — pada foto ponsel
    // yang terekam miring, potongannya meleset 90 derajat.
    const tegak = await sharp(masuk, { failOn: "error" }).rotate().toBuffer();
    const sumber = await sharp(tegak).metadata();

    let pipa = sharp(tegak, { failOn: "error" });
    if (crop) {
      const alasan = cropRejection(crop, { width: sumber.width ?? 0, height: sumber.height ?? 0 });
      if (alasan) return { ok: false, error: alasan };
      pipa = pipa.extract(cropToPixels(crop, { width: sumber.width ?? 0, height: sumber.height ?? 0 }));
    }

    const keluar = await pipa
      // Tetap `cover` meski sudah dipotong: bidang pilihan HRD boleh meleset
      // sedikit dari rasio kartu, dan keluarannya HARUS selalu berbentuk slot.
      // Tanpa ini, satu piksel selisih membuat fotonya dikotaki lagi.
      .resize(cardPhotoWidth(), CARD_PHOTO_HEIGHT, {
        fit: "cover",
        // Jalur TANPA crop juga `centre` sejak Fase 95. `attention` memilih
        // bagian gambar paling ramai, dan pada potret tegak yang ramai bukan
        // wajahnya melainkan motif baju atau latar — diukur pada gambar uji,
        // wajahnya terbuang SEPENUHNYA. Jalur ini jarang terpakai karena
        // cropper HRD hampir selalu mengirim bidangnya, tapi ia terpakai saat
        // HRD menekan simpan tanpa menggeser kotaknya, dan foto kartu adalah
        // foto yang dipindai pelanggan di depan pintu.
        position: "centre",
      })
      .jpeg({ quality: 88 })
      .toBuffer();
    // Nama berkas dibangkitkan sendiri: nama dari pengunggah tidak pernah
    // menyentuh path, dan ekstensinya harus cocok dengan isinya yang baru.
    return {
      ok: true,
      file: new File([new Uint8Array(keluar)], "foto-kartu.jpg", { type: "image/jpeg" }),
    };
  } catch {
    // Galat pustaka tidak diteruskan apa adanya — isinya menyebut jalur berkas
    // dan versi, dan tidak menolong siapa pun yang sedang mengunggah foto.
    return { ok: false, error: "Foto tidak bisa dibaca. Coba simpan ulang sebagai JPG atau PNG." };
  }
}

/**
 * Mengunggah foto resmi pegawai. Hanya HRD (keputusan K5).
 *
 * Foto lama TIDAK dihapus dari penyimpanan — ia mungkin tercetak di kartu yang
 * masih beredar, dan menghapusnya membuat kartu lama tidak bisa diverifikasi
 * lagi. Yang berpindah hanya penunjuk foto mana yang berlaku sekarang.
 */
export async function uploadEmployeePhoto(
  user: CurrentUser,
  employeeId: string,
  file: File,
  /** Bidang potong pilihan HRD. Tanpa ini, potongannya ditentukan mesin. */
  crop?: CardPhotoCrop | null
): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.HRD_MANAGE)) {
    return { ok: false, error: "Hanya HRD yang boleh mengunggah foto pegawai." };
  }
  const emp = await db.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, employeeNo: true, fullName: true, photoAttachmentId: true },
  });
  if (!emp) return { ok: false, error: "Karyawan tidak ditemukan." };

  // Dipotong DI SINI, bukan diserahkan ke HRD. Lihat CARD_PHOTO_* di
  // employee-card.ts untuk asal rasionya dan kenapa ini bukan kerapian.
  const siap = await potongFotoKartu(file, crop);
  if (!siap.ok) return siap;

  const saved = await saveAttachment(siap.file, EMPLOYEE_PHOTO_ENTITY, employeeId, user.id);
  if (!saved.ok) return saved;

  await db.employee.update({
    where: { id: employeeId },
    data: { photoAttachmentId: saved.id },
  });
  await logAudit({
    userId: user.id,
    action: "EMPLOYEE_PHOTO_UPLOAD",
    module: "hrd",
    entityType: "Employee",
    entityId: employeeId,
    description:
      `Mengunggah foto resmi ${emp.employeeNo} — ${emp.fullName}` +
      (emp.photoAttachmentId ? " (mengganti foto sebelumnya)" : ""),
  });
  return { ok: true, id: saved.id };
}

// ── Penerbitan kartu ────────────────────────────────────────────

export interface IssueCardInput {
  employeeId: string;
  expiresAt?: Date | null;
  nfcUid?: string | null;
  /** Kartu yang digantikan, bila ini kartu pengganti. */
  replacesId?: string | null;
}

/**
 * Menerbitkan kartu baru.
 *
 * Menolak bila pegawai masih punya kartu ACTIVE — pakai `replaceCard()`
 * supaya yang lama benar-benar mati lebih dulu. Dua kartu berlaku bersamaan
 * adalah keadaan yang tidak boleh bisa dicapai lewat jalur normal.
 */
export async function issueCard(user: CurrentUser, input: IssueCardInput): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.HRD_MANAGE)) {
    return { ok: false, error: "Hanya HRD yang boleh menerbitkan kartu." };
  }
  const emp = await db.employee.findUnique({
    where: { id: input.employeeId },
    select: { id: true, employeeNo: true, fullName: true, isActive: true, _count: { select: { cards: true } } },
  });
  if (!emp) return { ok: false, error: "Karyawan tidak ditemukan." };
  if (!emp.isActive) {
    return { ok: false, error: "Karyawan sudah tidak aktif — kartu tidak diterbitkan." };
  }

  const active = await db.employeeCard.findFirst({
    where: { employeeId: input.employeeId, status: "ACTIVE" },
    select: { id: true, cardNumber: true },
  });
  if (active && !input.replacesId) {
    return {
      ok: false,
      error: `Masih ada kartu berlaku (${active.cardNumber}). Pakai penggantian kartu agar yang lama dimatikan lebih dulu.`,
    };
  }

  const nfcUid = input.nfcUid?.trim() || null;
  if (nfcUid) {
    const taken = await db.employeeCard.findFirst({ where: { nfcUid }, select: { cardNumber: true } });
    if (taken) return { ok: false, error: `UID NFC sudah dipakai kartu ${taken.cardNumber}.` };
  }

  const card = await db.employeeCard.create({
    data: {
      employeeId: input.employeeId,
      cardNumber: cardNumberFor(emp.employeeNo, emp._count.cards + 1),
      publicToken: newCardToken(),
      nfcUid,
      issuedById: user.id,
      expiresAt: input.expiresAt ?? null,
      replacesId: input.replacesId ?? null,
    },
  });
  await logAudit({
    userId: user.id,
    action: "CARD_ISSUE",
    module: "hrd",
    entityType: "EmployeeCard",
    entityId: card.id,
    description: `Menerbitkan kartu ${card.cardNumber} untuk ${emp.fullName} (${emp.employeeNo})`,
  });
  return { ok: true, id: card.id };
}

/** Mengubah status kartu — hilang, dicabut, atau diganti. */
async function changeStatus(
  user: CurrentUser,
  cardId: string,
  next: CardAction,
  reason: string
): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.HRD_MANAGE)) {
    return { ok: false, error: "Hanya HRD yang boleh mengubah status kartu." };
  }
  const trimmed = reason?.trim() ?? "";
  if (trimmed.length < 3) {
    return { ok: false, error: "Alasan wajib diisi (minimal 3 karakter)." };
  }
  const card = await db.employeeCard.findUnique({
    where: { id: cardId },
    select: { id: true, status: true, cardNumber: true, employee: { select: { fullName: true } } },
  });
  if (!card) return { ok: false, error: "Kartu tidak ditemukan." };

  const rejection = statusChangeRejection(card.status, next);
  if (rejection) return { ok: false, error: rejection };

  await db.employeeCard.update({
    where: { id: cardId },
    data: {
      status: next,
      revokedAt: new Date(),
      revokedById: user.id,
      revokeReason: trimmed,
    },
  });
  await logAudit({
    userId: user.id,
    action: `CARD_${next}`,
    module: "hrd",
    entityType: "EmployeeCard",
    entityId: cardId,
    description: `Kartu ${card.cardNumber} (${card.employee.fullName}) → ${next} — ${trimmed}`,
  });
  return { ok: true, id: cardId };
}

export function markCardLost(user: CurrentUser, cardId: string, reason: string) {
  return changeStatus(user, cardId, "LOST", reason);
}

export function revokeCard(user: CurrentUser, cardId: string, reason: string) {
  return changeStatus(user, cardId, "REVOKED", reason);
}

/**
 * Mengganti kartu: yang lama dimatikan, yang baru terbit menunjuk padanya.
 *
 * Dua langkah ini menumpang SATU transaksi. Kalau tidak, kegagalan di tengah
 * meninggalkan pegawai tanpa kartu berlaku sama sekali, atau — lebih buruk —
 * dua kartu berlaku bersamaan.
 */
export async function replaceCard(
  user: CurrentUser,
  oldCardId: string,
  reason: string,
  opts: { expiresAt?: Date | null; nfcUid?: string | null } = {}
): Promise<Result> {
  if (!user.permissions.has(PERMISSIONS.HRD_MANAGE)) {
    return { ok: false, error: "Hanya HRD yang boleh mengganti kartu." };
  }
  const trimmed = reason?.trim() ?? "";
  if (trimmed.length < 3) return { ok: false, error: "Alasan wajib diisi (minimal 3 karakter)." };

  const old = await db.employeeCard.findUnique({
    where: { id: oldCardId },
    select: { id: true, status: true, employeeId: true, cardNumber: true },
  });
  if (!old) return { ok: false, error: "Kartu lama tidak ditemukan." };
  const rejection = statusChangeRejection(old.status, "REPLACED");
  if (rejection) return { ok: false, error: rejection };

  const emp = await db.employee.findUnique({
    where: { id: old.employeeId },
    select: { employeeNo: true, fullName: true, isActive: true, _count: { select: { cards: true } } },
  });
  if (!emp) return { ok: false, error: "Karyawan tidak ditemukan." };
  if (!emp.isActive) return { ok: false, error: "Karyawan sudah tidak aktif." };

  const nfcUid = opts.nfcUid?.trim() || null;
  if (nfcUid) {
    const taken = await db.employeeCard.findFirst({ where: { nfcUid }, select: { cardNumber: true } });
    if (taken) return { ok: false, error: `UID NFC sudah dipakai kartu ${taken.cardNumber}.` };
  }

  const newId = await db.$transaction(async (tx) => {
    await tx.employeeCard.update({
      where: { id: oldCardId },
      data: {
        status: "REPLACED",
        revokedAt: new Date(),
        revokedById: user.id,
        revokeReason: trimmed,
      },
    });
    const created = await tx.employeeCard.create({
      data: {
        employeeId: old.employeeId,
        cardNumber: cardNumberFor(emp.employeeNo, emp._count.cards + 1),
        publicToken: newCardToken(),
        nfcUid,
        issuedById: user.id,
        expiresAt: opts.expiresAt ?? null,
        replacesId: oldCardId,
      },
    });
    return created.id;
  });

  await logAudit({
    userId: user.id,
    action: "CARD_REPLACE",
    module: "hrd",
    entityType: "EmployeeCard",
    entityId: newId,
    description: `Mengganti kartu ${old.cardNumber} milik ${emp.fullName} — ${trimmed}`,
  });
  return { ok: true, id: newId };
}

// ── Pembacaan ───────────────────────────────────────────────────

/**
 * Alamat publik yang dipakai untuk isi QR, atau null bila belum jelas.
 *
 * Mengembalikan null di PRODUKSI saat APP_URL belum diisi, dan itu bukan
 * kerewelan: QR dicetak ke kartu plastik. Alamat yang salah tidak bisa
 * diperbaiki dengan menyunting apa pun — kartunya harus dicetak ulang satu per
 * satu. Lebih baik tombol Print mati dengan alasan yang jelas daripada 23
 * kartu yang QR-nya menunjuk ke localhost.
 *
 * Di luar produksi, localhost memang jawaban yang benar untuk mencoba.
 */
export function cardAppUrl(): string | null {
  const raw = process.env.APP_URL?.trim();
  if (raw) return raw.replace(/\/+$/, "");
  return process.env.NODE_ENV === "production" ? null : "http://localhost:3300";
}

/**
 * Kartu milik seorang pegawai, LENGKAP DENGAN QR-nya (Fase 61).
 *
 * `publicToken` sengaja tidak ikut keluar. Yang keluar hanya GAMBAR QR yang
 * sudah jadi: token itu kunci verifikasi publik, dan begitu ia sampai ke
 * peramban ia akan muncul di riwayat, ekstensi, dan tangkapan layar. Membuat
 * QR-nya di server berarti kuncinya tidak pernah meninggalkan server.
 *
 * QR hanya terbit untuk kartu yang BENAR-BENAR BERLAKU. Kartu yang dicabut
 * atau kedaluwarsa tidak diberi QR sama sekali — memberi gambar QR pada kartu
 * mati mengundang orang mencetaknya, dan hasilnya kartu yang terlihat resmi
 * tetapi gagal saat dipindai pelanggan di depan pintunya.
 */
export async function loadEmployeeCards(employeeId: string) {
  const cards = await db.employeeCard.findMany({
    where: { employeeId },
    select: {
      id: true,
      cardNumber: true,
      status: true,
      issuedAt: true,
      expiresAt: true,
      nfcUid: true,
      revokedAt: true,
      revokeReason: true,
      publicToken: true,
      issuedBy: { select: { name: true } },
      revokedBy: { select: { name: true } },
    },
    orderBy: { issuedAt: "desc" },
  });

  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: { isActive: true, user: { select: { frozenAt: true, isActive: true } } },
  });

  const appUrl = cardAppUrl();
  const now = new Date();

  return Promise.all(
    cards.map(async ({ publicToken, ...card }) => {
      const berlaku =
        employee !== null &&
        isCardValid(
          {
            status: card.status,
            expiresAt: card.expiresAt,
            employeeActive: employee.isActive,
            userFrozenAt: employee.user?.frozenAt ?? null,
            // Tanpa akun sistem BUKAN berarti diarsipkan — banyak pegawai
            // lapangan memang tidak punya akun CRM. Sama persis dengan
            // verifyCardToken() di bawah; dua jawaban berbeda untuk kartu
            // yang sama akan membuat QR terbit padahal pemindaiannya gagal.
            userArchived: employee.user ? !employee.user.isActive : false,
          },
          now
        );
      return {
        ...card,
        qrSvg: appUrl && berlaku ? await cardQrSvg(appUrl, publicToken) : null,
      };
    })
  );
}

/**
 * Verifikasi publik dari token QR — TANPA login.
 *
 * Yang dikembalikan sudah disaring `publicVerification()`: hanya nama,
 * jabatan, foto, dan nomor kartu, dan hanya bila kartunya berlaku.
 */
export async function verifyCardToken(
  publicToken: string,
  now: Date = new Date()
): Promise<PublicVerification> {
  const token = publicToken?.trim() ?? "";
  // Token terlalu pendek tidak perlu menyentuh database sama sekali.
  if (token.length < 32) {
    return publicVerification(null, null, now);
  }
  const card = await db.employeeCard.findUnique({
    where: { publicToken: token },
    select: {
      cardNumber: true,
      status: true,
      expiresAt: true,
      employee: {
        select: {
          fullName: true,
          jobTitle: true,
          isActive: true,
          photoAttachmentId: true,
          user: { select: { frozenAt: true, isActive: true } },
        },
      },
    },
  });
  if (!card) return publicVerification(null, null, now);

  const e = card.employee;
  return publicVerification(
    {
      cardNumber: card.cardNumber,
      status: card.status,
      expiresAt: card.expiresAt,
      employeeActive: e.isActive,
      userFrozenAt: e.user?.frozenAt ?? null,
      // Tanpa akun sistem bukan berarti diarsipkan — banyak pegawai lapangan
      // memang tidak punya akun CRM.
      userArchived: e.user ? !e.user.isActive : false,
    },
    {
      fullName: e.fullName,
      jobTitle: e.jobTitle,
      // Fase 50 — menunjuk jalur PUBLIK berkunci token, bukan /api/files yang
      // butuh login dan izin hrd.view. Id lampirannya sengaja tidak pernah
      // ikut keluar: yang beredar di halaman publik cuma tokennya.
      photoUrl: e.photoAttachmentId ? `/api/verify/${token}/photo` : null,
    },
    now
  );
}

// ── QR ──────────────────────────────────────────────────────────

/**
 * QR berisi ALAMAT halaman verifikasi, bukan data pegawai.
 *
 * Dengan begitu ponsel mana pun bisa memindainya tanpa aplikasi khusus, dan
 * yang tersimpan di kartu tetap tidak bermakna di luar sistem ini.
 */
export async function cardQrSvg(appUrl: string, publicToken: string): Promise<string> {
  return QRCode.toString(verificationUrl(appUrl, publicToken), {
    type: "svg",
    margin: 1,
    // Toleransi galat sedang: kartu identitas kena gores dan kotor, tetapi
    // "high" memperbesar modulnya sehingga sulit dipindai dari jarak wajar.
    errorCorrectionLevel: "M",
  });
}
