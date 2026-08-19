"use client";

import { Trash2 } from "lucide-react";
import type { AvatarCrop } from "@/lib/avatar";
import { EmployeePhotoCropper } from "@/components/employee-photo-cropper";

type AvatarUploadAction = (formData: FormData) => void | Promise<void>;
type AvatarRemoveAction = () => Promise<void>;

const AVATAR_CROP_MIN_SIDE = 256;

function avatarAspect() {
  return 1;
}

/**
 * Mirror client-side untuk avatarCropRejection.
 * Server tetap memvalidasi ulang; @/lib/avatar tidak diimpor saat runtime
 * karena modul tersebut memiliki node:crypto untuk token avatar.
 */
function avatarCropRejection(
  crop: AvatarCrop,
  source: { width: number; height: number },
): string | null {
  const values = [crop.x, crop.y, crop.width, crop.height];
  if (values.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    return "Area potong tidak terbaca. Geser ulang kotaknya.";
  }
  if (crop.width <= 0 || crop.height <= 0) return "Area potong kosong. Geser ulang kotaknya.";
  if (crop.x < 0 || crop.y < 0) return "Area potong keluar dari foto.";
  if (crop.x + crop.width > 1.0001 || crop.y + crop.height > 1.0001) {
    return "Area potong keluar dari foto.";
  }
  const width = Math.round(crop.width * source.width);
  const height = Math.round(crop.height * source.height);
  if (width < AVATAR_CROP_MIN_SIDE || height < AVATAR_CROP_MIN_SIDE) {
    return (
      `Area potong terlalu kecil (${width}x${height} piksel). ` +
      `Perbesar kotaknya, minimal ${AVATAR_CROP_MIN_SIDE}x${AVATAR_CROP_MIN_SIDE} — ` +
      "kalau lebih kecil, wajahnya pecah saat ditampilkan."
    );
  }
  return null;
}

export function ProfileAvatarForm({
  currentUrl,
  uploadAction,
  removeAction,
}: {
  currentUrl: string | null;
  uploadAction: AvatarUploadAction;
  removeAction: AvatarRemoveAction;
}) {
  return (
    <div className="crm-profile-avatar-controls">
      <EmployeePhotoCropper
        action={uploadAction}
        inputName="avatar"
        cropAspect={avatarAspect()}
        cropMinWidth={AVATAR_CROP_MIN_SIDE}
        cropMinHeight={AVATAR_CROP_MIN_SIDE}
        cropValidator={avatarCropRejection}
        cropShape="circle"
        title={currentUrl ? "Ganti foto profil" : "Unggah foto profil"}
        description="Geser lingkaran ke posisi wajah yang tepat. Foto profil akan dipotong persegi dan ditampilkan bulat di aplikasi."
        helpText={`JPG, PNG, atau WebP. Area minimum ${AVATAR_CROP_MIN_SIDE}×${AVATAR_CROP_MIN_SIDE} piksel pada foto asli.`}
        submitLabel="Simpan foto profil"
      />

      {currentUrl ? (
        <form action={removeAction} className="crm-profile-avatar-remove-form">
          <button type="submit" className="btn-secondary crm-profile-avatar-remove">
            <Trash2 aria-hidden="true" />
            Hapus foto
          </button>
        </form>
      ) : null}
    </div>
  );
}
