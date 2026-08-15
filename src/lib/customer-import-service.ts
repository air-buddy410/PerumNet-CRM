import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/constants";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-rules";
import { readSheetRows, XlsxError } from "@/lib/xlsx-read";
import { parseCustomerSheet, type CustomerRow, type RowIssue } from "@/lib/customer-import";
import type { CurrentUser } from "@/lib/rbac";

// ── Impor pelanggan & langganan: pratinjau & penerapan (Fase 68) ─
//
// Dua sifat yang sama dengan importir katalog dan pegawai, dan keduanya
// disengaja: PENERAPAN MEMBACA ULANG BERKASNYA, dan SEMUA ATAU TIDAK SAMA
// SEKALI. Impor pelanggan yang separuh jauh lebih sulit dibereskan daripada
// yang ditolak — yang separuh sudah punya nomor layanan, sudah menempati port
// ODP, dan menjalankan ulang berkas yang sama akan menabrak keunikannya.
//
// Yang KHAS di sini: impor ini membuat MASTER JARINGAN sebagai efek samping.
// ODP yang disebut pelanggan belum tentu ada di aplikasi, dan tanpa ODP tidak
// ada port untuk ditempati. ODP dibuat dengan kapasitas dugaan yang ditandai
// terang-terangan — lihat KAPASITAS_ODP_DUGAAN di bawah.

/**
 * Kapasitas port bawaan untuk ODP yang dibuat lewat impor.
 *
 * Sumbernya TIDAK memuat kapasitas ODP sama sekali. Delapan dipilih karena
 * itu ukuran ODP terkecil yang lazim, dan karena pada data yang ada tidak ada
 * satu pun ODP yang melayani lebih dari lima pelanggan.
 *
 * Angka ini HAMPIR PASTI TERLALU KECIL untuk sebagian ODP: ekspor ini hanya
 * memuat pelanggan 2026, sedangkan tiang yang sama juga melayani pelanggan
 * lama yang datanya ada di Wifinetbill. Karena itu tiap ODP yang dibuat
 * lewat jalur ini diberi catatan yang menyebut angkanya dugaan — supaya
 * okupansi yang terlihat "penuh" tidak dikira kenyataan.
 */
export const KAPASITAS_ODP_DUGAAN = 8;

const CATATAN_ODP = "Dibuat dari impor pelanggan; kapasitas port masih dugaan dan perlu diverifikasi di lapangan.";

export type Tindakan = "CREATE" | "LENGKAPI" | "SKIP";

export interface CustomerPlan {
  rowNumber: number;
  cid: string;
  name: string;
  action: Tindakan;
  reason: string | null;
  changes: string[];
  notes: string[];
}

export interface OdpPlan {
  code: string;
  action: "CREATE" | "SKIP";
  /** Berapa pelanggan pada berkas ini yang menunjuk ODP tersebut. */
  customers: number;
}

export interface ImportPlan {
  ok: boolean;
  customers: CustomerPlan[];
  odps: OdpPlan[];
  issues: RowIssue[];
  skipped: number;
  willCreateCustomers: number;
  willCompleteCustomers: number;
  willSkipCustomers: number;
  willCreateOdps: number;
  willCreateSubscriptions: number;
  /** Paket pada berkas yang tidak ada padanannya di master. */
  unknownPackages: string[];
  /** Nama sales pada berkas yang tidak ada padanannya di tabel User. */
  unknownSales: string[];
}

export interface ImportOutcome {
  createdOdps: string[];
  createdCustomers: { cid: string; customerNumber: string; name: string }[];
  completedCustomers: { cid: string; fields: string[] }[];
  createdSubscriptions: number;
  linkedOdpPorts: number;
  skipped: number;
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

// ── Pembacaan berkas ────────────────────────────────────────────

async function toRows(user: CurrentUser, file: File): Promise<Result<string[][]>> {
  if (!user.permissions.has(PERMISSIONS.CUSTOMERS_CREATE)) {
    return { ok: false, error: "Anda tidak memiliki izin membuat pelanggan." };
  }
  if (!user.permissions.has(PERMISSIONS.SUBSCRIPTIONS_CREATE)) {
    return { ok: false, error: "Impor ini juga membuat langganan — izin subscriptions.create wajib." };
  }
  if (!file || file.size === 0) return { ok: false, error: "Berkas kosong." };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: `Berkas terlalu besar (maksimal ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB).` };
  }
  try {
    return { ok: true, data: readSheetRows(Buffer.from(await file.arrayBuffer())) };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof XlsxError ? e.message : `Berkas tidak terbaca: ${(e as Error).message}`,
    };
  }
}

// ── Penyusunan rencana ──────────────────────────────────────────

/** Bidang pelanggan yang BOLEH ditulis lewat impor — daftar tertutup. */
const KOLOM_PELANGGAN = ["identityNumber", "birthDate", "email", "latitude", "longitude"] as const;

function pelangganChanges(
  lama: {
    identityNumber: string | null;
    birthDate: Date | null;
    email: string | null;
    latitude: number | null;
    longitude: number | null;
  },
  baru: CustomerRow
): { key: (typeof KOLOM_PELANGGAN)[number]; ringkas: string }[] {
  const out: { key: (typeof KOLOM_PELANGGAN)[number]; ringkas: string }[] = [];
  // Hanya MENGISI yang kosong. Nama, telepon, dan alamat tidak pernah ditimpa
  // lewat impor: data di aplikasi bisa saja hasil koreksi CS yang lebih baru
  // daripada spreadsheet, dan mengembalikannya ke versi lama tanpa diminta
  // adalah kerusakan yang tidak meninggalkan jejak.
  if (!lama.identityNumber && baru.identityNumber) out.push({ key: "identityNumber", ringkas: "NIK diisi" });
  if (!lama.birthDate && baru.birthDate) out.push({ key: "birthDate", ringkas: "Tanggal lahir diisi" });
  if (!lama.email && baru.email) out.push({ key: "email", ringkas: "Email diisi" });
  if (lama.latitude === null && baru.latitude !== null) out.push({ key: "latitude", ringkas: "Koordinat diisi" });
  if (lama.longitude === null && baru.longitude !== null) out.push({ key: "longitude", ringkas: "Koordinat diisi" });
  return out;
}

interface Rencana {
  plan: ImportPlan;
  rows: CustomerRow[];
  /** id Package per nama paket di berkas. */
  paket: Map<string, string>;
  /** id User per nama sales di berkas. */
  sales: Map<string, string>;
}

/**
 * Menyusun rencana dari tabel teks — TANPA menulis apa pun.
 *
 * Diekspor supaya bisa diuji kering terhadap ekspor asli tanpa membangun
 * berkas xlsx tiruan lebih dulu. Pratinjau dan penerapan sama-sama lewat
 * sini, jadi yang diuji memang jalur yang dipakai.
 */
export async function buildPlan(sheet: string[][]): Promise<Result<Rencana>> {
  const parsed = parseCustomerSheet(sheet);

  const [paketDb, userDb, customerDb, odpDb] = await Promise.all([
    db.package.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true, monthlyPrice: true, downloadMbps: true, uploadMbps: true } }),
    db.user.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    db.customer.findMany({
      select: { id: true, customerNumber: true, identityNumber: true, birthDate: true, email: true, latitude: true, longitude: true, phone: true, name: true },
    }),
    db.odp.findMany({ select: { id: true, code: true } }),
  ]);

  // Paket dicocokkan lewat HARGA yang tertulis di namanya, bukan namanya.
  // Berkas menulis `Paket-225k`; master menyebutnya `Berdua`. Yang menjadi
  // jembatan adalah angka 225 — dan itu satu-satunya bagian dari nama di
  // berkas yang benar-benar membawa makna.
  const paket = new Map<string, string>();
  const unknownPackages: string[] = [];
  const perHarga = new Map<number, string>();
  for (const p of paketDb) perHarga.set(Number(p.monthlyPrice), p.id);
  for (const nama of new Set(parsed.rows.map((r) => r.packageRef))) {
    const cocokNama = paketDb.find(
      (p) => p.name.toLowerCase() === nama.trim().toLowerCase() || p.code.toLowerCase() === nama.trim().toLowerCase()
    );
    if (cocokNama) {
      paket.set(nama, cocokNama.id);
      continue;
    }
    const m = /(\d+)\s*k/i.exec(nama);
    const id = m ? perHarga.get(Number(m[1]) * 1000) : undefined;
    if (id) paket.set(nama, id);
    else unknownPackages.push(nama);
  }

  const sales = new Map<string, string>();
  const unknownSales: string[] = [];
  for (const nama of new Set(parsed.rows.map((r) => r.salesRef).filter((x): x is string => !!x))) {
    // Nama sales di berkas hanya nama panggilan ("Satria", "Ayu"). Dicocokkan
    // sebagai kata pertama maupun bagian dari nama lengkap, tetapi HANYA bila
    // hasilnya tepat satu orang — dua "Ayu" berarti tidak ada yang dipilih.
    const p = nama.trim().toLowerCase();
    const kandidat = userDb.filter((u) => {
      const n = u.name.trim().toLowerCase();
      return n === p || n.split(/\s+/).includes(p) || n.startsWith(p + " ");
    });
    if (kandidat.length === 1) sales.set(nama, kandidat[0].id);
    else unknownSales.push(kandidat.length ? `${nama} (${kandidat.length} orang bernama sama)` : nama);
  }

  const byIdentity = new Map(customerDb.filter((c) => c.identityNumber).map((c) => [c.identityNumber!, c]));
  const byPhone = new Map(customerDb.map((c) => [c.phone, c]));
  const odpAda = new Set(odpDb.map((o) => o.code));

  const customers: CustomerPlan[] = [];
  let willCreateSubscriptions = 0;
  for (const r of parsed.rows) {
    // Dicocokkan lewat NIK dulu, lalu telepon. NIK unik menurut skema, jadi
    // ia jangkar yang paling kuat; telepon menyusul karena pelanggan lama
    // dari Wifinetbill belum tentu punya NIK tercatat.
    const lama = (r.identityNumber ? byIdentity.get(r.identityNumber) : undefined) ?? byPhone.get(r.phone);
    if (!lama) {
      customers.push({
        rowNumber: r.rowNumber, cid: r.cid, name: r.name,
        action: "CREATE", reason: null, changes: [], notes: r.notes,
      });
      willCreateSubscriptions++;
      continue;
    }
    const changes = pelangganChanges(lama, r);
    const notes = [...r.notes];
    if (lama.name.trim().toLowerCase() !== r.name.trim().toLowerCase()) {
      notes.push(`Nama di aplikasi "${lama.name}" berbeda dari berkas "${r.name}" — tidak diubah.`);
    }
    customers.push({
      rowNumber: r.rowNumber, cid: r.cid, name: lama.name,
      action: changes.length ? "LENGKAPI" : "SKIP",
      reason: changes.length ? null : "Sudah ada dan lengkap.",
      changes: changes.map((c) => c.ringkas),
      notes,
    });
  }

  const perOdp = new Map<string, number>();
  for (const r of parsed.rows) if (r.odpRef) perOdp.set(r.odpRef, (perOdp.get(r.odpRef) ?? 0) + 1);
  const odps: OdpPlan[] = [...perOdp].map(([code, customers]) => ({
    code,
    action: odpAda.has(code) ? "SKIP" : "CREATE",
    customers,
  }));

  const issues = [...parsed.issues];
  for (const p of unknownPackages) {
    issues.push({
      rowNumber: 0, column: "Paket",
      message: `Paket "${p}" tidak ada padanannya di master. Buat paketnya dulu, atau samakan namanya.`,
    });
  }

  return {
    ok: true,
    data: {
      plan: {
        ok: issues.length === 0,
        customers,
        odps,
        issues,
        skipped: parsed.skipped,
        willCreateCustomers: customers.filter((c) => c.action === "CREATE").length,
        willCompleteCustomers: customers.filter((c) => c.action === "LENGKAPI").length,
        willSkipCustomers: customers.filter((c) => c.action === "SKIP").length,
        willCreateOdps: odps.filter((o) => o.action === "CREATE").length,
        willCreateSubscriptions,
        unknownPackages,
        // Sales yang tidak dikenali BUKAN masalah yang menahan: pelanggannya
        // tetap sah, hanya pemiliknya kosong dan bisa ditetapkan belakangan.
        unknownSales,
      },
      rows: parsed.rows,
      paket,
      sales,
    },
  };
}

// ── Pratinjau ───────────────────────────────────────────────────

export async function previewCustomerImport(user: CurrentUser, file: File): Promise<Result<ImportPlan>> {
  const rows = await toRows(user, file);
  if (!rows.ok) return rows;
  const rencana = await buildPlan(rows.data);
  return rencana.ok ? { ok: true, data: rencana.data.plan } : rencana;
}

// ── Penerapan ───────────────────────────────────────────────────

export async function applyCustomerImport(user: CurrentUser, file: File): Promise<Result<ImportOutcome>> {
  const sheet = await toRows(user, file);
  if (!sheet.ok) return sheet;

  const rencana = await buildPlan(sheet.data);
  if (!rencana.ok) return rencana;
  const { plan, rows, paket, sales } = rencana.data;

  if (!plan.ok) {
    return {
      ok: false,
      error: `Berkas masih memuat ${plan.issues.length} masalah. Perbaiki dulu di sumbernya — impor pelanggan yang separuh jauh lebih sulit dibereskan daripada yang ditolak.`,
    };
  }

  const outcome: ImportOutcome = {
    createdOdps: [], createdCustomers: [], completedCustomers: [],
    createdSubscriptions: 0, linkedOdpPorts: 0, skipped: plan.willSkipCustomers,
  };

  await db.$transaction(async (prisma) => {
    // ── ODP dulu: port tidak bisa ditempati sebelum tiangnya ada ──
    for (const o of plan.odps) {
      if (o.action !== "CREATE") continue;
      const odp = await prisma.odp.create({
        data: { code: o.code, portCapacity: KAPASITAS_ODP_DUGAAN, notes: CATATAN_ODP },
      });
      await prisma.odpPort.createMany({
        data: Array.from({ length: KAPASITAS_ODP_DUGAAN }, (_, i) => ({ odpId: odp.id, portNumber: i + 1 })),
      });
      outcome.createdOdps.push(o.code);
    }

    const odpByCode = new Map(
      (await prisma.odp.findMany({ select: { id: true, code: true } })).map((o) => [o.code, o.id])
    );

    for (const r of rows) {
      const rencanaBaris = plan.customers.find((c) => c.cid === r.cid);
      if (!rencanaBaris || rencanaBaris.action === "SKIP") continue;

      let customerId: string;
      if (rencanaBaris.action === "CREATE") {
        const nomor = await nextNumber(prisma, "CST", "customerNumber");
        const c = await prisma.customer.create({
          data: {
            customerNumber: nomor,
            name: r.name,
            phone: r.phone,
            email: r.email,
            identityNumber: r.identityNumber,
            birthDate: r.birthDate,
            address: r.address || "-",
            latitude: r.latitude,
            longitude: r.longitude,
            salesOwnerId: r.salesRef ? (sales.get(r.salesRef) ?? null) : null,
            source: "IMPOR_SHEET",
            createdById: user.id,
          },
        });
        customerId = c.id;
        outcome.createdCustomers.push({ cid: r.cid, customerNumber: nomor, name: r.name });
      } else {
        const lama = await prisma.customer.findFirst({
          where: r.identityNumber ? { identityNumber: r.identityNumber } : { phone: r.phone },
          select: { id: true },
        });
        if (!lama) continue;
        customerId = lama.id;
        const ubah: Record<string, unknown> = {};
        for (const c of rencanaBaris.changes) {
          if (c.startsWith("NIK")) ubah.identityNumber = r.identityNumber;
          else if (c.startsWith("Tanggal lahir")) ubah.birthDate = r.birthDate;
          else if (c.startsWith("Email")) ubah.email = r.email;
          else if (c.startsWith("Koordinat")) {
            ubah.latitude = r.latitude;
            ubah.longitude = r.longitude;
          }
        }
        if (Object.keys(ubah).length) {
          await prisma.customer.update({ where: { id: customerId }, data: ubah });
          outcome.completedCustomers.push({ cid: r.cid, fields: Object.keys(ubah) });
        }
      }

      // ── Langganan ──
      const packageId = paket.get(r.packageRef);
      if (!packageId) continue;
      const sudahAda = await prisma.subscription.findUnique({ where: { serviceNumber: r.cid } });
      if (sudahAda) continue;
      const p = await prisma.package.findUniqueOrThrow({
        where: { id: packageId },
        select: { monthlyPrice: true, downloadMbps: true, uploadMbps: true },
      });
      const sub = await prisma.subscription.create({
        data: {
          // Nomor layanan MEMAKAI CID dari sistem sumber, bukan nomor baru.
          // Itulah yang tertulis di router sebagai username PPPoE, dan
          // menerbitkan nomor kedua akan memutus satu-satunya jembatan antara
          // aplikasi ini dan sesi yang benar-benar hidup.
          serviceNumber: r.cid,
          customerId,
          packageId,
          monthlyPrice: p.monthlyPrice,
          downloadMbps: p.downloadMbps,
          uploadMbps: p.uploadMbps,
          pppoeUsername: r.pppoeUsername,
          billingCycleDay: r.billingStartAt ? r.billingStartAt.getUTCDate() : 1,
          activatedAt: r.billingStartAt,
          status: "ACTIVE",
          createdById: user.id,
        },
      });
      outcome.createdSubscriptions++;

      // ── Port ODP ──
      if (r.odpRef) {
        const odpId = odpByCode.get(r.odpRef);
        if (odpId) {
          const kosong = await prisma.odpPort.findFirst({
            where: { odpId, subscriptionId: null, status: "FREE" },
            orderBy: { portNumber: "asc" },
          });
          // Port habis TIDAK menggagalkan impor. Kapasitasnya sendiri dugaan,
          // jadi kehabisan port di sini lebih menandakan angka dugaannya yang
          // kurang daripada ada yang salah dengan pelanggannya.
          if (kosong) {
            await prisma.odpPort.update({
              where: { id: kosong.id },
              data: { subscriptionId: sub.id, status: "USED" },
            });
            await prisma.odp.update({ where: { id: odpId }, data: { portUsed: { increment: 1 } } });
            outcome.linkedOdpPorts++;
          }
        }
      }
    }
  });

  await logAudit({
    userId: user.id,
    action: "CUSTOMER_IMPORT",
    module: "crm",
    entityType: "Customer",
    description:
      `Impor pelanggan: ${outcome.createdCustomers.length} pelanggan baru, ` +
      `${outcome.completedCustomers.length} dilengkapi, ${outcome.createdSubscriptions} langganan, ` +
      `${outcome.createdOdps.length} ODP dibuat, ${outcome.linkedOdpPorts} port tertaut.`,
    metadata: {
      pelangganDibuat: outcome.createdCustomers.length,
      pelangganDilengkapi: outcome.completedCustomers.length,
      langgananDibuat: outcome.createdSubscriptions,
      odpDibuat: outcome.createdOdps,
      portTertaut: outcome.linkedOdpPorts,
      salesTidakDikenali: plan.unknownSales,
    },
  });

  return { ok: true, data: outcome };
}

/** Nomor berurutan bergaya `CST-00001`, aman terhadap pemanggilan berulang. */
async function nextNumber(
  prisma: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  prefix: string,
  field: "customerNumber"
): Promise<string> {
  const last = await prisma.customer.findFirst({
    where: { [field]: { startsWith: `${prefix}-` } },
    orderBy: { [field]: "desc" },
    select: { [field]: true },
  });
  const n = last ? Number(String(last[field]).split("-")[1]) : 0;
  return `${prefix}-${String((Number.isFinite(n) ? n : 0) + 1).padStart(5, "0")}`;
}
