"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ClipboardCheck, Contact, LayoutDashboard, Megaphone, Settings, UsersRound } from "lucide-react";
import { useCrmMenu } from "@/components/app-shell";

export interface NavItem {
  href: string;
  label: string;
}
export interface NavGroup {
  title: string;
  items: NavItem[];
}

export function SidebarNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const closeMenu = useCrmMenu();
  const iconFor = (group: string) => {
    if (group === "Utama") return LayoutDashboard;
    if (group === "Marketing") return Megaphone;
    if (group === "Sales") return UsersRound;
    if (group === "CRM") return Contact;
    if (group === "Approval") return ClipboardCheck;
    if (group === "Pengawasan") return Activity;
    return Settings;
  };

  return (
    <nav className="crm-navigation" aria-label="Navigasi utama">
      {groups.map((group) => (
        <div key={group.title}>
          <div className="crm-nav-group-title">
            {group.title}
          </div>
          <ul className="crm-nav-list">
            {group.items.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(item.href + "/");
              const Icon = iconFor(group.title);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`crm-nav-link ${active ? "is-active" : ""}`}
                    onClick={closeMenu}
                  >
                    <Icon aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
