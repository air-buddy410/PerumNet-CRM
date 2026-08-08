import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { db } from "@/lib/db";

// Penyimpanan bukti/lampiran: file di <project>/uploads (di luar git),
// metadata di tabel Attachment, akses via /api/files/[id] (wajib login).

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

export async function saveAttachment(
  file: File,
  entityType: string,
  entityId: string,
  userId: string
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (file.size === 0) return { ok: false, error: "File kosong." };
  if (file.size > MAX_SIZE) return { ok: false, error: "Ukuran file maksimal 5MB." };
  if (!ALLOWED_MIME.includes(file.type)) {
    return { ok: false, error: "Tipe file harus JPG, PNG, WebP, atau PDF." };
  }
  await mkdir(UPLOAD_DIR, { recursive: true });
  const ext = path.extname(file.name) || "";
  const storedName = `${crypto.randomBytes(16).toString("hex")}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, storedName), buffer);

  const attachment = await db.attachment.create({
    data: {
      entityType,
      entityId,
      filename: file.name,
      storedName,
      mimeType: file.type,
      size: file.size,
      uploadedById: userId,
    },
  });
  return { ok: true, id: attachment.id };
}

export function attachmentPath(storedName: string): string {
  return path.join(UPLOAD_DIR, storedName);
}
