"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Menu, ShieldCheck, UserRound, X } from "lucide-react";
import { Logo } from "@/components/logo";
import type { NavGroup } from "@/components/nav";

type CrmAppShellProps = {
  children: ReactNode;
  groups: NavGroup[];
  navigation: ReactNode;
  footerAction: ReactNode;
  user: { name: string; email?: string | null };
  mustChangePassword?: boolean;
};

const CrmMenuContext = createContext<() => void>(() => undefined);

export function useCrmMenu() {
  return useContext(CrmMenuContext);
}

function pageTitle(groups: NavGroup[], pathname: string) {
  const item = groups
    .flatMap((group) => group.items)
    .filter((candidate) => pathname === candidate.href || pathname.startsWith(`${candidate.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];

  return item?.label ?? "Dashboard";
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function CrmAppShell({
  children,
  groups,
  navigation,
  footerAction,
  user,
  mustChangePassword = false,
}: CrmAppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const title = useMemo(() => pageTitle(groups, pathname), [groups, pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  return (
    <div className="crm-shell">
      {menuOpen && (
        <button
          className="crm-sidebar-backdrop"
          aria-label="Tutup menu"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside id="crm-sidebar" className={`crm-sidebar ${menuOpen ? "is-open" : ""}`}>
        <button
          type="button"
          className="crm-sidebar-close"
          aria-label="Tutup menu"
          onClick={() => setMenuOpen(false)}
        >
          <X aria-hidden="true" />
        </button>
        <Link href="/dashboard" className="crm-brand" onClick={() => setMenuOpen(false)}>
          <Logo markClassName="h-8 w-8" textClassName="text-sm" />
          <strong>CRM</strong>
        </Link>
        <div className="crm-sidebar-rule" />
        <CrmMenuContext.Provider value={() => setMenuOpen(false)}>
          <div className="crm-sidebar-navigation">{navigation}</div>
        </CrmMenuContext.Provider>
        <div className="crm-sidebar-footer">
          <Link href="/profile" className="crm-avatar" aria-label="Buka profil" onClick={() => setMenuOpen(false)}>
            {initials(user.name)}
          </Link>
          <div>
            <strong>{user.name}</strong>
            <span>{user.email || "Akun PerumNet"}</span>
          </div>
          <Link href="/profile" className="crm-profile-link" aria-label="Buka profil" onClick={() => setMenuOpen(false)}>
            <UserRound aria-hidden="true" />
          </Link>
        </div>
        <div className="crm-sidebar-signout">{footerAction}</div>
      </aside>

      <div className="crm-workspace">
        <header className="crm-topbar">
          <button
            type="button"
            className="crm-menu-button"
            aria-label={menuOpen ? "Tutup menu" : "Buka menu"}
            aria-controls="crm-sidebar"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
          <div className="crm-breadcrumb">
            <span>Operasional CRM</span>
            <i>/</i>
            <strong>{title}</strong>
          </div>
          <div className="crm-topbar-actions">
            <Link href="/profile" aria-label="Buka profil" className="crm-topbar-profile">
              <UserRound aria-hidden="true" />
              <span>{user.name}</span>
            </Link>
          </div>
        </header>
        {mustChangePassword && (
          <div className="crm-password-notice">
            <ShieldCheck aria-hidden="true" />
            <span>
              Anda masih menggunakan password awal. <Link href="/profile">Ganti password sekarang</Link>.
            </span>
          </div>
        )}
        <main className="crm-page">{children}</main>
      </div>
    </div>
  );
}
