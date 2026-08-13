"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState, type InputHTMLAttributes } from "react";

type PasswordVisibilityInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function PasswordVisibilityInput({
  className = "",
  id: providedId,
  ...inputProps
}: PasswordVisibilityInputProps) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const [visible, setVisible] = useState(false);

  return (
    <div className="crm-password-field">
      <input
        {...inputProps}
        id={id}
        type={visible ? "text" : "password"}
        className={`input crm-password-input ${className}`.trim()}
      />
      <button
        type="button"
        className="crm-password-toggle"
        aria-label={visible ? "Sembunyikan password" : "Tampilkan password"}
        aria-controls={id}
        aria-pressed={visible}
        title={visible ? "Sembunyikan password" : "Tampilkan password"}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </button>
    </div>
  );
}
