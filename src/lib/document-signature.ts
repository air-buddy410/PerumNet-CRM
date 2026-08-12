import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { saveAttachment } from "@/lib/files";
import { PERMISSIONS } from "@/lib/constants";
import type { CurrentUser } from "@/lib/rbac";

// ── Gambar tanda tangan dokumen gudang (Fase 49a) ───────────────
//
// Diminta frontend: `DocumentSignature.attachmentId` sudah ada sejak lama,
// tetapi tidak ada satu pun jalur yang MEMPRODUKSI nilainya untuk dokumen
// gudang — jadi kolomnya selalu null dan halaman cetak IRF tidak pernah bisa
// menampilkan tanda tangan bergambar.
//
// Aturan yang dipegang, dan ini yang membedakannya dari sekadar unggah file:
//
//  - BARIS TANDA TANGANNYA HARUS SUDAH ADA. Gambar dilampirkan pada tanda
//    tangan yang memang sudah dibubuhkan seseorang, bukan menciptakan tanda
//    tangan baru dari sebuah berkas. Nama penanda tangan tetap yang wajib —
//    itulah yang masih terbaca bertahun-tahun kemudian saat berkas gambarnya
//    sudah tidak bisa dibuka.
//
//  - IZINNYA MENGIKUTI DOKUMENNYA, bukan satu izin "boleh unggah". Siapa yang
//    boleh menyentuh tanda tangan sebuah IRF adalah pertanyaan tentang IRF,
//    bukan tentang berkas.
//
// Catatan kenapa RECOVERY_PICKUP tidak memakai jalur ini: di penarikan
// perangkat, gambar diunggah LEBIH DULU (dari kanvas di lapangan) lalu id-nya
// dikirim bersama nama penanda tangan — barisnya belum ada saat berkas
// disimpan. Karena itu Fase 48 menjangkarkannya pada penarikannya sendiri.
// Di dokumen gudang urutannya terbalik: IRF diterbitkan beserta tanda
// tangannya, gambar menyusul.

type Result = { ok: true; id: string } | { ok: false; error: string };

/// entityType lampiran gambar tanda tangan dokumen.
export const SIGNATURE_IMAGE_ENTITY = "DocumentSignatureImage";

/**
 * Jenis dokumen yang gambarnya boleh dilampirkan lewat jalur ini, beserta
 * izin yang mengaturnya.
 *
 * Daftar tertutup dan gagal-tertutup: jenis yang tidak terdaftar DITOLAK,
 * bukan dilewatkan. Kalau kelak ada dokumen bertanda tangan baru, ia harus
 * didaftarkan di sini secara sadar — pilihan ini yang mencegah dokumen baru
 * diam-diam bisa disentuh siapa saja.
 */
const SIGNABLE_DOCS: Record<string, { permission: string; label: string }> = {
  IRF: { permission: PERMISSIONS.STOCK_CREATE, label: "Inventory Request Form" },
  DO: { permission: PERMISSIONS.STOCK_CREATE, label: "Delivery Order" },
  RECEIPT: { permission: PERMISSIONS.STOCK_RECEIVE, label: "Bukti Terima" },
};

export function isSignableDocType(docType: string): boolean {
  return docType in SIGNABLE_DOCS;
}

export interface SignatureTarget {
  docType: string;
  docId: string;
  role: string;
}

/**
 * Melampirkan gambar tanda tangan pada baris tanda tangan yang sudah ada.
 *
 * Mengembalikan attachmentId, sekaligus menautkannya ke barisnya — pemanggil
 * tidak perlu melakukan langkah kedua yang bisa terlupakan.
 */
export async function attachSignatureImage(
  user: CurrentUser,
  target: SignatureTarget,
  file: File
): Promise<Result> {
  const spec = SIGNABLE_DOCS[target.docType];
  if (!spec) {
    return { ok: false, error: `Jenis dokumen "${target.docType}" tidak menerima gambar tanda tangan.` };
  }
  if (!user.permissions.has(spec.permission)) {
    return { ok: false, error: `Anda tidak memiliki izin menyentuh tanda tangan ${spec.label}.` };
  }

  const signature = await db.documentSignature.findUnique({
    where: {
      docType_docId_role: {
        docType: target.docType,
        docId: target.docId,
        role: target.role,
      },
    },
    select: { id: true, signerName: true, attachmentId: true },
  });
  if (!signature) {
    return {
      ok: false,
      error: "Tanda tangan belum dibubuhkan — isi nama penanda tangannya lebih dulu.",
    };
  }

  const saved = await saveAttachment(file, SIGNATURE_IMAGE_ENTITY, signature.id, user.id);
  if (!saved.ok) return saved;

  await db.documentSignature.update({
    where: { id: signature.id },
    data: { attachmentId: saved.id },
  });
  await logAudit({
    userId: user.id,
    action: "SIGNATURE_IMAGE_ATTACH",
    module: "inventory",
    entityType: "DocumentSignature",
    entityId: signature.id,
    description:
      `Melampirkan gambar tanda tangan ${target.role} pada ${spec.label} ` +
      `(${target.docId}) — penanda tangan ${signature.signerName}` +
      // Penggantian gambar lama dicatat eksplisit: berkas lama tetap ada di
      // penyimpanan, dan tanpa catatan ini tidak ada yang tahu ia pernah
      // menjadi tanda tangan resmi dokumen tersebut.
      (signature.attachmentId ? " (mengganti gambar sebelumnya)" : ""),
  });
  return { ok: true, id: saved.id };
}

/** Tanda tangan sebuah dokumen beserta status gambarnya — untuk halaman cetak. */
export async function documentSignatures(docType: string, docId: string) {
  return db.documentSignature.findMany({
    where: { docType, docId },
    select: {
      id: true,
      role: true,
      signerName: true,
      signedAt: true,
      attachmentId: true,
      signerUser: { select: { name: true } },
    },
    orderBy: { signedAt: "asc" },
  });
}
