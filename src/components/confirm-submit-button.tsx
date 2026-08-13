"use client";

type SubmitAction = (formData: FormData) => void | Promise<void>;

export function ConfirmSubmitButton({
  action,
  label,
  confirmation,
  className = "btn-primary",
}: {
  action: SubmitAction;
  label: string;
  confirmation: string;
  className?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(confirmation)) event.preventDefault();
      }}
    >
      <button type="submit" className={className}>
        {label}
      </button>
    </form>
  );
}
