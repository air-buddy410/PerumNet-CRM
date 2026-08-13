import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/constants";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-rules";
import { readSheetRows, XlsxError } from "@/lib/xlsx-read";
import {
  parseEmployeeSheet,
  normalizeEmployeeNo,
  type ImportRow,
  type RowIssue,
} from "@/lib/employee-import";
import { saveEmployee } from "@/lib/hrd";
import type { CurrentUser } from "@/lib/rbac";

// ── Impor pegawai dari Excel: pratinjau & penerapan (Fase 51) ────
//
// Dua sifat yang dipegang di sini, dan keduanya disengaja:
//
// 1. PENERAPAN MEMBACA ULANG BERKASNYA. Tidak ada jalur yang menerima daftar
//    baris dari peramban lalu menyimpannya. Kalau ada, siapa pun yang bisa
//    memanggil server action bisa mengirim data pegawai apa saja dan melewati
//    seluruh pemeriksaan — pratinjau yang bagus tidak ada gunanya kalau
//    penerapannya percaya begitu saja.
//
// 2. SEMUA ATAU TIDAK SAMA SEKALI. Satu baris bermasalah menahan seluruh
//    berkas. Impor separuh jauh lebih sulit dibereskan daripada impor yang
//    ditolak: yang separuh sudah bercampur dengan data lain, dan menjalankan
//    ulang berkas yang sama akan menggandakannya.
//
// Berkasnya sendiri TIDAK disimpan sebagai lampiran. Mesin lampiran hanya
// menerima gambar dan PDF, dan melonggarkannya demi impor ini akan
// melonggarkannya untuk SELURUH lampiran di aplikasi — bukti pekerjaan,
// faktur, semuanya. Jejaknya cukup dari AuditLog.

/** Yang akan terjadi pada satu baris bila impor diterapkan. */
export interface PlanRow {
  rowNumber: number;
  fullName: string;
  /** Kosong berarti NIK akan diterbitkan sistem saat penerapan. */
  employeeNo: string;
  action: "CREATE" | "SKIP";
  /** Alasan dilewati, untuk SKIP. */
  reason: string | null;
  /** Catatan yang tidak menghalangi penerapan. */
  notes: string[];
}

export interface ImportPlan {
  /** Boleh diterapkan? False bila ada satu saja masalah. */
  ok: boolean;
  rows: PlanRow[];
  issues: RowIssue[];
  /** Baris kosong yang dilewati — template menyediakan 200. */
  blankRows: number;
  willCreate: number;
  willSkip: number;
}

export interface ImportOutcome {
  created: { rowNumber: number; employeeNo: string; fullName: string }[];
  skipped: number;
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

// ── Pratinjau ───────────────────────────────────────────────────

export async function previewEmployeeImport(user: CurrentUser, file: File): Promise<Result<ImportPlan>> {
  const buf = await toBuffer(user, file);
  if (!buf.ok) return buf;
  try {
    return { ok: true, data: await buildPlan(buf.data) };
  } catch (e) {
    return { ok: false, error: e instanceof XlsxError ? e.message : `Berkas tidak terbaca: ${(e as Error).message}` };
  }
}

async function toBuffer(user: CurrentUser, file: File): Promise<Result<Buffer>> {
  if (!user.permissions.has(PERMISSIONS.HRD_MANAGE)) {
    return { ok: false, error: "Hanya HRD yang boleh mengimpor data pegawai." };
  }
  if (!file || file.size <= 0) return { ok: false, error: "Pilih berkas Excel terlebih dahulu." };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: `Ukuran berkas maksimal ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.` };
  }
  return { ok: true, data: Buffer.from(await file.arrayBuffer()) };
}

/**
 * Menyusun rencana: baris mana dibuat, mana dilewati, mana bermasalah.
 *
 * Seluruh pembacaan basis data dilakukan BORONGAN, bukan per baris. Berkas
 * berisi 200 orang tidak boleh berarti 800 kueri.
 */
async function buildPlan(buf: Buffer): Promise<ImportPlan> {
  const parsed = parseEmployeeSheet(readSheetRows(buf));
  const issues: RowIssue[] = [...parsed.issues];
  const rows = parsed.rows;

  // Daftar divisi dibaca sekali di muka: isinya DATA, bukan konstanta kode,
  // jadi tidak bisa divalidasi di lapisan murni.
  const divisions = await db.division.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  });
  const divisionByKey = new Map<string, (typeof divisions)[number]>();
  for (const d of divisions) {
    divisionByKey.set(d.name.trim().toLowerCase(), d);
    divisionByKey.set(d.code.trim().toLowerCase(), d);
  }
  const divisionNames = divisions.map((d) => d.name).join(", ");

  const numbers = rows.map((r) => r.employeeNo).filter(Boolean);
  const names = rows.map((r) => r.fullName);
  const emails = rows.map((r) => r.accountEmail).filter((e): e is string => !!e);
  const refs = rows.map((r) => r.supervisorRef).filter((s): s is string => !!s);

  const [byNumber, byName, users, refByNumber, refByName] = await Promise.all([
    db.employee.findMany({
      where: { employeeNo: { in: numbers } },
      select: { id: true, employeeNo: true, fullName: true },
    }),
    db.employee.findMany({
      where: { fullName: { in: names } },
      select: { id: true, employeeNo: true, fullName: true, joinedAt: true },
    }),
    db.user.findMany({
      where: { email: { in: emails } },
      select: {
        id: true,
        email: true,
        employee: { select: { id: true, employeeNo: true } },
        division: { select: { code: true, name: true } },
      },
    }),
    db.employee.findMany({
      where: { employeeNo: { in: refs.map(normalizeEmployeeNo) } },
      select: { id: true, employeeNo: true },
    }),
    db.employee.findMany({ where: { fullName: { in: refs } }, select: { id: true, fullName: true } }),
  ]);

  const existingNo = new Map(byNumber.map((e) => [e.employeeNo, e]));
  const existingIdentity = new Map(byName.map((e) => [identityKey(e.fullName, e.joinedAt), e]));
  const userByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  const dbSupervisorByNo = new Map(refByNumber.map((e) => [e.employeeNo, e.id]));
  const dbSupervisorByName = new Map<string, string[]>();
  for (const e of refByName) {
    const key = e.fullName.toLowerCase();
    dbSupervisorByName.set(key, [...(dbSupervisorByName.get(key) ?? []), e.id]);
  }

  const plan: PlanRow[] = [];
  for (const r of rows) {
    const notes: string[] = [];
    const problem = (column: string, message: string) => issues.push({ rowNumber: r.rowNumber, column, message });

    // ── Sudah ada? ──
    const taken = r.employeeNo ? existingNo.get(r.employeeNo) : undefined;
    if (taken) {
      plan.push({
        ...base(r),
        action: "SKIP",
        reason: `NIK ${r.employeeNo} sudah terdaftar atas nama ${taken.fullName}.`,
        notes,
      });
      continue;
    }
    // Penjaga jalan-ulang. Tanpa ini, mengimpor berkas yang sama dua kali
    // menggandakan SEMUA orang — baris tanpa NIK selalu mendapat nomor baru,
    // jadi tidak ada yang menabrak dan tidak ada yang mengeluh.
    const already = existingIdentity.get(identityKey(r.fullName, r.joinedAt));
    if (already) {
      plan.push({
        ...base(r),
        action: "SKIP",
        reason: `Sudah terdaftar sebagai ${already.employeeNo} dengan nama dan tanggal bergabung yang sama.`,
        notes,
      });
      continue;
    }

    // ── Divisi ──
    let division: { id: string; code: string; name: string } | null = null;
    if (r.divisionRef) {
      division = divisionByKey.get(r.divisionRef.trim().toLowerCase()) ?? null;
      if (!division) {
        problem("Divisi", `"${r.divisionRef}" tidak dikenal. Pilih salah satu: ${divisionNames}.`);
      }
    }

    // ── Akun CRM ──
    if (r.accountEmail) {
      const u = userByEmail.get(r.accountEmail);
      if (!u) {
        // Bukan penghalang: akunnya bisa dibuat belakangan lewat Authentik.
        notes.push(`Akun CRM ${r.accountEmail} belum ada — pegawai dibuat tanpa tautan akun.`);
      } else if (u.employee) {
        problem("Email Akun CRM", `Akun ini sudah tertaut ke pegawai ${u.employee.employeeNo}.`);
      } else if (division && u.division && u.division.code !== division.code) {
        // DILAPORKAN, bukan diselaraskan. User.divisionId menentukan ke mana
        // persetujuan cuti berjalan dan grup Authentik mana yang diikuti;
        // mengubahnya sebagai efek samping mengunggah spreadsheet berarti
        // memindahkan kewenangan orang tanpa ada yang memutuskan.
        notes.push(
          `Divisi akun CRM (${u.division.name}) berbeda dari berkas ini (${division.name}). ` +
            `Akun TIDAK diubah — perbaiki di /settings/users bila memang perlu.`
        );
      }
    }

    // ── Atasan ──
    if (r.supervisorRef && r.supervisorRowNumber === null) {
      const ref = r.supervisorRef.trim();
      const byNo = dbSupervisorByNo.get(normalizeEmployeeNo(ref));
      const named = dbSupervisorByName.get(ref.toLowerCase()) ?? [];
      if (!byNo && named.length > 1) {
        problem("NIK Atasan", `Ada ${named.length} pegawai bernama "${ref}". Tulis NIK-nya supaya jelas yang mana.`);
      } else if (!byNo && named.length === 0) {
        // Dijadikan masalah, bukan diabaikan: mengabaikannya berarti
        // hierarkinya diam-diam kosong dan tidak ada yang menyadarinya
        // sampai persetujuan cuti pertama tidak tahu harus ke mana.
        problem("NIK Atasan", `"${ref}" tidak ditemukan, baik di berkas ini maupun di data pegawai.`);
      }
    }

    plan.push({ ...base(r), action: "CREATE", reason: null, notes });
  }

  const willCreate = plan.filter((p) => p.action === "CREATE").length;
  return {
    ok: issues.length === 0,
    rows: plan,
    issues,
    blankRows: parsed.skipped,
    willCreate,
    willSkip: plan.length - willCreate,
  };
}

function base(r: ImportRow) {
  return { rowNumber: r.rowNumber, fullName: r.fullName, employeeNo: r.employeeNo };
}

/**
 * Tanda pengenal sebuah baris tanpa NIK.
 *
 * Nama + tanggal bergabung. Dua orang bernama sama yang masuk pada hari yang
 * sama praktis tidak terjadi; bila toh terjadi, yang kedua muncul sebagai
 * "sudah terdaftar" di pratinjau — terlihat, bukan hilang diam-diam.
 */
function identityKey(fullName: string, joinedAt: Date): string {
  return `${fullName.trim().toLowerCase()}|${joinedAt.toISOString().slice(0, 10)}`;
}

// ── Penerapan ───────────────────────────────────────────────────

export async function applyEmployeeImport(user: CurrentUser, file: File): Promise<Result<ImportOutcome>> {
  const buf = await toBuffer(user, file);
  if (!buf.ok) return buf;

  let plan: ImportPlan;
  let parsed: ReturnType<typeof parseEmployeeSheet>;
  try {
    // Dibaca ULANG dari berkasnya, bukan dari apa pun yang dikirim peramban.
    parsed = parseEmployeeSheet(readSheetRows(buf.data));
    plan = await buildPlan(buf.data);
  } catch (e) {
    return { ok: false, error: e instanceof XlsxError ? e.message : `Berkas tidak terbaca: ${(e as Error).message}` };
  }

  if (!plan.ok) {
    return {
      ok: false,
      error: `Masih ada ${plan.issues.length} baris bermasalah. Perbaiki dulu di Excel, tidak ada data yang disimpan.`,
    };
  }

  const toCreate = new Set(plan.rows.filter((p) => p.action === "CREATE").map((p) => p.rowNumber));
  const rows = parsed.rows.filter((r) => toCreate.has(r.rowNumber));

  // Atasan didahulukan supaya tautannya bisa dipasang saat pembuatan, tanpa
  // babak kedua. Urutan seperti ini selalu ada karena siklus sudah ditolak
  // di pratinjau.
  const ordered = supervisorsFirst(rows);

  const emails = rows.map((r) => r.accountEmail).filter((e): e is string => !!e);
  const users = await db.user.findMany({ where: { email: { in: emails } }, select: { id: true, email: true } });
  const userIdByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));

  // Divisi dicocokkan ulang di sini, bukan dibawa dari rencana: penerapan
  // membaca ulang dari berkas, jadi ia tidak boleh bergantung pada apa pun
  // yang sudah dihitung sebelumnya.
  const divisions = await db.division.findMany({ select: { id: true, code: true, name: true } });
  const divisionByKey = new Map<string, string>();
  for (const d of divisions) {
    divisionByKey.set(d.name.trim().toLowerCase(), d.id);
    divisionByKey.set(d.code.trim().toLowerCase(), d.id);
  }

  const idByRow = new Map<number, string>();
  const created: ImportOutcome["created"] = [];

  for (const r of ordered) {
    const supervisorId = await resolveSupervisorId(r, idByRow);
    const result = await saveEmployee(user, {
      userId: r.accountEmail ? (userIdByEmail.get(r.accountEmail) ?? null) : null,
      employeeNo: r.employeeNo, // kosong = diterbitkan sistem
      fullName: r.fullName,
      jobTitle: r.jobTitle ?? undefined,
      employeeType: r.employeeType,
      supervisorId,
      joinedAt: r.joinedAt,
      isActive: r.isActive,
      address: r.address,
      workPattern: r.workPattern,
      jobLevel: r.jobLevel,
      divisionId: r.divisionRef ? (divisionByKey.get(r.divisionRef.trim().toLowerCase()) ?? null) : null,
      contractStartAt: r.contractStartAt,
      contractEndAt: r.contractEndAt,
      // Fase 60 — data diri. Diteruskan apa adanya; saveEmployee() yang
      // memeriksa kodenya sekali lagi terhadap EDUCATION_LEVELS/BLOOD_TYPES,
      // supaya jalur impor dan jalur formulir tunduk pada aturan yang sama.
      birthPlace: r.birthPlace,
      birthDate: r.birthDate,
      education: r.education,
      bloodType: r.bloodType,
    });
    if (!result.ok) {
      // Dilaporkan apa adanya, termasuk berapa yang TERLANJUR tersimpan.
      // Menyembunyikannya akan membuat HRD mengulang berkas yang sama dan
      // menggandakan yang sudah masuk.
      await logAudit({
        userId: user.id,
        action: "EMPLOYEE_IMPORT_FAILED",
        module: "hrd",
        entityType: "Employee",
        description: `Impor terhenti di baris ${r.rowNumber} (${r.fullName}): ${result.error}. ${created.length} pegawai sudah tersimpan.`,
      });
      return {
        ok: false,
        error: `Impor terhenti di baris ${r.rowNumber} (${r.fullName}): ${result.error} — ${created.length} pegawai sudah tersimpan sebelum berhenti. Hapus baris yang sudah masuk dari berkas sebelum mencoba lagi.`,
      };
    }
    idByRow.set(r.rowNumber, result.id!);
    const saved = await db.employee.findUnique({ where: { id: result.id! }, select: { employeeNo: true } });
    created.push({ rowNumber: r.rowNumber, employeeNo: saved?.employeeNo ?? "", fullName: r.fullName });
  }

  await logAudit({
    userId: user.id,
    action: "EMPLOYEE_IMPORT",
    module: "hrd",
    entityType: "Employee",
    description: `Mengimpor ${created.length} pegawai dari berkas "${file.name}" (${plan.willSkip} dilewati karena sudah terdaftar).`,
  });

  return { ok: true, data: { created, skipped: plan.willSkip } };
}

/** Id atasan: dari baris yang baru dibuat, atau dari data yang sudah ada. */
async function resolveSupervisorId(r: ImportRow, idByRow: Map<number, string>): Promise<string | null> {
  if (r.supervisorRowNumber !== null) return idByRow.get(r.supervisorRowNumber) ?? null;
  if (!r.supervisorRef) return null;
  const ref = r.supervisorRef.trim();
  const byNo = await db.employee.findUnique({
    where: { employeeNo: normalizeEmployeeNo(ref) },
    select: { id: true },
  });
  if (byNo) return byNo.id;
  const byName = await db.employee.findMany({ where: { fullName: ref }, select: { id: true } });
  return byName.length === 1 ? byName[0].id : null;
}

/**
 * Mengurutkan agar atasan selalu dibuat sebelum bawahannya.
 *
 * Tidak akan menggantung: siklus sudah ditolak di pratinjau, jadi urutan
 * seperti ini pasti ada. Sisa yang tak terurut tetap disertakan di akhir
 * daripada hilang tanpa jejak.
 */
function supervisorsFirst(rows: ImportRow[]): ImportRow[] {
  const pending = new Map(rows.map((r) => [r.rowNumber, r]));
  const out: ImportRow[] = [];
  const done = new Set<number>();

  let moved = true;
  while (moved && pending.size) {
    moved = false;
    for (const [num, r] of [...pending]) {
      const dep = r.supervisorRowNumber;
      if (dep === null || !pending.has(dep) || done.has(dep)) {
        out.push(r);
        done.add(num);
        pending.delete(num);
        moved = true;
      }
    }
  }
  return [...out, ...pending.values()];
}
