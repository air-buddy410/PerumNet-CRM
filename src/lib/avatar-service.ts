import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { contentMismatch } from "@/lib/upload-rules";
import {
  AVATAR_SIZE,
  AVATAR_MIME,
  avatarRejection,
  newAvatarToken,
} from "@/lib/avatar";

// ── Unggah & hapus foto profil sendiri (Fase 59) ────────────────
//
// Berkasnya TIDAK lewat mesin lampiran biasa. Alasannya bukan kemalasan:
// lampiran disimpan apa adanya, sedangkan foto profil sengaja DIPROSES ULANG
// sebelum menyentuh disk. Tiga hal didapat sekaligus, dan yang pertama paling
// penting:
//
//   1. EXIF HILANG. Foto dari ponsel membawa koordinat GPS. Foto profil yang
//      disimpan apa adanya bisa memberitahu siapa pun di mana orang itu
//      tinggal — dan tidak seorang pun mengira sedang membagikan itu.
//   2. Dipotong persegi di tengah, jadi tampilan lingkaran selalu rapi tanpa
//      bergantung pada CSS di tiap aplikasi yang memakainya.
//   3. Ukurannya terbatas. Foto 5 MB yang ditampilkan 40 piksel di bilah nav
//      adalah pemborosan yang terjadi pada SETIAP halaman.

const AVATAR_DIR = path.join(process.cwd(), "uploads", "avatar");

type Result = { ok: true; token: string } | { ok: false; error: string };

/** Nama berkas SELALU dibangkitkan sendiri — nama dari pengunggah tidak pernah menyentuh path. */
function storedNameFor(): string {
  return `${crypto.randomBytes(16).toString("hex")}.webp`;
}

/**
 * Mengganti foto profil MILIK SENDIRI.
 *
 * Tidak menerima userId dari pemanggil: satu-satunya akun yang bisa diubah
 * lewat jalur ini adalah milik yang sedang login. Parameter userId yang bisa
 * dikendalikan akan berarti siapa pun bisa mengganti wajah orang lain.
 */
export async function setOwnAvatar(
  account: { id: string; name: string },
  file: File
): Promise<Result> {
  const rejection = avatarRejection({ type: file.type, size: file.size });
  if (rejection) return { ok: false, error: rejection };

  const buffer = Buffer.from(await file.arrayBuffer());
  // Isi berkas harus benar sesuai yang diakui. MIME dan extension sama-sama
  // dikirim pengunggah; hanya isi berkas yang tidak bisa dibohongi begitu saja.
  const mismatch = contentMismatch(file.type, new Uint8Array(buffer.subarray(0, 16)));
  if (mismatch) return { ok: false, error: mismatch };

  let diproses: Buffer;
  try {
    diproses = await sharp(buffer, { failOn: "error" })
      .rotate() // menghormati orientasi EXIF SEBELUM metadatanya dibuang
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "attention" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    // Pesannya sengaja tidak meneruskan galat pustaka apa adanya — isinya
    // sering menyebut jalur berkas dan versi, dan tidak menolong siapa pun.
    return { ok: false, error: "Foto tidak bisa dibaca. Coba simpan ulang sebagai JPG atau PNG." };
  }

  const lama = await db.user.findUnique({
    where: { id: account.id },
    select: { avatarAttachmentId: true, avatarToken: true },
  });

  await mkdir(AVATAR_DIR, { recursive: true });
  const storedName = storedNameFor();
  await writeFile(path.join(AVATAR_DIR, storedName), diproses);

  // Token DIPERTAHANKAN bila sudah ada. Menerbitkan yang baru setiap kali foto
  // diganti akan mematikan URL yang sudah disimpan aplikasi lain — dan foto
  // profil orang akan hilang dari sana tanpa sebab yang terlihat.
  const token = lama?.avatarToken ?? newAvatarToken();
  await db.user.update({
    where: { id: account.id },
    data: { avatarAttachmentId: storedName, avatarToken: token },
  });

  // Berkas lama dihapus SETELAH yang baru tersimpan dan tercatat. Urutan
  // sebaliknya menyisakan orang tanpa foto sama sekali bila penulisan gagal.
  if (lama?.avatarAttachmentId) await hapusBerkas(lama.avatarAttachmentId);

  await logAudit({
    userId: account.id,
    action: "AVATAR_UPDATE",
    module: "users",
    entityType: "User",
    entityId: account.id,
    description: `${account.name} mengganti foto profil`,
  });
  return { ok: true, token };
}

/** Menghapus foto profil sendiri. Tokennya dipertahankan supaya URL lama tidak jatuh ke foto orang lain. */
export async function removeOwnAvatar(account: {
  id: string;
  name: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const lama = await db.user.findUnique({
    where: { id: account.id },
    select: { avatarAttachmentId: true },
  });
  if (!lama?.avatarAttachmentId) return { ok: false, error: "Belum ada foto profil untuk dihapus." };

  await db.user.update({ where: { id: account.id }, data: { avatarAttachmentId: null } });
  await hapusBerkas(lama.avatarAttachmentId);
  await logAudit({
    userId: account.id,
    action: "AVATAR_REMOVE",
    module: "users",
    entityType: "User",
    entityId: account.id,
    description: `${account.name} menghapus foto profil`,
  });
  return { ok: true };
}

/** Isi berkas foto untuk sebuah token, atau null bila tidak ada. */
export async function avatarBytes(token: string): Promise<Buffer | null> {
  const bersih = (token ?? "").trim();
  // Token pendek tidak perlu menyentuh database sama sekali.
  if (bersih.length < 16) return null;
  const user = await db.user.findUnique({
    where: { avatarToken: bersih },
    select: { avatarAttachmentId: true, isActive: true },
  });
  // Akun nonaktif berhenti menyajikan wajahnya. Orang yang sudah keluar tidak
  // seharusnya tetap tampil di aplikasi lain.
  if (!user?.avatarAttachmentId || !user.isActive) return null;

  const resolved = path.resolve(AVATAR_DIR, user.avatarAttachmentId);
  // Berlapis: meski nama berkas selalu dibangkitkan sendiri, hasil
  // penggabungan tetap dipastikan berada di dalam direktori avatar.
  if (resolved !== path.join(AVATAR_DIR, path.basename(resolved))) return null;
  try {
    const { readFile } = await import("node:fs/promises");
    return await readFile(resolved);
  } catch {
    return null;
  }
}

async function hapusBerkas(storedName: string): Promise<void> {
  try {
    await unlink(path.join(AVATAR_DIR, path.basename(storedName)));
  } catch {
    /* berkas sudah tidak ada — bukan kegagalan */
  }
}
