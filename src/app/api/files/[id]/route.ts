import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/rbac";
import { attachmentPath } from "@/lib/files";
import { PERMISSIONS } from "@/lib/constants";

// Penyajian lampiran privat (PRD terminasi §15).
//
// Login saja TIDAK cukup: §19.3 menuntut foto/tanda tangan tidak bisa dibuka
// oleh orang yang tidak berkepentingan. Karena itu setiap jenis entitas
// dipetakan ke izin yang sama dengan izin melihat entitas induknya.
//
// Jenis yang tidak terdaftar DITOLAK, bukan dilewatkan. Kalau kelak ada
// lampiran jenis baru, ia harus didaftarkan di sini secara sadar — pilihan
// gagal-tertutup ini yang mencegah lampiran baru diam-diam terbuka untuk
// semua orang.
const ENTITY_PERMISSION: Record<string, string> = {
  Survey: PERMISSIONS.SURVEYS_VIEW,
  Project: PERMISSIONS.PROJECTS_VIEW,
  WorkOrder: PERMISSIONS.WORK_ORDERS_VIEW,
  CashTransaction: PERMISSIONS.FINANCE_VIEW,
  // Fase 33 — bukti penarikan & inspeksi perangkat
  DeviceRecoveryAttempt: PERMISSIONS.INVENTORY_VIEW,
  DeviceRecoveryItem: PERMISSIONS.INVENTORY_VIEW,
  DeviceInspectionPhoto: PERMISSIONS.INVENTORY_VIEW,
  // Fase 48 — gambar tanda tangan serah terima. Didaftarkan terpisah dari
  // bukti foto justru karena isinya berbeda sifatnya (coretan tangan
  // pelanggan), sehingga izinnya bisa diperketat kelak tanpa menyentuh
  // lampiran lama.
  DeviceRecoverySignature: PERMISSIONS.INVENTORY_VIEW,
  // Fase 49a — gambar tanda tangan dokumen gudang (IRF, DO, bukti terima).
  // Izin melihatnya sama dengan izin melihat dokumennya: siapa pun yang boleh
  // membuka IRF-nya boleh melihat tanda tangan di atasnya.
  DocumentSignatureImage: PERMISSIONS.INVENTORY_VIEW,
  // Fase 49 — foto resmi pegawai. Diunggah HRD, dilihat oleh siapa pun yang
  // boleh melihat data kepegawaian.
  //
  // CATATAN untuk Fase 50: halaman verifikasi publik butuh foto ini TANPA
  // login. Itu jalur terpisah yang harus dibuat sadar — jangan cukup dengan
  // melonggarkan izin di sini, karena daftar ini menjaga SEMUA lampiran.
  EmployeePhoto: PERMISSIONS.HRD_VIEW,
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const attachment = await db.attachment.findUnique({ where: { id } });
  if (!attachment) return new NextResponse("Not found", { status: 404 });

  const required = ENTITY_PERMISSION[attachment.entityType];
  if (!required || !user.permissions.has(required)) {
    // Sengaja 404, bukan 403: membedakan keduanya memberi tahu penebak bahwa
    // lampiran dengan id itu memang ada.
    return new NextResponse("Not found", { status: 404 });
  }

  let data: Buffer;
  try {
    data = await readFile(attachmentPath(attachment.storedName));
  } catch {
    return new NextResponse("File hilang dari storage", { status: 410 });
  }

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(attachment.filename)}"`,
      "Cache-Control": "private, no-store",
      // Berkas disajikan inline dan isinya berasal dari pengunggah. Tanpa
      // nosniff, peramban boleh menebak sendiri tipenya dan sebuah "gambar"
      // bisa berubah menjadi HTML yang dijalankan pada origin aplikasi.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
    },
  });
}
