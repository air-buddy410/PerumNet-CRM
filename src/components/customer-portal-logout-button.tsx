"use client";

import { LogOut } from "lucide-react";
import { useFormStatus } from "react-dom";
import { keluarPortalAction } from "@/app/pelanggan/actions";

function LogoutSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="customer-portal-logout-button" disabled={pending}>
      <LogOut aria-hidden="true" />
      {pending ? "Keluar…" : "Keluar"}
    </button>
  );
}

export function CustomerPortalLogoutButton() {
  return (
    <form action={keluarPortalAction} className="customer-portal-logout-form">
      <LogoutSubmitButton />
    </form>
  );
}
