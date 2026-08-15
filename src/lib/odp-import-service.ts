import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/constants";
import { parseOdpBlocks, type OdpRow, type RowIssue } from "@/lib/odp-import";
import type { CurrentUser } from "@/lib/rbac";

// ── Penerapan ODP & Master Splitter (Fase 72) ───────────────────
//
// Membangun tulang punggung distribusi: Master Splitter sebagai simpul induk,
// ODP menggantung di bawahnya, dan port bernomor di bawah tiap ODP.
//
// Urutannya tidak bisa dibalik. MS harus ada sebelum ODP yang menunjuknya,
// dan ODP harus ada sebelum portnya. Karena berkas sumber tidak menjamin
// urutan itu — anak sering muncul sebelum induknya — penerapan dilakukan
// dalam DUA lintasan: semua simpul dulu, baru kaitan induknya.

/**
 * Kapasitas port bila berkas tidak menyebutnya.
 *
 * Delapan, sama dengan importir pelanggan, dan alasannya sama: itu ukuran ODP
 * terkecil yang lazim. Sebagian besar baris di berkas MEMANG menyebut
 * kapasitasnya (230 dari 286), jadi angka ini hanya menambal sisanya.
 */
export const KAPASITAS_BAWAAN = 8;

export type Tindakan = "CREATE" | "LENGKAPI" | "SKIP";

export interface OdpPlan {
  rowNumber: number;
  code: string;
  role: string;
  action: Tindakan;
  reason: string | null;
  changes: string[];
  notes: string[];
  /** Berapa pelanggan yang disebut menempati port ODP ini. */
  occupants: number;
}

export interface ImportPlan {
  ok: boolean;
  odps: OdpPlan[];
  issues: RowIssue[];
  skipped: number;
  ignoredBlocks: number;
  willCreate: number;
  willComplete: number;
  willSkip: number;
  willCreateMs: number;
  willCreatePorts: number;
  /** Kaitan induk yang akan dipasang. */
  willLinkParents: number;
  /** Nama pelanggan di kolom port yang tidak ketemu di basis data. */
  unmatchedOccupants: string[];
}

export interface ImportOutcome {
  created: string[];
  completed: { code: string; fields: string[] }[];
  createdPorts: number;
  linkedParents: number;
  linkedOccupants: number;
  skipped: number;
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** Bidang ODP yang BOLEH ditulis lewat impor — daftar tertutup. */
const KOLOM = ["latitude", "longitude", "opticPowerDbm", "portCapacity", "role", "status"] as const;

function odpChanges(
  lama: {
    latitude: number | null;
    longitude: number | null;
    opticPowerDbm: number | null;
    portCapacity: number;
    role: string;
  },
  baru: OdpRow
): { key: (typeof KOLOM)[number]; ringkas: string }[] {
  const out: { key: (typeof KOLOM)[number]; ringkas: string }[] = [];
  // Hanya MENGISI yang kosong. Koordinat yang sudah ada di aplikasi mungkin
  // hasil pengukuran ulang teknisi yang lebih baru daripada spreadsheet.
  if (lama.latitude === null && baru.latitude !== null) out.push({ key: "latitude", ringkas: "Koordinat diisi" });
  if (lama.opticPowerDbm === null && baru.opticPowerDbm !== null) {
    out.push({ key: "opticPowerDbm", ringkas: `Redaman: ${baru.opticPowerDbm} dBm` });
  }
  // Kapasitas hanya DINAIKKAN. Menurunkannya bisa membuat port yang sudah
  // ditempati pelanggan berada di luar kapasitas — angka yang mustahil
  // dibaca siapa pun.
  if (baru.portCapacity !== null && baru.portCapacity > lama.portCapacity) {
    out.push({ key: "portCapacity", ringkas: `Kapasitas: ${lama.portCapacity} → ${baru.portCapacity}` });
  }
  if (lama.role !== baru.role && baru.role === "MS") out.push({ key: "role", ringkas: "Ditandai Master Splitter" });
  return out;
}

async function toBlocks(user: CurrentUser, file: File): Promise<Result<string[][][]>> {
  if (!user.permissions.has(PERMISSIONS.FTTH_MANAGE)) {
    return { ok: false, error: "Anda tidak memiliki izin mengelola data FTTH." };
  }
  if (!file || file.size === 0) return { ok: false, error: "Berkas kosong." };
  const { readAllSheetRows, XlsxError } = await import("@/lib/xlsx-read");
  try {
    return { ok: true, data: readAllSheetRows(Buffer.from(await file.arrayBuffer())) };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof XlsxError ? e.message : `Berkas tidak terbaca: ${(e as Error).message}`,
    };
  }
}

export async function buildOdpPlan(blocks: string[][][]): Promise<Result<{ plan: ImportPlan; rows: OdpRow[] }>> {
  const parsed = parseOdpBlocks(blocks);
  const lamaSemua = await db.odp.findMany({
    select: { id: true, code: true, latitude: true, longitude: true, opticPowerDbm: true, portCapacity: true, role: true },
  });
  const byCode = new Map(lamaSemua.map((o) => [o.code, o]));

  // Nama pelanggan pada kolom port dicocokkan ke Customer. Dicocokkan
  // persis (setelah diseragamkan spasi & huruf) — nama yang mirip TIDAK
  // dianggap sama, sebab menaruh orang di port tetangga adalah kesalahan
  // yang baru ketahuan saat ada gangguan.
  const rapi = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const pelanggan = new Map<string, number>();
  for (const c of await db.customer.findMany({ select: { name: true } })) {
    pelanggan.set(rapi(c.name), (pelanggan.get(rapi(c.name)) ?? 0) + 1);
  }

  const odps: OdpPlan[] = [];
  const unmatched = new Set<string>();
  let willCreatePorts = 0;
  let willLinkParents = 0;

  for (const r of parsed.rows) {
    for (const o of r.occupants) {
      // Nama yang muncul lebih dari sekali TIDAK dipakai — dua orang bernama
      // sama berarti tidak ada yang bisa dipilih tanpa menebak.
      if ((pelanggan.get(rapi(o.customerName)) ?? 0) !== 1) unmatched.add(o.customerName);
    }
    if (r.parentRef) willLinkParents++;

    const lama = byCode.get(r.code);
    if (!lama) {
      willCreatePorts += r.portCapacity ?? KAPASITAS_BAWAAN;
      odps.push({
        rowNumber: r.rowNumber, code: r.code, role: r.role,
        action: "CREATE", reason: null, changes: [], notes: r.notes, occupants: r.occupants.length,
      });
      continue;
    }
    const changes = odpChanges(lama, r);
    odps.push({
      rowNumber: r.rowNumber, code: r.code, role: r.role,
      action: changes.length ? "LENGKAPI" : "SKIP",
      reason: changes.length ? null : "Sudah ada dan lengkap.",
      changes: changes.map((c) => c.ringkas),
      notes: r.notes,
      occupants: r.occupants.length,
    });
  }

  return {
    ok: true,
    data: {
      plan: {
        ok: parsed.issues.length === 0,
        odps,
        issues: parsed.issues,
        skipped: parsed.skipped,
        ignoredBlocks: parsed.ignoredBlocks,
        willCreate: odps.filter((o) => o.action === "CREATE").length,
        willComplete: odps.filter((o) => o.action === "LENGKAPI").length,
        willSkip: odps.filter((o) => o.action === "SKIP").length,
        willCreateMs: odps.filter((o) => o.action === "CREATE" && o.role === "MS").length,
        willCreatePorts,
        willLinkParents,
        unmatchedOccupants: [...unmatched],
      },
      rows: parsed.rows,
    },
  };
}

export async function previewOdpImport(user: CurrentUser, file: File): Promise<Result<ImportPlan>> {
  const b = await toBlocks(user, file);
  if (!b.ok) return b;
  const r = await buildOdpPlan(b.data);
  return r.ok ? { ok: true, data: r.data.plan } : r;
}

export async function applyOdpImport(
  user: CurrentUser,
  file: File,
  opts?: { allowPartial?: boolean }
): Promise<Result<ImportOutcome>> {
  const b = await toBlocks(user, file);
  if (!b.ok) return b;
  return applyOdpFromBlocks(user, b.data, opts);
}

/**
 * Jalur yang sama, tetapi menerima tabel teks langsung.
 *
 * Dipakai oleh perkakas baris perintah yang sumbernya bukan berkas unggahan —
 * salinan sistem lain, misalnya. Sengaja BERBAGI seluruh badan dengan jalur
 * unggahan: kalau keduanya bercabang, aturan yang diuji hanya berlaku untuk
 * salah satunya dan tidak ada yang menyadarinya.
 */
export async function applyOdpFromBlocks(
  user: CurrentUser,
  blocks: string[][][],
  opts?: { allowPartial?: boolean }
): Promise<Result<ImportOutcome>> {
  const r = await buildOdpPlan(blocks);
  if (!r.ok) return r;
  const { plan, rows } = r.data;

  if (!plan.ok && !opts?.allowPartial) {
    return { ok: false, error: `Berkas memuat ${plan.issues.length} masalah. Perbaiki, atau terapkan sebagian dengan sadar.` };
  }

  const outcome: ImportOutcome = {
    created: [], completed: [], createdPorts: 0, linkedParents: 0, linkedOccupants: 0, skipped: plan.willSkip,
  };

  const rapi = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

  await db.$transaction(async (prisma) => {
    // ── Lintasan 1: seluruh simpul, tanpa kaitan induk ──
    for (const row of rows) {
      const rencana = plan.odps.find((o) => o.code === row.code);
      if (!rencana || rencana.action === "SKIP") continue;

      const kapasitas = row.portCapacity ?? KAPASITAS_BAWAAN;
      if (rencana.action === "CREATE") {
        const odp = await prisma.odp.create({
          data: {
            code: row.code,
            role: row.role,
            status: row.status,
            latitude: row.latitude,
            longitude: row.longitude,
            opticPowerDbm: row.opticPowerDbm,
            portCapacity: kapasitas,
            notes: [
              row.oltRef ? `OLT menurut berkas: ${row.oltRef}` : null,
              row.ponRef ? `PIU: ${row.ponRef}` : null,
              row.parentPort ? `Port MS: ${row.parentPort}` : null,
              ...row.notes,
            ].filter(Boolean).join(" · ") || null,
          },
        });
        // Port dibuat BERURUTAN 1..kapasitas. Nomor port sebenarnya belum
        // tersedia di data mana pun; yang penting strukturnya berdiri, dan
        // penomoran ulang nanti cukup memindahkan tautan, bukan membuat ulang.
        await prisma.odpPort.createMany({
          data: Array.from({ length: kapasitas }, (_, i) => ({ odpId: odp.id, portNumber: i + 1 })),
        });
        outcome.created.push(row.code);
        outcome.createdPorts += kapasitas;
        continue;
      }

      const ubah: Record<string, unknown> = {};
      for (const c of rencana.changes) {
        if (c.startsWith("Koordinat")) { ubah.latitude = row.latitude; ubah.longitude = row.longitude; }
        else if (c.startsWith("Redaman")) ubah.opticPowerDbm = row.opticPowerDbm;
        else if (c.startsWith("Kapasitas")) ubah.portCapacity = row.portCapacity;
        else if (c.startsWith("Ditandai")) ubah.role = row.role;
      }
      if (Object.keys(ubah).length) {
        const kini = await prisma.odp.update({ where: { code: row.code }, data: ubah, select: { id: true, portCapacity: true } });
        // Menaikkan angka kapasitas tanpa membuat barisnya menghasilkan ODP
        // yang MENGAKU punya ruang tetapi tidak punya port untuk ditempati —
        // pelanggan tetap menganggur, dan angkanya justru menutupi sebabnya.
        const ada = new Set(
          (await prisma.odpPort.findMany({ where: { odpId: kini.id }, select: { portNumber: true } }))
            .map((x) => x.portNumber)
        );
        const kurang = Array.from({ length: kini.portCapacity }, (_, i) => i + 1).filter((n) => !ada.has(n));
        if (kurang.length) {
          await prisma.odpPort.createMany({ data: kurang.map((portNumber) => ({ odpId: kini.id, portNumber })) });
          outcome.createdPorts += kurang.length;
        }
        outcome.completed.push({ code: row.code, fields: Object.keys(ubah) });
      }
    }

    // ── Lintasan 2: kaitan induk, sesudah semua simpul ada ──
    const idByCode = new Map(
      (await prisma.odp.findMany({ select: { id: true, code: true } })).map((o) => [o.code, o.id])
    );
    for (const row of rows) {
      if (!row.parentRef) continue;
      const anak = idByCode.get(row.code);
      const induk = idByCode.get(row.parentRef);
      // Induk yang menunjuk dirinya sendiri ditolak diam-diam; itu lingkaran
      // yang akan membuat penelusuran kaskade berputar tanpa henti.
      if (!anak || !induk || anak === induk) continue;
      await prisma.odp.update({ where: { id: anak }, data: { parentId: induk } });
      outcome.linkedParents++;
    }

    // ── Lintasan 3: pelanggan yang menempati port ──
    for (const row of rows) {
      if (row.occupants.length === 0) continue;
      const odpId = idByCode.get(row.code);
      if (!odpId) continue;
      for (const o of row.occupants) {
        const cocok = await prisma.customer.findMany({
          where: { name: { equals: o.customerName.trim(), mode: "insensitive" } },
          select: { subscriptions: { select: { id: true }, take: 2 } },
          take: 2,
        });
        // Nama ganda TIDAK dipilih salah satunya, dan pelanggan tanpa
        // langganan tidak punya apa pun untuk ditautkan ke port.
        if (cocok.length !== 1 || cocok[0].subscriptions.length !== 1) continue;
        const port = await prisma.odpPort.findFirst({
          where: { odpId, portNumber: o.portNumber, subscriptionId: null },
          select: { id: true },
        });
        if (!port) continue;
        await prisma.odpPort.update({
          where: { id: port.id },
          data: { subscriptionId: cocok[0].subscriptions[0].id, status: "USED" },
        });
        outcome.linkedOccupants++;
      }
    }

    // `portUsed` adalah turunan; dihitung ulang dari kenyataan, bukan
    // ditambah satu per satu — penjumlahan bertahap akan meleset kalau
    // impor diulang.
    for (const code of new Set(rows.map((x) => x.code))) {
      const odpId = idByCode.get(code);
      if (!odpId) continue;
      const dipakai = await prisma.odpPort.count({ where: { odpId, subscriptionId: { not: null } } });
      await prisma.odp.update({ where: { id: odpId }, data: { portUsed: dipakai } });
    }
  });

  await logAudit({
    userId: user.id,
    action: "ODP_IMPORT",
    module: "noc",
    entityType: "Odp",
    description:
      `Impor ODP: ${outcome.created.length} dibuat, ${outcome.completed.length} dilengkapi, ` +
      `${outcome.createdPorts} port, ${outcome.linkedParents} kaitan induk, ` +
      `${outcome.linkedOccupants} pelanggan tertaut ke port.`,
    metadata: {
      dibuat: outcome.created.length,
      dilengkapi: outcome.completed.length,
      port: outcome.createdPorts,
      induk: outcome.linkedParents,
      pelangganTertaut: outcome.linkedOccupants,
      namaTidakCocok: plan.unmatchedOccupants.length,
    },
  });

  return { ok: true, data: outcome };
}
