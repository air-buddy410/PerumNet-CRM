// ── Membaca berkas & riwayat pelanggan (Fase 86) ────────────────
//
// Aturannya ada di `customer-dossier.ts` dan sudah diuji tanpa basis data.

import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { saveAttachment } from "@/lib/files";
import {
  JENIS_BERKAS,
  LABEL_BERKAS,
  ENTITAS_TERKAIT,
  susunRiwayat,
  jenisBerkasSah,
  type BarisRiwayat,
  type EntityBerkas,
} from "@/lib/customer-dossier";

export interface BerkasPelanggan {
  id: string;
  jenis: EntityBerkas;
  label: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
  uploadedBy: string;
}

/** Semua berkas milik satu pelanggan, lintas jenis. */
export async function loadBerkasPelanggan(customerId: string): Promise<BerkasPelanggan[]> {
  const rows = await db.attachment.findMany({
    where: {
      entityId: customerId,
      entityType: { in: Object.values(JENIS_BERKAS) },
    },
    select: {
      id: true,
      entityType: true,
      filename: true,
      mimeType: true,
      size: true,
      createdAt: true,
      uploadedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return rows.map((r) => ({
    id: r.id,
    jenis: r.entityType as EntityBerkas,
    label: LABEL_BERKAS[r.entityType as EntityBerkas] ?? r.entityType,
    filename: r.filename,
    mimeType: r.mimeType,
    size: r.size,
    uploadedAt: r.createdAt,
    uploadedBy: r.uploadedBy.name,
  }));
}

/**
 * Menyimpan satu berkas pelanggan.
 *
 * Seluruh pemeriksaan isi berkas dikerjakan `saveAttachment` yang sudah ada —
 * ukuran, MIME dipasangkan dengan extension, dan magic-byte dicocokkan dengan
 * MIME yang diakui. Yang ditambahkan di sini hanya penjagaan jenis dan
 * pencatatan audit.
 */
export async function simpanBerkasPelanggan(
  customerId: string,
  jenis: string,
  file: File,
  userId: string
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!jenisBerkasSah(jenis)) {
    return { ok: false, error: `Jenis berkas "${jenis}" tidak dikenal.` };
  }
  const pelanggan = await db.customer.findUnique({
    where: { id: customerId },
    select: { id: true, customerNumber: true },
  });
  if (!pelanggan) return { ok: false, error: "Pelanggan tidak ditemukan." };

  const hasil = await saveAttachment(file, jenis, customerId, userId);
  if (!hasil.ok) return hasil;

  await logAudit({
    userId,
    action: "CUSTOMER_FILE_UPLOAD",
    module: "customers",
    entityType: "Customer",
    entityId: customerId,
    description: `Mengunggah ${LABEL_BERKAS[jenis]} untuk ${pelanggan.customerNumber}: ${file.name}`,
  });
  return hasil;
}

/**
 * Riwayat perubahan seorang pelanggan.
 *
 * Menjaring lintas entitas terkait, bukan hanya `Customer` — perubahan yang
 * paling berarti bagi pelanggan tercatat pada langganan, tagihan, atau
 * isolirnya. Lihat alasan lengkapnya di `customer-dossier.ts`.
 */
export async function loadRiwayatPelanggan(
  customerId: string,
  batas = 100
): Promise<BarisRiwayat[]> {
  const langganan = await db.subscription.findMany({
    where: { customerId },
    select: { id: true },
  });
  const idTerkait = [customerId, ...langganan.map((s) => s.id)];

  const rows = await db.auditLog.findMany({
    where: {
      entityType: { in: [...ENTITAS_TERKAIT] },
      entityId: { in: idTerkait },
    },
    select: {
      createdAt: true,
      action: true,
      module: true,
      description: true,
      user: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: batas,
  });

  return susunRiwayat(rows);
}

/**
 * Mencatat bahwa seseorang membuka berkas pelanggan.
 *
 * SOP §21 menuntut jejak akses untuk unduhan yang peka. Dipanggil dari rute
 * penyajian berkas, bukan dari layar — layar bisa dilewati, rutenya tidak.
 */
export async function catatUnduhBerkas(
  attachmentId: string,
  entityType: string,
  entityId: string,
  userId: string
): Promise<void> {
  await logAudit({
    userId,
    action: "CUSTOMER_FILE_DOWNLOAD",
    module: "customers",
    entityType: "Customer",
    entityId,
    description: `Membuka ${LABEL_BERKAS[entityType as EntityBerkas] ?? entityType} (lampiran ${attachmentId}).`,
  });
}
