"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import {
  saveEmployee,
  saveShift,
  saveAttendanceLocation,
  saveSchedule,
  clockIn,
  clockOut,
  submitLeave,
  submitOvertime,
  syncRequestStatuses,
} from "@/lib/hrd";
import {
  uploadEmployeePhoto,
  issueCard,
  replaceCard,
  markCardLost,
  revokeCard,
} from "@/lib/employee-card-service";
import type { CardPhotoCrop } from "@/lib/employee-card";
import { previewEmployeeImport, applyEmployeeImport } from "@/lib/employee-import-service";

function num(v: FormDataEntryValue | null): number {
  return Number(String(v ?? "").trim());
}

// ── Master (HRD) ────────────────────────────────────────────────

/** Tanggal opsional: string kosong berarti "tidak diisi", bukan tanggal invalid. */
function optionalDate(v: FormDataEntryValue | null): Date | null {
  const s = String(v ?? "").trim();
  return s ? new Date(s) : null;
}

export async function saveEmployeeAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.HRD_MANAGE);
  const joined = String(formData.get("joinedAt") ?? "");
  // Jenis bukan-kontrak mengirimkan blok tanggal yang tidak dirender sama
  // sekali, jadi nilainya memang absen — bukan dikosongkan di sini. Yang
  // menolak tanggal nyasar tetap contractRejection() di service layer.
  const result = await saveEmployee(user, {
    id: String(formData.get("id") ?? "") || undefined,
    userId: String(formData.get("userId") ?? "") || null,
    employeeNo: String(formData.get("employeeNo") ?? ""), // kosong = diterbitkan sistem
    fullName: String(formData.get("fullName") ?? ""),
    jobTitle: String(formData.get("jobTitle") ?? "") || undefined,
    employeeType: String(formData.get("employeeType") ?? "FULL_TIME"),
    supervisorId: String(formData.get("supervisorId") ?? "") || null,
    joinedAt: joined ? new Date(joined) : new Date(NaN),
    isActive: formData.get("isActive") === "on",
    address: String(formData.get("address") ?? "") || null,
    divisionId: String(formData.get("divisionId") ?? "") || null,
    birthPlace: String(formData.get("birthPlace") ?? "") || null,
    birthDate: optionalDate(formData.get("birthDate")),
    education: String(formData.get("education") ?? "") || null,
    bloodType: String(formData.get("bloodType") ?? "") || null,
    workPattern: String(formData.get("workPattern") ?? "NON_SHIFT"),
    jobLevel: String(formData.get("jobLevel") ?? "STAFF"),
    contractStartAt: optionalDate(formData.get("contractStartAt")),
    contractEndAt: optionalDate(formData.get("contractEndAt")),
  });
  revalidatePath("/hrd/employees");
  redirect(
    "/hrd/employees?" +
      (result.ok ? "ok=" + encodeURIComponent("Karyawan tersimpan.") : "error=" + encodeURIComponent(result.error))
  );
}

// ── Impor pegawai dari Excel (Fase 51) ──────────────────────────
//
// Dua aksi terpisah, dan keduanya menerima BERKASNYA — bukan hasil pratinjau.
// Penerapan membaca ulang berkas itu dari nol. Kalau ia menerima daftar baris
// dari peramban, siapa pun yang bisa memanggil server action bisa mengirim
// data pegawai apa saja dan melewati seluruh pemeriksaan.
//
// Keduanya MENGEMBALIKAN nilai alih-alih redirect: hasil pratinjau adalah
// tabel yang harus dibaca dulu sebelum HRD memutuskan.

export async function previewEmployeeImportAction(formData: FormData) {
  const user = await requirePermission(PERMISSIONS.HRD_MANAGE);
  return previewEmployeeImport(user, formData.get("file") as File);
}

export async function applyEmployeeImportAction(formData: FormData) {
  const user = await requirePermission(PERMISSIONS.HRD_MANAGE);
  const result = await applyEmployeeImport(user, formData.get("file") as File);
  if (result.ok) revalidatePath("/hrd/employees");
  return result;
}

export async function saveShiftAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.HRD_MANAGE);
  const result = await saveShift(user, {
    id: String(formData.get("id") ?? "") || undefined,
    name: String(formData.get("name") ?? ""),
    startTime: String(formData.get("startTime") ?? ""),
    endTime: String(formData.get("endTime") ?? ""),
    lateToleranceMin: num(formData.get("lateToleranceMin")),
    isActive: formData.get("isActive") === "on",
  });
  revalidatePath("/hrd/shifts");
  redirect(
    "/hrd/shifts?" +
      (result.ok ? "ok=" + encodeURIComponent("Shift tersimpan.") : "error=" + encodeURIComponent(result.error))
  );
}

export async function saveLocationAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.HRD_MANAGE);
  const result = await saveAttendanceLocation(user, {
    id: String(formData.get("id") ?? "") || undefined,
    name: String(formData.get("name") ?? ""),
    latitude: num(formData.get("latitude")),
    longitude: num(formData.get("longitude")),
    radiusM: num(formData.get("radiusM")),
    isActive: formData.get("isActive") === "on",
  });
  revalidatePath("/hrd/shifts");
  redirect(
    "/hrd/shifts?" +
      (result.ok ? "ok=" + encodeURIComponent("Lokasi absen tersimpan.") : "error=" + encodeURIComponent(result.error))
  );
}

export async function saveScheduleAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.HRD_MANAGE);
  const date = String(formData.get("date") ?? "");
  const result = await saveSchedule(user, {
    employeeId: String(formData.get("employeeId") ?? ""),
    date: date ? new Date(date) : new Date(NaN),
    shiftId: String(formData.get("shiftId") ?? "") || null,
    dayType: String(formData.get("dayType") ?? "WORK"),
    note: String(formData.get("note") ?? "") || undefined,
  });
  revalidatePath("/hrd/schedule");
  redirect(
    "/hrd/schedule?" +
      (result.ok ? "ok=" + encodeURIComponent("Jadwal tersimpan.") : "error=" + encodeURIComponent(result.error))
  );
}

export async function syncRequestsAction(): Promise<void> {
  const user = await requirePermission(PERMISSIONS.HRD_VIEW);
  const result = await syncRequestStatuses(user);
  revalidatePath("/hrd/requests");
  redirect(
    "/hrd/requests?" +
      (result.ok
        ? "ok=" + encodeURIComponent(`Sinkronisasi: ${result.data?.leaves} izin, ${result.data?.overtimes} lembur diperbarui.`)
        : "error=" + encodeURIComponent(result.error))
  );
}

// ── Self-service ────────────────────────────────────────────────

function backSelf(result: { ok: boolean; error?: string }, okMsg: string): never {
  redirect(
    "/hrd/my-attendance?" +
      (result.ok ? "ok=" + encodeURIComponent(okMsg) : "error=" + encodeURIComponent(result.error ?? "Gagal."))
  );
}

export async function clockInAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.ATTENDANCE_SELF);
  const result = await clockIn(user, {
    latitude: num(formData.get("latitude")),
    longitude: num(formData.get("longitude")),
  });
  revalidatePath("/hrd/my-attendance");
  backSelf(
    result,
    result.ok
      ? `Absen masuk tercatat (${result.data?.distanceM} m dari titik)${result.data?.lateMinutes ? ` — terlambat ${result.data.lateMinutes} menit` : ""}.`
      : ""
  );
}

export async function clockOutAction(): Promise<void> {
  const user = await requirePermission(PERMISSIONS.ATTENDANCE_SELF);
  const result = await clockOut(user, {});
  revalidatePath("/hrd/my-attendance");
  backSelf(result, result.ok ? `Absen pulang tercatat — ${result.data?.workMinutes} menit kerja.` : "");
}

export async function submitLeaveAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.ATTENDANCE_SELF);
  const start = String(formData.get("startDate") ?? "");
  const end = String(formData.get("endDate") ?? "");
  const result = await submitLeave(user, {
    type: String(formData.get("type") ?? ""),
    startDate: start ? new Date(start) : new Date(NaN),
    endDate: end ? new Date(end) : new Date(NaN),
    reason: String(formData.get("reason") ?? ""),
  });
  revalidatePath("/hrd/my-attendance");
  backSelf(result, "Pengajuan izin dikirim — menunggu approval berjenjang (atasan → HRD).");
}

export async function submitOvertimeAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.ATTENDANCE_SELF);
  const date = String(formData.get("date") ?? "");
  const result = await submitOvertime(user, {
    date: date ? new Date(date) : new Date(NaN),
    startTime: String(formData.get("startTime") ?? ""),
    endTime: String(formData.get("endTime") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });
  revalidatePath("/hrd/my-attendance");
  backSelf(result, result.ok ? `Pengajuan lembur ${result.data?.minutes} menit dikirim.` : "");
}

// ── Kartu pegawai & foto resmi (Fase 49) ────────────────────────
// Foto diunggah HRD (keputusan K5), jadi seluruh pengelolaan kartu memakai
// izin yang sama: hrd.manage. Kartu adalah dokumen kepegawaian, bukan
// perangkat IT.

function backToEmployee(employeeId: string, result: { ok: true } | { ok: false; error: string }, okMsg: string): never {
  redirect(
    `/hrd/employees/${employeeId}?` +
      (result.ok ? "ok=" + encodeURIComponent(okMsg) : "error=" + encodeURIComponent(result.error))
  );
}

/**
 * Bidang potong dari formulir, atau null bila HRD tidak menggesernya.
 *
 * Keempatnya harus ADA dan berupa angka. Sebagian saja berarti formulirnya
 * belum selesai mengirim — dan menerima potongan setengah jadi akan memotong
 * bagian yang salah tanpa ada yang menyadarinya. Yang tidak lengkap
 * dikembalikan sebagai null, sehingga potongannya ditentukan mesin seperti
 * sebelum fitur ini ada.
 */
function cropDariForm(formData: FormData): CardPhotoCrop | null {
  const ambil = (k: string) => {
    const v = formData.get(k);
    if (v === null || String(v).trim() === "") return null;
    const n = Number(String(v));
    return Number.isFinite(n) ? n : null;
  };
  const x = ambil("cropX");
  const y = ambil("cropY");
  const width = ambil("cropWidth");
  const height = ambil("cropHeight");
  if (x === null || y === null || width === null || height === null) return null;
  return { x, y, width, height };
}

/** field: employeeId, photo, cropX?, cropY?, cropWidth?, cropHeight? — encType="multipart/form-data" */
export async function uploadEmployeePhotoAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.HRD_MANAGE);
  const employeeId = String(formData.get("employeeId") ?? "");
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    backToEmployee(employeeId, { ok: false, error: "Pilih berkas foto terlebih dahulu." }, "");
  }
  const result = await uploadEmployeePhoto(user, employeeId, file as File, cropDariForm(formData));
  revalidatePath(`/hrd/employees/${employeeId}`);
  backToEmployee(employeeId, result, "Foto resmi tersimpan.");
}

/** field: employeeId, expiresAt?, nfcUid? */
export async function issueCardAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.HRD_MANAGE);
  const employeeId = String(formData.get("employeeId") ?? "");
  const result = await issueCard(user, {
    employeeId,
    expiresAt: optionalDate(formData.get("expiresAt")),
    nfcUid: String(formData.get("nfcUid") ?? "") || null,
  });
  revalidatePath(`/hrd/employees/${employeeId}`);
  backToEmployee(employeeId, result, "Kartu diterbitkan.");
}

/** field: employeeId, cardId, reason, expiresAt?, nfcUid? */
export async function replaceCardAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.HRD_MANAGE);
  const employeeId = String(formData.get("employeeId") ?? "");
  const result = await replaceCard(
    user,
    String(formData.get("cardId") ?? ""),
    String(formData.get("reason") ?? ""),
    {
      expiresAt: optionalDate(formData.get("expiresAt")),
      nfcUid: String(formData.get("nfcUid") ?? "") || null,
    }
  );
  revalidatePath(`/hrd/employees/${employeeId}`);
  backToEmployee(employeeId, result, "Kartu pengganti diterbitkan; kartu lama dimatikan.");
}

/** field: employeeId, cardId, reason */
export async function markCardLostAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.HRD_MANAGE);
  const employeeId = String(formData.get("employeeId") ?? "");
  const result = await markCardLost(
    user,
    String(formData.get("cardId") ?? ""),
    String(formData.get("reason") ?? "")
  );
  revalidatePath(`/hrd/employees/${employeeId}`);
  backToEmployee(employeeId, result, "Kartu dinyatakan hilang dan berhenti berlaku.");
}

/** field: employeeId, cardId, reason */
export async function revokeCardAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.HRD_MANAGE);
  const employeeId = String(formData.get("employeeId") ?? "");
  const result = await revokeCard(
    user,
    String(formData.get("cardId") ?? ""),
    String(formData.get("reason") ?? "")
  );
  revalidatePath(`/hrd/employees/${employeeId}`);
  backToEmployee(employeeId, result, "Kartu dicabut.");
}
