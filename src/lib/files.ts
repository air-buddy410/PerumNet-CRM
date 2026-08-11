import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { db } from "@/lib/db";
import { uploadRejection, contentMismatch, safeExtension } from "@/lib/upload-rules";

// Penyimpanan bukti/lampiran: file di <project>/uploads (di luar git DAN di
// luar public/, jadi tidak pernah tersaji langsung oleh web server), metadata
// di tabel Attachment, akses via /api/files/[id] yang memeriksa login DAN
// izin atas entitas induknya.
//
// Nama berkas di disk SELALU dibangkitkan sendiri (hex acak + extension yang
// sudah divalidasi). Nama asli dari pengunggah tidak pernah dipakai sebagai
// path — itu yang menutup path traversal, bukan penyaringan karakter.

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

export async function saveAttachment(
  file: File,
  entityType: string,
  entityId: string,
  userId: string
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const rejection = uploadRejection({ name: file.name, type: file.type, size: file.size });
  if (rejection) return { ok: false, error: rejection };

  const buffer = Buffer.from(await file.arrayBuffer());
  // Pemeriksaan terakhir dan yang paling menentukan: isi berkas harus benar
  // sesuai yang diakui. MIME dan extension sama-sama dikirim pengunggah;
  // hanya isi berkas yang tidak bisa dibohongi begitu saja.
  const mismatch = contentMismatch(file.type, new Uint8Array(buffer.subarray(0, 16)));
  if (mismatch) return { ok: false, error: mismatch };

  await mkdir(UPLOAD_DIR, { recursive: true });
  const storedName = `${crypto.randomBytes(16).toString("hex")}${safeExtension(file.name)}`;
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
  // Dijaga berlapis: meski storedName selalu dibangkitkan sendiri, hasil
  // penggabungan tetap dipastikan berada di dalam UPLOAD_DIR. Kalau suatu
  // saat ada jalur lain yang menulis kolom ini, jaring ini yang menahan.
  const resolved = path.resolve(UPLOAD_DIR, storedName);
  if (resolved !== path.join(UPLOAD_DIR, path.basename(resolved))) {
    throw new Error("Nama berkas tidak valid.");
  }
  return resolved;
}
