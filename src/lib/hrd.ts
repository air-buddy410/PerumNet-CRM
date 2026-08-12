import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { submitApprovalRequest } from "@/lib/approval";
import { EMPLOYEE_TYPES, LEAVE_TYPES, DAY_TYPES, WORK_PATTERNS, JOB_LEVELS } from "@/lib/constants";
import { contractRejection } from "@/lib/employment";
import type { CurrentUser } from "@/lib/rbac";

// ── HRD & Absensi Engine (DESIGN-PHASE-8 §8, gap G7) ────────────
// Aturan yang ditegakkan DI SINI, bukan di UI:
//  - Absen masuk WAJIB di dalam radius geofence lokasi (jarak dihitung
//    haversine dan disimpan sebagai bukti).
//  - Satu absensi per karyawan per tanggal; clock-out tanpa clock-in
//    ditolak; clock-out ganda ditolak.
//  - Keterlambatan dihitung dari jam shift + toleransi.
//  - Izin & lembur lewat approval engine sehingga BERJENJANG
//    (atasan → HRD) — keunggulan vs approval satu tingkat sistem lama.
//  - Izin tumpang tindih dengan izin lain yang masih berjalan ditolak.
//  - Hierarki supervisor dijaga bebas siklus.

type Result<T = undefined> =
  | { ok: true; id: string; data?: T }
  | { ok: false; error: string };

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isValidCode(list: readonly (readonly [string, string])[], code: string): boolean {
  return list.some(([c]) => c === code);
}

// Tanggal dinormalkan ke tengah malam agar unique per hari konsisten.
export function dayStart(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Jarak haversine dalam meter — dasar validasi geofence.
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

async function nextNumber(base: string, count: (prefix: string) => Promise<number>): Promise<string> {
  const now = new Date();
  const prefix = `${base}-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const n = await count(prefix);
  return `${prefix}-${String(n + 1).padStart(4, "0")}`;
}

// ── Master karyawan, shift, lokasi ──────────────────────────────

export async function saveEmployee(
  user: CurrentUser,
  data: {
    id?: string;
    userId?: string | null;
    employeeNo: string;
    fullName: string;
    jobTitle?: string;
    employeeType: string;
    supervisorId?: string | null;
    joinedAt: Date;
    isActive?: boolean;
    address?: string | null;
    workPattern?: string;
    jobLevel?: string;
    contractStartAt?: Date | null;
    contractEndAt?: Date | null;
  }
): Promise<Result> {
  const employeeNo = data.employeeNo.trim().toUpperCase();
  if (!/^[A-Z0-9-]{2,20}$/.test(employeeNo)) {
    return { ok: false, error: "NIK: huruf/angka/strip, 2–20 karakter." };
  }
  if (!data.fullName?.trim()) return { ok: false, error: "Nama karyawan wajib diisi." };
  if (!isValidCode(EMPLOYEE_TYPES, data.employeeType)) {
    return { ok: false, error: "Jenis karyawan tidak dikenal." };
  }
  if (Number.isNaN(data.joinedAt.getTime())) return { ok: false, error: "Tanggal bergabung tidak valid." };
  const workPattern = data.workPattern ?? "NON_SHIFT";
  const jobLevel = data.jobLevel ?? "STAFF";
  if (!isValidCode(WORK_PATTERNS, workPattern)) return { ok: false, error: "Pola kerja tidak dikenal." };
  if (!isValidCode(JOB_LEVELS, jobLevel)) return { ok: false, error: "Jenjang jabatan tidak dikenal." };
  // Fase 41 — masa kontrak. Ditolak di sini, bukan di form: penyapu Fase 42
  // membekukan akun berdasarkan contractEndAt, jadi tanggal yang tertinggal
  // pada karyawan tetap akan membekukan orang yang masih bekerja.
  const contractError = contractRejection({
    employeeType: data.employeeType,
    contractStartAt: data.contractStartAt ?? null,
    contractEndAt: data.contractEndAt ?? null,
  });
  if (contractError) return { ok: false, error: contractError };
  const dup = await db.employee.findFirst({
    where: { employeeNo, ...(data.id ? { id: { not: data.id } } : {}) },
  });
  if (dup) return { ok: false, error: `NIK ${employeeNo} sudah dipakai.` };
  if (data.userId) {
    const taken = await db.employee.findFirst({
      where: { userId: data.userId, ...(data.id ? { id: { not: data.id } } : {}) },
    });
    if (taken) return { ok: false, error: `Akun sudah tertaut ke karyawan ${taken.employeeNo}.` };
  }
  if (data.supervisorId) {
    if (data.supervisorId === data.id) {
      return { ok: false, error: "Karyawan tidak bisa menjadi atasan dirinya sendiri." };
    }
    // Cegah siklus hierarki.
    if (data.id) {
      let cursor: string | null = data.supervisorId;
      let guard = 0;
      while (cursor && guard++ < 50) {
        if (cursor === data.id) {
          return { ok: false, error: "Hierarki atasan membentuk siklus." };
        }
        const node: { supervisorId: string | null } | null = await db.employee.findUnique({
          where: { id: cursor },
          select: { supervisorId: true },
        });
        cursor = node?.supervisorId ?? null;
      }
    }
  }
  const payload = {
    userId: data.userId || null,
    employeeNo,
    fullName: data.fullName,
    jobTitle: data.jobTitle || null,
    employeeType: data.employeeType,
    supervisorId: data.supervisorId || null,
    joinedAt: data.joinedAt,
    isActive: data.isActive ?? true,
    address: data.address?.trim() || null,
    workPattern,
    jobLevel,
    contractStartAt: data.contractStartAt ?? null,
    contractEndAt: data.contractEndAt ?? null,
  };
  const emp = data.id
    ? await db.employee.update({ where: { id: data.id }, data: payload })
    : await db.employee.create({ data: payload });
  await logAudit({
    userId: user.id,
    action: data.id ? "EMPLOYEE_UPDATE" : "EMPLOYEE_CREATE",
    module: "hrd",
    entityType: "Employee",
    entityId: emp.id,
    description: `${data.id ? "Mengubah" : "Mendaftarkan"} karyawan ${employeeNo} — ${data.fullName}`,
  });
  return { ok: true, id: emp.id };
}

export async function saveShift(
  user: CurrentUser,
  data: { id?: string; name: string; startTime: string; endTime: string; lateToleranceMin: number; isActive?: boolean }
): Promise<Result> {
  if (!data.name?.trim()) return { ok: false, error: "Nama shift wajib diisi." };
  if (!TIME_RE.test(data.startTime) || !TIME_RE.test(data.endTime)) {
    return { ok: false, error: 'Jam harus format "HH:MM" (24 jam).' };
  }
  if (!Number.isInteger(data.lateToleranceMin) || data.lateToleranceMin < 0 || data.lateToleranceMin > 120) {
    return { ok: false, error: "Toleransi terlambat harus 0–120 menit." };
  }
  const dup = await db.shift.findFirst({
    where: { name: data.name, ...(data.id ? { id: { not: data.id } } : {}) },
  });
  if (dup) return { ok: false, error: `Shift "${data.name}" sudah ada.` };
  const payload = {
    name: data.name,
    startTime: data.startTime,
    endTime: data.endTime,
    lateToleranceMin: data.lateToleranceMin,
    isActive: data.isActive ?? true,
  };
  const shift = data.id
    ? await db.shift.update({ where: { id: data.id }, data: payload })
    : await db.shift.create({ data: payload });
  await logAudit({
    userId: user.id,
    action: "SHIFT_SAVE",
    module: "hrd",
    entityType: "Shift",
    entityId: shift.id,
    description: `Shift "${data.name}" ${data.startTime}–${data.endTime} (toleransi ${data.lateToleranceMin} mnt)`,
  });
  return { ok: true, id: shift.id };
}

export async function saveAttendanceLocation(
  user: CurrentUser,
  data: { id?: string; name: string; latitude: number; longitude: number; radiusM: number; isActive?: boolean }
): Promise<Result> {
  if (!data.name?.trim()) return { ok: false, error: "Nama lokasi wajib diisi." };
  if (!Number.isFinite(data.latitude) || data.latitude < -90 || data.latitude > 90) {
    return { ok: false, error: "Latitude harus -90 s.d. 90." };
  }
  if (!Number.isFinite(data.longitude) || data.longitude < -180 || data.longitude > 180) {
    return { ok: false, error: "Longitude harus -180 s.d. 180." };
  }
  if (!Number.isInteger(data.radiusM) || data.radiusM < 10 || data.radiusM > 5000) {
    return { ok: false, error: "Radius geofence harus 10–5000 meter." };
  }
  const dup = await db.attendanceLocation.findFirst({
    where: { name: data.name, ...(data.id ? { id: { not: data.id } } : {}) },
  });
  if (dup) return { ok: false, error: `Lokasi "${data.name}" sudah ada.` };
  const payload = {
    name: data.name,
    latitude: data.latitude,
    longitude: data.longitude,
    radiusM: data.radiusM,
    isActive: data.isActive ?? true,
  };
  const loc = data.id
    ? await db.attendanceLocation.update({ where: { id: data.id }, data: payload })
    : await db.attendanceLocation.create({ data: payload });
  await logAudit({
    userId: user.id,
    action: "ATT_LOCATION_SAVE",
    module: "hrd",
    entityType: "AttendanceLocation",
    entityId: loc.id,
    description: `Lokasi absen "${data.name}" radius ${data.radiusM} m`,
  });
  return { ok: true, id: loc.id };
}

export async function saveSchedule(
  user: CurrentUser,
  data: { employeeId: string; date: Date; shiftId?: string | null; dayType: string; note?: string }
): Promise<Result> {
  if (!isValidCode(DAY_TYPES, data.dayType)) return { ok: false, error: "Tipe hari tidak dikenal." };
  if (Number.isNaN(data.date.getTime())) return { ok: false, error: "Tanggal tidak valid." };
  const emp = await db.employee.findUnique({ where: { id: data.employeeId } });
  if (!emp) return { ok: false, error: "Karyawan tidak ditemukan." };
  if (data.dayType === "WORK" && !data.shiftId) {
    return { ok: false, error: "Hari kerja wajib memiliki shift." };
  }
  const date = dayStart(data.date);
  const payload = {
    shiftId: data.dayType === "WORK" ? (data.shiftId ?? null) : null,
    dayType: data.dayType,
    note: data.note || null,
  };
  const sched = await db.shiftSchedule.upsert({
    where: { employeeId_date: { employeeId: data.employeeId, date } },
    update: payload,
    create: { employeeId: data.employeeId, date, ...payload },
  });
  await logAudit({
    userId: user.id,
    action: "SHIFT_SCHEDULE_SAVE",
    module: "hrd",
    entityType: "ShiftSchedule",
    entityId: sched.id,
    description: `Jadwal ${emp.employeeNo} ${date.toISOString().slice(0, 10)}: ${data.dayType}`,
  });
  return { ok: true, id: sched.id };
}

// ── Absensi mandiri (geofence + selfie) ─────────────────────────

async function employeeOf(user: CurrentUser): Promise<{ id: string; employeeNo: string } | null> {
  return db.employee.findFirst({
    where: { userId: user.id, isActive: true },
    select: { id: true, employeeNo: true },
  });
}

export async function clockIn(
  user: CurrentUser,
  data: { latitude: number; longitude: number; photoId?: string | null; at?: Date }
): Promise<Result<{ status: string; lateMinutes: number; distanceM: number }>> {
  const emp = await employeeOf(user);
  if (!emp) return { ok: false, error: "Akun Anda belum tertaut data karyawan — hubungi HRD." };
  if (!Number.isFinite(data.latitude) || !Number.isFinite(data.longitude)) {
    return { ok: false, error: "Koordinat tidak valid — izinkan akses lokasi." };
  }
  const at = data.at ?? new Date();
  const date = dayStart(at);
  const existing = await db.attendance.findUnique({
    where: { employeeId_date: { employeeId: emp.id, date } },
  });
  if (existing?.clockInAt) return { ok: false, error: "Anda sudah absen masuk hari ini." };

  // Geofence: harus berada di dalam radius salah satu lokasi aktif.
  const locations = await db.attendanceLocation.findMany({ where: { isActive: true } });
  if (locations.length === 0) {
    return { ok: false, error: "Belum ada lokasi absen terdaftar — hubungi HRD." };
  }
  let best: { id: string; name: string; distance: number; radiusM: number } | null = null;
  for (const loc of locations) {
    const distance = distanceMeters(data.latitude, data.longitude, loc.latitude, loc.longitude);
    if (!best || distance < best.distance) {
      best = { id: loc.id, name: loc.name, distance, radiusM: loc.radiusM };
    }
  }
  if (!best || best.distance > best.radiusM) {
    return {
      ok: false,
      error: `Anda berada ${best?.distance ?? "?"} m dari ${best?.name ?? "lokasi absen"} (radius ${best?.radiusM ?? "?"} m) — absen ditolak.`,
    };
  }

  // Keterlambatan dari jadwal shift hari itu.
  const schedule = await db.shiftSchedule.findUnique({
    where: { employeeId_date: { employeeId: emp.id, date } },
    include: { shift: true },
  });
  if (schedule && schedule.dayType !== "WORK") {
    return { ok: false, error: `Hari ini dijadwalkan ${schedule.dayType} — absen tidak diperlukan.` };
  }
  let lateMinutes = 0;
  let status = "PRESENT";
  if (schedule?.shift) {
    const nowMin = at.getHours() * 60 + at.getMinutes();
    const limit = minutesOf(schedule.shift.startTime) + schedule.shift.lateToleranceMin;
    if (nowMin > limit) {
      lateMinutes = nowMin - minutesOf(schedule.shift.startTime);
      status = "LATE";
    }
  }

  const row = await db.attendance.upsert({
    where: { employeeId_date: { employeeId: emp.id, date } },
    update: {
      shiftId: schedule?.shiftId ?? null,
      clockInAt: at,
      clockInLocationId: best.id,
      clockInDistanceM: best.distance,
      clockInPhotoId: data.photoId ?? null,
      lateMinutes,
      status,
    },
    create: {
      employeeId: emp.id,
      date,
      shiftId: schedule?.shiftId ?? null,
      clockInAt: at,
      clockInLocationId: best.id,
      clockInDistanceM: best.distance,
      clockInPhotoId: data.photoId ?? null,
      lateMinutes,
      status,
    },
  });
  await logAudit({
    userId: user.id,
    action: "ATTENDANCE_CLOCK_IN",
    module: "hrd",
    entityType: "Attendance",
    entityId: row.id,
    description: `Absen masuk ${emp.employeeNo} di ${best.name} (${best.distance} m)${lateMinutes ? ` — terlambat ${lateMinutes} mnt` : ""}`,
  });
  return { ok: true, id: row.id, data: { status, lateMinutes, distanceM: best.distance } };
}

export async function clockOut(
  user: CurrentUser,
  data: { photoId?: string | null; at?: Date }
): Promise<Result<{ workMinutes: number }>> {
  const emp = await employeeOf(user);
  if (!emp) return { ok: false, error: "Akun Anda belum tertaut data karyawan — hubungi HRD." };
  const at = data.at ?? new Date();
  const date = dayStart(at);
  const row = await db.attendance.findUnique({
    where: { employeeId_date: { employeeId: emp.id, date } },
  });
  if (!row?.clockInAt) return { ok: false, error: "Belum ada absen masuk hari ini." };
  if (row.clockOutAt) return { ok: false, error: "Anda sudah absen pulang hari ini." };
  if (at.getTime() < row.clockInAt.getTime()) {
    return { ok: false, error: "Waktu pulang lebih awal dari waktu masuk." };
  }
  const workMinutes = Math.round((at.getTime() - row.clockInAt.getTime()) / 60000);
  await db.attendance.update({
    where: { id: row.id },
    data: { clockOutAt: at, clockOutPhotoId: data.photoId ?? null, workMinutes },
  });
  await logAudit({
    userId: user.id,
    action: "ATTENDANCE_CLOCK_OUT",
    module: "hrd",
    entityType: "Attendance",
    entityId: row.id,
    description: `Absen pulang ${emp.employeeNo} — ${workMinutes} menit kerja`,
  });
  return { ok: true, id: row.id, data: { workMinutes } };
}

// ── Izin/cuti & lembur — approval BERJENJANG (§8) ───────────────

export async function submitLeave(
  user: CurrentUser,
  data: { type: string; startDate: Date; endDate: Date; reason: string; attachmentId?: string | null }
): Promise<Result> {
  const emp = await employeeOf(user);
  if (!emp) return { ok: false, error: "Akun Anda belum tertaut data karyawan — hubungi HRD." };
  if (!isValidCode(LEAVE_TYPES, data.type)) return { ok: false, error: "Jenis izin tidak dikenal." };
  if (!data.reason?.trim()) return { ok: false, error: "Alasan izin wajib diisi." };
  const start = dayStart(data.startDate);
  const end = dayStart(data.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, error: "Tanggal tidak valid." };
  }
  if (end < start) return { ok: false, error: "Tanggal selesai tidak boleh sebelum tanggal mulai." };
  const days = Math.round((end.getTime() - start.getTime()) / 86400e3) + 1;
  if (days > 60) return { ok: false, error: "Pengajuan izin maksimal 60 hari." };

  // Tumpang tindih dengan izin lain yang masih berjalan.
  const overlap = await db.leaveRequest.findFirst({
    where: {
      employeeId: emp.id,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: end },
      endDate: { gte: start },
    },
  });
  if (overlap) {
    return { ok: false, error: `Bentrok dengan pengajuan ${overlap.requestNumber} (${overlap.status}).` };
  }

  const requestNumber = await nextNumber("LVE", (p) =>
    db.leaveRequest.count({ where: { requestNumber: { startsWith: p } } })
  );
  const leave = await db.leaveRequest.create({
    data: {
      requestNumber,
      employeeId: emp.id,
      type: data.type,
      startDate: start,
      endDate: end,
      days,
      reason: data.reason,
      attachmentId: data.attachmentId ?? null,
    },
  });
  // Approval engine: berjenjang atasan → HRD (matrix leave_request).
  const approval = await submitApprovalRequest({
    user,
    module: "leave_request",
    title: `${requestNumber}: ${data.type} ${days} hari — ${emp.employeeNo}`,
    description: data.reason,
    entityType: "LeaveRequest",
    entityId: leave.id,
  });
  if (!approval.ok) {
    await db.leaveRequest.delete({ where: { id: leave.id } });
    return approval;
  }
  await db.leaveRequest.update({
    where: { id: leave.id },
    data: { approvalRequestId: approval.id },
  });
  await logAudit({
    userId: user.id,
    action: "LEAVE_SUBMIT",
    module: "hrd",
    entityType: "LeaveRequest",
    entityId: leave.id,
    description: `Pengajuan ${requestNumber} (${data.type}, ${days} hari)`,
  });
  return { ok: true, id: leave.id };
}

export async function submitOvertime(
  user: CurrentUser,
  data: { date: Date; startTime: string; endTime: string; reason: string }
): Promise<Result<{ minutes: number }>> {
  const emp = await employeeOf(user);
  if (!emp) return { ok: false, error: "Akun Anda belum tertaut data karyawan — hubungi HRD." };
  if (!TIME_RE.test(data.startTime) || !TIME_RE.test(data.endTime)) {
    return { ok: false, error: 'Jam harus format "HH:MM".' };
  }
  if (!data.reason?.trim()) return { ok: false, error: "Alasan lembur wajib diisi." };
  const minutes = minutesOf(data.endTime) - minutesOf(data.startTime);
  if (minutes <= 0) return { ok: false, error: "Jam selesai harus setelah jam mulai." };
  if (minutes > 12 * 60) return { ok: false, error: "Lembur maksimal 12 jam." };
  const date = dayStart(data.date);
  const dup = await db.overtimeRequest.findFirst({
    where: { employeeId: emp.id, date, status: { in: ["PENDING", "APPROVED"] } },
  });
  if (dup) return { ok: false, error: `Sudah ada pengajuan lembur ${dup.requestNumber} pada tanggal itu.` };

  const requestNumber = await nextNumber("OVT", (p) =>
    db.overtimeRequest.count({ where: { requestNumber: { startsWith: p } } })
  );
  const ot = await db.overtimeRequest.create({
    data: {
      requestNumber,
      employeeId: emp.id,
      date,
      startTime: data.startTime,
      endTime: data.endTime,
      minutes,
      reason: data.reason,
    },
  });
  const approval = await submitApprovalRequest({
    user,
    module: "overtime_request",
    title: `${requestNumber}: lembur ${minutes} menit — ${emp.employeeNo}`,
    description: data.reason,
    entityType: "OvertimeRequest",
    entityId: ot.id,
  });
  if (!approval.ok) {
    await db.overtimeRequest.delete({ where: { id: ot.id } });
    return approval;
  }
  await db.overtimeRequest.update({ where: { id: ot.id }, data: { approvalRequestId: approval.id } });
  await logAudit({
    userId: user.id,
    action: "OVERTIME_SUBMIT",
    module: "hrd",
    entityType: "OvertimeRequest",
    entityId: ot.id,
    description: `Pengajuan ${requestNumber} (${minutes} menit)`,
  });
  return { ok: true, id: ot.id, data: { minutes } };
}

// Sinkronkan status pengajuan dari keputusan approval engine, dan untuk
// izin yang disetujui, tandai absensi hari-hari terkait sebagai LEAVE/SICK.
export async function syncRequestStatuses(
  user: CurrentUser | null
): Promise<Result<{ leaves: number; overtimes: number }>> {
  let leaves = 0;
  let overtimes = 0;
  const pendingLeaves = await db.leaveRequest.findMany({
    where: { status: "PENDING", approvalRequestId: { not: null } },
    include: { employee: true },
  });
  for (const leave of pendingLeaves) {
    const approval = await db.approvalRequest.findUnique({ where: { id: leave.approvalRequestId! } });
    if (!approval || approval.status === "PENDING") continue;
    const status = approval.status === "APPROVED" ? "APPROVED" : approval.status === "REJECTED" ? "REJECTED" : "CANCELLED";
    await db.leaveRequest.update({ where: { id: leave.id }, data: { status } });
    leaves++;
    if (status === "APPROVED") {
      // Tandai absensi harian sebagai cuti/sakit (tidak menimpa yang sudah hadir).
      const attStatus = leave.type === "SICK" ? "SICK" : "LEAVE";
      for (let t = leave.startDate.getTime(); t <= leave.endDate.getTime(); t += 86400e3) {
        const date = dayStart(new Date(t));
        const existing = await db.attendance.findUnique({
          where: { employeeId_date: { employeeId: leave.employeeId, date } },
        });
        if (existing?.clockInAt) continue;
        await db.attendance.upsert({
          where: { employeeId_date: { employeeId: leave.employeeId, date } },
          update: { status: attStatus, note: leave.requestNumber },
          create: { employeeId: leave.employeeId, date, status: attStatus, note: leave.requestNumber },
        });
      }
    }
  }
  const pendingOt = await db.overtimeRequest.findMany({
    where: { status: "PENDING", approvalRequestId: { not: null } },
  });
  for (const ot of pendingOt) {
    const approval = await db.approvalRequest.findUnique({ where: { id: ot.approvalRequestId! } });
    if (!approval || approval.status === "PENDING") continue;
    const status = approval.status === "APPROVED" ? "APPROVED" : approval.status === "REJECTED" ? "REJECTED" : "CANCELLED";
    await db.overtimeRequest.update({ where: { id: ot.id }, data: { status } });
    overtimes++;
  }
  if (leaves + overtimes > 0) {
    await logAudit({
      userId: user?.id ?? null,
      action: "HRD_SYNC_REQUESTS",
      module: "hrd",
      entityType: "LeaveRequest",
      description: `Sinkronisasi keputusan approval: ${leaves} izin, ${overtimes} lembur`,
    });
  }
  return { ok: true, id: "sync", data: { leaves, overtimes } };
}

// ── Rekap bulanan ───────────────────────────────────────────────

export interface MonthlyRecapRow {
  employeeId: string;
  employeeNo: string;
  fullName: string;
  present: number;
  late: number;
  leave: number;
  sick: number;
  absent: number;
  totalWorkMinutes: number;
  totalLateMinutes: number;
  overtimeMinutes: number;
}

export async function monthlyRecap(period: string): Promise<MonthlyRecapRow[]> {
  const m = period.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!m) return [];
  const from = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  const to = new Date(Number(m[1]), Number(m[2]), 0, 23, 59, 59, 999);
  const employees = await db.employee.findMany({
    where: { isActive: true },
    orderBy: { employeeNo: "asc" },
  });
  const attendances = await db.attendance.findMany({
    where: { date: { gte: from, lte: to } },
  });
  const overtimes = await db.overtimeRequest.findMany({
    where: { date: { gte: from, lte: to }, status: "APPROVED" },
  });
  return employees.map((e) => {
    const rows = attendances.filter((a) => a.employeeId === e.id);
    return {
      employeeId: e.id,
      employeeNo: e.employeeNo,
      fullName: e.fullName,
      present: rows.filter((r) => r.status === "PRESENT").length,
      late: rows.filter((r) => r.status === "LATE").length,
      leave: rows.filter((r) => r.status === "LEAVE").length,
      sick: rows.filter((r) => r.status === "SICK").length,
      absent: rows.filter((r) => r.status === "ABSENT").length,
      totalWorkMinutes: rows.reduce((a, r) => a + r.workMinutes, 0),
      totalLateMinutes: rows.reduce((a, r) => a + r.lateMinutes, 0),
      overtimeMinutes: overtimes.filter((o) => o.employeeId === e.id).reduce((a, o) => a + o.minutes, 0),
    };
  });
}
