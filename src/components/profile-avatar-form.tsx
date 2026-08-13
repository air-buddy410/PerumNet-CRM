"use client";

import { useState, type FormEvent, type ChangeEvent } from "react";
import { Camera, Trash2, Upload } from "lucide-react";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ACCEPTED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type AvatarUploadAction = (formData: FormData) => Promise<void>;
type AvatarRemoveAction = () => Promise<void>;

function validateAvatar(file: File | undefined) {
  if (!file || file.size === 0) return "Pilih berkas foto terlebih dahulu.";
  if (file.size > MAX_AVATAR_BYTES) return "Ukuran foto maksimal 5 MB.";
  if (!ACCEPTED_AVATAR_TYPES.has(file.type)) return "Foto harus berformat JPG, PNG, atau WebP.";
  return "";
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
  const [error, setError] = useState("");
  const [selectedName, setSelectedName] = useState("");

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    const nextError = file ? validateAvatar(file) : "";
    setError(nextError);
    setSelectedName(file && !nextError ? file.name : "");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const input = event.currentTarget.elements.namedItem("avatar");
    const fileInput = input instanceof HTMLInputElement ? input : null;
    const nextError = validateAvatar(fileInput?.files?.[0]);
    setError(nextError);
    if (nextError) event.preventDefault();
  }

  return (
    <div className="crm-profile-avatar-controls">
      <form action={uploadAction} encType="multipart/form-data" onSubmit={handleSubmit}>
        <label className="crm-profile-avatar-picker">
          <Camera aria-hidden="true" />
          <span>{selectedName || "Pilih foto"}</span>
          <input
            className="sr-only"
            type="file"
            name="avatar"
            accept="image/jpeg,image/png,image/webp"
            capture="user"
            onChange={handleChange}
            aria-describedby={`profile-avatar-help${error ? " profile-avatar-error" : ""}`}
          />
        </label>
        <button type="submit" className="btn-primary" disabled={!selectedName || Boolean(error)}>
          <Upload aria-hidden="true" />
          Simpan foto
        </button>
      </form>
      {currentUrl && (
        <form action={removeAction}>
          <button type="submit" className="btn-secondary crm-profile-avatar-remove">
            <Trash2 aria-hidden="true" />
            Hapus foto
          </button>
        </form>
      )}
      <p id="profile-avatar-help" className="crm-profile-avatar-help">
        JPG, PNG, atau WebP, maksimal 5 MB. Foto diproses aman di server dan hanya untuk tampilan aplikasi.
      </p>
      {error && <p id="profile-avatar-error" className="crm-profile-avatar-error" role="alert">{error}</p>}
    </div>
  );
}
