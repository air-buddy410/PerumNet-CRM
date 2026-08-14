"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Menu, PanelLeftClose, PanelLeftOpen, ShieldCheck, UserRound, X } from "lucide-react";
import { Logo } from "@/components/logo";
import { GlobalSearch } from "@/components/global-search";
import { NotificationMenu, type NotificationMenuData } from "@/components/notification-menu";
import type { NavGroup } from "@/components/nav";

type FormAction = (formData: FormData) => Promise<void>;
type EmptyAction = () => Promise<void>;

type CrmAppShellProps = {
  children: ReactNode;
  groups: NavGroup[];
  navigation: ReactNode;
  profileMenuAction: ReactNode;
  user: { name: string; email?: string | null };
  mustChangePassword?: boolean;
  notificationData: NotificationMenuData;
  notificationError?: string;
  openNotificationAction: FormAction;
  markAllReadAction: EmptyAction;
};

const SIDEBAR_STORAGE_KEY = "perumnet-crm.sidebar-collapsed";
const CrmMenuContext = createContext<() => void>(() => undefined);
const ROUTE_TITLE_OVERRIDES = [
  ["/profile", "Profil Saya"],
  ["/notifications", "Notifikasi"],
] as const;

export function useCrmMenu() {
  return useContext(CrmMenuContext);
}

function pageTitle(groups: NavGroup[], pathname: string) {
  const override = ROUTE_TITLE_OVERRIDES
    .filter(([href]) => pathname === href || pathname.startsWith(`${href}/`))
    .sort(([a], [b]) => b.length - a.length)[0]?.[1];
  if (override) return override;

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
  profileMenuAction,
  user,
  mustChangePassword = false,
  notificationData,
  notificationError,
  openNotificationAction,
  markAllReadAction,
}: CrmAppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const title = useMemo(() => pageTitle(groups, pathname), [groups, pathname]);

  useEffect(() => {
    try {
      setSidebarCollapsed(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true");
    } catch {
      // localStorage may be unavailable in a restricted browser context.
    }
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed((value) => {
      const nextValue = !value;
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(nextValue));
      } catch {
        // Keep the in-memory toggle working when persistence is unavailable.
      }
      return nextValue;
    });
  };

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

  useEffect(() => {
    setMenuOpen(false);
    setProfileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProfileMenuOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [profileMenuOpen]);

  return (
    <div className="crm-shell">
      {menuOpen && (
        <button
          className="crm-sidebar-backdrop"
          aria-label="Tutup menu"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside
        id="crm-sidebar"
        className={`crm-sidebar ${menuOpen ? "is-open" : ""} ${sidebarCollapsed ? "is-collapsed" : ""}`}
      >
        <button
          type="button"
          className="crm-sidebar-close"
          aria-label="Tutup menu"
          onClick={() => setMenuOpen(false)}
        >
          <X aria-hidden="true" />
        </button>
        <div className="crm-sidebar-heading">
          <Link href="/dashboard" className="crm-brand" onClick={() => setMenuOpen(false)}>
            <Logo markClassName="h-10 w-[34px]" textClassName="text-sm" />
            <strong>CRM</strong>
          </Link>
        </div>
        <div className="crm-sidebar-rule" />
        <CrmMenuContext.Provider value={() => setMenuOpen(false)}>
          <div className="crm-sidebar-navigation">{navigation}</div>
        </CrmMenuContext.Provider>
        <div className="crm-sidebar-footer">
          <Link href="/profile" className="crm-avatar" aria-label="Buka profil" title="Buka profil" onClick={() => setMenuOpen(false)}>
            {initials(user.name)}
          </Link>
          <div className="crm-sidebar-user-copy">
            <strong>{user.name}</strong>
            <span>{user.email || "Akun PerumNet"}</span>
          </div>
          <Link href="/profile" className="crm-profile-link" aria-label="Buka profil" title="Buka profil" onClick={() => setMenuOpen(false)}>
            <UserRound aria-hidden="true" />
          </Link>
        </div>
        <div className="crm-sidebar-bottom-controls">
          <button
            type="button"
            className="crm-sidebar-collapse"
            aria-label={sidebarCollapsed ? "Perlebar sidebar" : "Minimalkan sidebar"}
            aria-controls="crm-sidebar"
            aria-pressed={sidebarCollapsed}
            title={sidebarCollapsed ? "Perlebar sidebar" : "Minimalkan sidebar"}
            onClick={toggleSidebar}
          >
            {sidebarCollapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
            <span className="crm-sidebar-collapse-label">
              {sidebarCollapsed ? "Perlebar sidebar" : "Minimalkan sidebar"}
            </span>
          </button>
        </div>
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
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
          <div className="crm-breadcrumb">
            <span>Operasional CRM</span>
            <i>/</i>
            <strong title={title}>{title}</strong>
          </div>
          <GlobalSearch groups={groups} />
          <div className="crm-topbar-actions">
            <NotificationMenu
              data={notificationData}
              error={notificationError}
              passwordChangeRequired={mustChangePassword}
              openNotificationAction={openNotificationAction}
              markAllReadAction={markAllReadAction}
            />
            <div className="crm-profile-control" ref={profileMenuRef}>
              <button
                type="button"
                aria-label="Buka menu akun"
                aria-expanded={profileMenuOpen}
                aria-controls="crm-profile-menu"
                className="crm-topbar-profile"
                onClick={() => setProfileMenuOpen((value) => !value)}
              >
                <UserRound aria-hidden="true" />
                <span>{user.name}</span>
                <ChevronDown className="crm-topbar-profile-chevron" aria-hidden="true" />
              </button>
              {profileMenuOpen && (
                <div id="crm-profile-menu" className="crm-profile-menu" role="menu" aria-label="Menu akun">
                  <Link href="/profile" role="menuitem" className="crm-profile-menu-link" onClick={() => setProfileMenuOpen(false)}>
                    <UserRound aria-hidden="true" />
                    Profil saya
                  </Link>
                  <div className="crm-profile-menu-rule" />
                  <div className="crm-profile-menu-logout">{profileMenuAction}</div>
                </div>
              )}
            </div>
          </div>
        </header>
        {mustChangePassword && (
          <div className="crm-password-notice" role="alert" aria-live="polite">
            <ShieldCheck aria-hidden="true" />
            <span>
              Password akun Anda masih perlu diganti. <Link href="/profile#password-title">Buka pengaturan password</Link>.
            </span>
          </div>
        )}
        <main className="crm-page">{children}</main>
      </div>
    </div>
  );
}
