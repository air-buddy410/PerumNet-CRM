"use client";

type RestoreAction = (formData: FormData) => void | Promise<void>;

export function ArchiveRestoreButton({
  action,
  id,
  label,
  reason,
}: {
  action: RestoreAction;
  id: string;
  label: string;
  reason: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `Pulihkan ${label}?\n\nAlasan arsip: ${reason}\n\nBaris akan kembali dikelola oleh modul asalnya.`
        );
        if (!confirmed) event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="text-brand-600 hover:underline">
        Pulihkan
      </button>
    </form>
  );
}
