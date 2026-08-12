"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, INSPECTION_CHECKLIST } from "@/lib/constants";
import {
  assignRecovery,
  recordAttempt,
  pickupDevices,
  confirmPhysicalDisconnect,
  receiveDevices,
  inspectDevice,
  markNotReturned,
  attachRecoveryEvidence,
  signRecoveryPickup,
  saveRecoverySignatureImage,
  type PickupLine,
  type EvidenceKind,
} from "@/lib/device-recovery";
import { resolveOrigin } from "@/lib/recovery-origin";

// Form mengirim `origin` berupa TOKEN (`portal` | `backoffice`), bukan URL.
// Alasannya dan daftarnya ada di src/lib/recovery-origin.ts.

function back(
  id: string,
  result: { ok: true; id: string } | { ok: false; error: string },
  okMsg: string,
  origin?: FormDataEntryValue | null
): never {
  redirect(
    `${resolveOrigin(origin ? String(origin) : null, id)}?` +
      (result.ok ? "ok=" + encodeURIComponent(okMsg) : "error=" + encodeURIComponent(result.error))
  );
}

export async function assignRecoveryAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.RECOVERY_ASSIGN);
  const id = String(formData.get("recoveryId") ?? "");
  const scheduled = String(formData.get("scheduledAt") ?? "");
  const result = await assignRecovery(
    user,
    id,
    String(formData.get("technicianId") ?? ""),
    scheduled ? new Date(scheduled) : null
  );
  revalidatePath("/inventory/device-recoveries");
  back(id, result, "Teknisi ditugaskan.", formData.get("origin"));
}

export async function recordAttemptAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.RECOVERY_PICKUP);
  const id = String(formData.get("recoveryId") ?? "");
  // Koordinat dikirim form bila peramban mengizinkan geolokasi; kalau tidak
  // ada, kunjungan tetap boleh tercatat — menolak catatan hanya karena GPS
  // mati akan membuat kunjungan tidak tercatat sama sekali.
  const lat = formData.get("latitude");
  const lng = formData.get("longitude");
  const result = await recordAttempt(user, id, {
    result: String(formData.get("result") ?? ""),
    note: String(formData.get("note") ?? ""),
    latitude: lat ? Number(lat) : null,
    longitude: lng ? Number(lng) : null,
  });
  revalidatePath("/inventory/device-recoveries");
  back(id, result, "Kunjungan tercatat.", formData.get("origin"));
}

export async function pickupDevicesAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.RECOVERY_PICKUP);
  const id = String(formData.get("recoveryId") ?? "");
  const lines: PickupLine[] = [];
  for (const itemId of formData.getAll("pick").map(String)) {
    lines.push({
      itemId,
      actualSerial: String(formData.get(`serial_${itemId}`) ?? ""),
      actualMac: String(formData.get(`mac_${itemId}`) ?? ""),
      mismatchNote: String(formData.get(`note_${itemId}`) ?? ""),
    });
  }
  const result = lines.length
    ? await pickupDevices(user, id, lines)
    : ({ ok: false, error: "Pilih minimal satu perangkat." } as const);
  revalidatePath("/inventory/device-recoveries");
  back(id, result, "Perangkat tercatat ditarik.", formData.get("origin"));
}

export async function confirmDisconnectAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.RECOVERY_PICKUP);
  const id = String(formData.get("recoveryId") ?? "");
  const result = await confirmPhysicalDisconnect(user, id);
  revalidatePath("/inventory/device-recoveries");
  revalidatePath("/noc/ftth");
  back(id, result, "Pemutusan fisik dikonfirmasi — port ODP dilepas.", formData.get("origin"));
}

export async function receiveDevicesAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.RECOVERY_RECEIVE);
  const id = String(formData.get("recoveryId") ?? "");
  const itemIds = formData.getAll("receive").map(String);
  const result = await receiveDevices(user, id, itemIds);
  revalidatePath("/inventory/device-recoveries");
  back(id, result, "Perangkat masuk karantina — belum menambah stok tersedia.", formData.get("origin"));
}

export async function inspectDeviceAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.RECOVERY_INSPECT);
  const id = String(formData.get("recoveryId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const checklist: Record<string, boolean> = {};
  for (const [key] of INSPECTION_CHECKLIST) {
    checklist[key] = formData.get(`chk_${key}`) === "on";
  }
  const result = await inspectDevice(user, itemId, {
    checklist,
    decision: String(formData.get("decision") ?? ""),
    note: String(formData.get("note") ?? ""),
  });
  revalidatePath("/inventory/device-recoveries");
  revalidatePath("/inventory/stock");
  back(id, result, "Inspeksi tersimpan.", formData.get("origin"));
}

export async function markNotReturnedAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.RECOVERY_ESCALATE);
  const id = String(formData.get("recoveryId") ?? "");
  const result = await markNotReturned(
    user,
    String(formData.get("itemId") ?? ""),
    String(formData.get("note") ?? "")
  );
  revalidatePath("/inventory/device-recoveries");
  back(id, result, "Perangkat dinyatakan tidak kembali.", formData.get("origin"));
}

// ── Bukti lapangan (Fase 33) ────────────────────────────────────
// Kontrak untuk form: setiap aksi di bawah membaca nama field yang tertulis
// di sini. Unggahan memakai <form encType="multipart/form-data">.

/** field: recoveryId, kind (ATTEMPT|PICKUP|INSPECTION), entityId, file */
export async function attachEvidenceAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  const id = String(formData.get("recoveryId") ?? "");
  const kind = String(formData.get("kind") ?? "") as EvidenceKind;
  const entityId = String(formData.get("entityId") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    back(id, { ok: false, error: "Pilih berkas terlebih dahulu." }, "", formData.get("origin"));
  }
  const result = await attachRecoveryEvidence(user, kind, entityId, file as File);
  revalidatePath("/inventory/device-recoveries");
  back(id, result, "Bukti tersimpan.", formData.get("origin"));
}

/**
 * field: recoveryId, role (CUSTOMER|TECHNICIAN), signerName, origin?,
 *        DAN salah satu dari: attachmentId (sudah diunggah) atau
 *        signatureFile (diunggah sekaligus di submit yang sama).
 *
 * Gambar tetap OPSIONAL. Nama penanda tangan satu-satunya yang wajib, karena
 * itulah yang masih terbaca bertahun-tahun kemudian saat berkas gambarnya
 * sudah tidak bisa dibuka.
 */
export async function signPickupAction(formData: FormData): Promise<void> {
  const user = await requirePermission(PERMISSIONS.RECOVERY_PICKUP);
  const id = String(formData.get("recoveryId") ?? "");
  let attachmentId = String(formData.get("attachmentId") ?? "");

  // Jalur satu-submit: form biasa dengan <input type="file">. Berkasnya
  // disimpan lebih dulu, id-nya dipakai di baris berikutnya.
  const file = formData.get("signatureFile");
  if (file instanceof File && file.size > 0) {
    const uploaded = await saveRecoverySignatureImage(user, id, file);
    if (!uploaded.ok) back(id, uploaded, "", formData.get("origin"));
    attachmentId = uploaded.id;
  }

  const result = await signRecoveryPickup(
    user,
    id,
    String(formData.get("role") ?? ""),
    String(formData.get("signerName") ?? ""),
    attachmentId || undefined
  );
  revalidatePath("/inventory/device-recoveries");
  revalidatePath("/portal/recoveries");
  back(id, result, "Tanda tangan tersimpan.", formData.get("origin"));
}

/**
 * Unggah gambar tanda tangan saja, mengembalikan attachmentId (Fase 48).
 *
 * Diminta frontend (PRD-FRONTEND §20) untuk kanvas tanda tangan: kanvas
 * menghasilkan blob, blob diunggah lewat action ini, lalu id-nya dikirim
 * sebagai `attachmentId` ke signPickupAction.
 *
 * Berbentuk action ber-state (`useActionState`) karena harus MENGEMBALIKAN
 * nilai, bukan mengalihkan halaman — sebuah redirect akan membuang kanvas
 * yang baru saja digambar.
 */
export type SignatureUploadState =
  | { ok: true; attachmentId: string }
  | { ok: false; error: string }
  | null;

export async function uploadSignatureAction(
  _prev: SignatureUploadState,
  formData: FormData
): Promise<SignatureUploadState> {
  const user = await requirePermission(PERMISSIONS.RECOVERY_PICKUP);
  const id = String(formData.get("recoveryId") ?? "");
  const file = formData.get("signatureFile");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Gambar tanda tangan belum ada." };
  }
  const uploaded = await saveRecoverySignatureImage(user, id, file);
  return uploaded.ok
    ? { ok: true, attachmentId: uploaded.id }
    : { ok: false, error: uploaded.error };
}
