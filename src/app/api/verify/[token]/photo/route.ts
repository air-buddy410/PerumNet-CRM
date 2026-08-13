import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { attachmentPath } from "@/lib/files";
import { verifyCardToken, EMPLOYEE_PHOTO_ENTITY } from "@/lib/employee-card-service";

// ── Foto pada halaman verifikasi publik (Fase 50) ───────────────
//
// Jalur ini ada supaya /api/files TIDAK perlu dilonggarkan. Berkas lampiran di
// sana menjaga SELURUH lampiran aplikasi — bukti pekerjaan, tanda tangan,
// faktur — dan membuka satu celah demi foto pegawai berarti membuka semuanya.
//
// Kuncinya TOKEN KARTU, bukan id lampiran. Itu bedanya, dan itu yang membuat
// jalur ini tidak bisa dipakai mengambil lampiran lain: id lampiran tidak
// pernah diterima dari luar sama sekali.
//
// Foto hanya disajikan bila kartunya BERLAKU. Kartu kedaluwarsa, dicabut,
// hilang, atau milik orang yang sudah diarsipkan tidak menampilkan wajah
// siapa pun — sama seperti halamannya yang juga tidak menyebut namanya.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const hasil = await verifyCardToken(token);
  if (!hasil.valid || !hasil.photoUrl) {
    // Tidak membedakan "kartu tidak dikenal" dari "kartu tidak berlaku":
    // keduanya sama-sama tidak berhak menampilkan wajah orang.
    return new NextResponse(null, { status: 404 });
  }

  // Id lampiran diambil dari kartu yang SUDAH terbukti berlaku, bukan dari URL.
  const card = await db.employeeCard.findUnique({
    where: { publicToken: token.trim() },
    select: { employee: { select: { photoAttachmentId: true } } },
  });
  const attachmentId = card?.employee?.photoAttachmentId;
  if (!attachmentId) return new NextResponse(null, { status: 404 });

  const att = await db.attachment.findUnique({
    where: { id: attachmentId },
    select: { storedName: true, mimeType: true, entityType: true },
  });
  // Berlapis: meski id-nya datang dari kartu, jenis entitasnya tetap
  // dipastikan. Kalau suatu saat ada jalur lain yang menulis kolom itu, jaring
  // ini yang menahan.
  if (!att || att.entityType !== EMPLOYEE_PHOTO_ENTITY) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const buf = await readFile(attachmentPath(att.storedName));
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": att.mimeType,
        // TIDAK di-cache. Kartu yang dicabut harus langsung berhenti
        // menampilkan wajah orangnya, bukan menunggu cache kedaluwarsa.
        "Cache-Control": "no-store",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
