import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import type { CurrentUser } from "@/lib/rbac";

// ── Arsip Terpadu (Fase 47) ─────────────────────────────────────
//
// Satu tempat untuk semua yang dikeluarkan dari peredaran, menggantikan
// kebiasaan menghapus baris. Prinsipnya: tidak ada yang hilang tanpa alasan,
// dan yang keluar harus bisa dipanggil kembali.
//
// Yang TIDAK dilakukan di sini, sengaja:
//
//  - Tidak ada `deletedAt` di model mana pun. Alasannya ditulis di komentar
//    model ArchivedRecord.
//  - Tidak ada penghapusan permanen. Tidak ada jalurnya sama sekali, bukan
//    sekadar tidak ada tombolnya — sehingga tidak bisa "dibuka sedikit" nanti.
//  - Tidak menggantikan status lifecycle. Invoice yang dibatalkan tetap
//    memakai VOID + voidReason karena itu menyimpan MAKNA bisnis. Arsip
//    dipakai saat sebuah baris memang harus keluar dari daftar.

type Result<T = undefined> =
  | { ok: true; id: string; data?: T }
  | { ok: false; error: string };

/**
 * Cara sebuah jenis entitas dikembalikan ke peredaran.
 *
 * Pemulihan TIDAK bisa generik: mengarsipkan User berarti menonaktifkannya,
 * mengarsipkan hal lain berarti hal lain. Tanpa daftar ini tombol "Pulihkan"
 * akan menandai baris sebagai pulih tanpa benar-benar memulihkan apa pun —
 * berbohong kepada orang yang menekannya.
 */
type Restorer = (entityId: string) => Promise<{ ok: true } | { ok: false; error: string }>;

const RESTORERS: Record<string, Restorer> = {
  User: async (entityId) => {
    const target = await db.user.findUnique({ where: { id: entityId } });
    if (!target) return { ok: false, error: "Akun sudah tidak ada di basis data." };
    await db.user.update({
      where: { id: entityId },
      data: {
        isActive: true,
        frozenAt: null,
        freezeReason: null,
        // Sesi lama tidak boleh hidup kembali bersama akunnya: selama beku,
        // token yang tersimpan di perangkat bisa saja berpindah tangan.
        sessionEpoch: { increment: 1 },
      },
    });
    return { ok: true };
  },
};

export function isRestorable(entityType: string): boolean {
  return entityType in RESTORERS;
}

export interface ArchiveInput {
  entityType: string;
  entityId: string;
  /** Teks yang dikenali manusia — inilah yang dibaca di halaman arsip. */
  label: string;
  /** Isi baris saat diarsipkan. Objek apa pun; disimpan sebagai JSON. */
  snapshot: unknown;
  reason: string;
}

/**
 * Mencatat pengarsipan sebuah baris.
 *
 * Tidak mengubah entitasnya sendiri — pemanggil yang tahu apa arti "keluar
 * dari peredaran" untuk jenisnya. Fungsi ini menjamin satu hal saja, dan
 * menjaminnya keras: tidak ada yang masuk arsip tanpa alasan tertulis.
 */
export async function archiveRecord(
  /** null bila pelakunya penyapu terjadwal, bukan orang. */
  actorId: string | null,
  input: ArchiveInput
): Promise<Result> {
  const reason = input.reason?.trim() ?? "";
  if (reason.length < 3) {
    return { ok: false, error: "Alasan pengarsipan wajib diisi (minimal 3 karakter)." };
  }
  if (!input.entityType?.trim() || !input.entityId?.trim()) {
    return { ok: false, error: "Jenis dan id entitas wajib diisi." };
  }
  const label = input.label?.trim() || `${input.entityType} ${input.entityId}`;

  let snapshot: string;
  try {
    snapshot = JSON.stringify(input.snapshot ?? null);
  } catch {
    // Snapshot yang tidak bisa diserialkan (siklus objek) tidak boleh
    // menggagalkan pengarsipan — lebih baik arsip tanpa isi daripada baris
    // yang keluar dari peredaran tanpa jejak sama sekali.
    snapshot = JSON.stringify({ error: "snapshot tidak dapat diserialkan" });
  }

  const row = await db.archivedRecord.create({
    data: {
      entityType: input.entityType.trim(),
      entityId: input.entityId.trim(),
      label,
      snapshot,
      reason,
      archivedById: actorId,
    },
  });
  await logAudit({
    userId: actorId ?? undefined,
    action: "ARCHIVE_RECORD",
    module: "archive",
    entityType: input.entityType,
    entityId: input.entityId,
    description: `Mengarsipkan ${input.entityType}: ${label} — ${reason}`,
  });
  return { ok: true, id: row.id };
}

/** Memulihkan baris yang diarsipkan ke peredaran. */
export async function restoreRecord(user: CurrentUser, id: string): Promise<Result> {
  const row = await db.archivedRecord.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "Baris arsip tidak ditemukan." };
  if (row.restoredAt) {
    return { ok: false, error: `Sudah dipulihkan pada ${row.restoredAt.toLocaleDateString("id-ID")}.` };
  }
  const restorer = RESTORERS[row.entityType];
  if (!restorer) {
    return {
      ok: false,
      error: `Jenis "${row.entityType}" belum memiliki jalur pemulihan otomatis — pulihkan lewat modulnya.`,
    };
  }
  const done = await restorer(row.entityId);
  if (!done.ok) return { ok: false, error: done.error };

  await db.archivedRecord.update({
    where: { id },
    data: { restoredById: user.id, restoredAt: new Date() },
  });
  await logAudit({
    userId: user.id,
    action: "ARCHIVE_RESTORE",
    module: "archive",
    entityType: row.entityType,
    entityId: row.entityId,
    description: `Memulihkan ${row.entityType}: ${row.label}`,
  });
  return { ok: true, id };
}

export interface ArchiveFilter {
  entityType?: string;
  /** Baris yang sudah dipulihkan tetap ditampilkan secara default — itu bagian dari jejaknya. */
  onlyPending?: boolean;
  /** Batas bawah tanggal diarsipkan, inklusif. */
  from?: Date | null;
  /**
   * Batas atas tanggal diarsipkan, INKLUSIF sampai akhir hari.
   *
   * Frontend mengirim tanggal polos dari `<input type="date">`, yang menjadi
   * tengah malam. Memakainya apa adanya sebagai batas atas akan membuang
   * seluruh baris pada hari itu sendiri — orang memilih "sampai 12 Agustus"
   * lalu tidak melihat apa pun dari tanggal 12. Karena itu batasnya digeser
   * ke akhir hari di sini, bukan diserahkan ke pemanggil untuk diingat.
   */
  to?: Date | null;
  take?: number;
}

/** Akhir hari dari sebuah tanggal — 23:59:59.999 waktu lokal. */
export function endOfDay(d: Date): Date {
  const x = new Date(d.getTime());
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Menyusun rentang tanggal untuk query, atau undefined bila tak ada batas. */
export function archivedAtRange(
  from?: Date | null,
  to?: Date | null
): { gte?: Date; lte?: Date } | undefined {
  const valid = (d?: Date | null) => (d && !Number.isNaN(d.getTime()) ? d : null);
  const lo = valid(from);
  const hi = valid(to);
  if (!lo && !hi) return undefined;
  return {
    ...(lo ? { gte: lo } : {}),
    ...(hi ? { lte: endOfDay(hi) } : {}),
  };
}

export async function listArchive(filter: ArchiveFilter = {}) {
  const range = archivedAtRange(filter.from, filter.to);
  return db.archivedRecord.findMany({
    where: {
      ...(filter.entityType ? { entityType: filter.entityType } : {}),
      ...(filter.onlyPending ? { restoredAt: null } : {}),
      ...(range ? { archivedAt: range } : {}),
    },
    include: {
      archivedBy: { select: { name: true, username: true } },
      restoredBy: { select: { name: true, username: true } },
    },
    orderBy: { archivedAt: "desc" },
    take: filter.take ?? 200,
  });
}

/** Jenis entitas yang pernah masuk arsip — untuk mengisi penyaring di UI. */
export async function archivedEntityTypes(): Promise<string[]> {
  const rows = await db.archivedRecord.findMany({
    distinct: ["entityType"],
    select: { entityType: true },
    orderBy: { entityType: "asc" },
  });
  return rows.map((r) => r.entityType);
}
