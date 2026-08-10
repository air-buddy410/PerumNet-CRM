"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Boxes, ChevronDown, ClipboardCheck, Contact, FolderKanban, LayoutDashboard, LifeBuoy, Megaphone, RadioTower, Receipt, Server, Settings, UsersRound, Wallet, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
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
  const groupHasActiveRoute = (group: NavGroup) =>
    group.items.some(
      (item) => pathname === item.href || pathname.startsWith(item.href + "/")
    );
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      groups
        .filter((group) => group.items.length > 1 && groupHasActiveRoute(group))
        .map((group) => [group.title, true])
    )
  );

  useEffect(() => {
    const activeGroup = groups.find(
      (group) => group.items.length > 1 && groupHasActiveRoute(group)
    );
    if (!activeGroup) return;

    setOpenGroups((current) =>
      current[activeGroup.title]
        ? current
        : { ...current, [activeGroup.title]: true }
    );
  }, [groups, pathname]);

  const iconFor = (group: string) => {
    if (group === "Utama") return LayoutDashboard;
    if (group === "Marketing") return Megaphone;
    if (group === "Sales") return UsersRound;
    if (group === "CRM") return Contact;
    if (group === "Inventory") return Boxes;
    if (group === "Operasional") return Wrench;
    if (group === "Billing") return Receipt;
    if (group === "Finance") return Wallet;
    if (group === "Projects") return FolderKanban;
    if (group === "NOC") return RadioTower;
    if (group === "IT/DevOps") return Server;
    if (group === "IT Support") return LifeBuoy;
    if (group === "Approval") return ClipboardCheck;
    if (group === "Pengawasan") return Activity;
    return Settings;
  };

  return (
    <nav className="crm-navigation" aria-label="Navigasi utama">
      {groups.map((group) => {
        const collapsible = group.items.length > 1;
        const expanded = Boolean(openGroups[group.title]);
        const activeGroup = groupHasActiveRoute(group);
        const groupId = `crm-nav-group-${group.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

        return (
          <div key={group.title} className={`crm-nav-group ${activeGroup ? "is-active-group" : ""}`}>
            {collapsible ? (
              <button
                type="button"
                className="crm-nav-group-toggle"
                aria-expanded={expanded}
                aria-controls={groupId}
                onClick={() =>
                  setOpenGroups((current) => ({
                    ...current,
                    [group.title]: !current[group.title],
                  }))
                }
              >
                <span>{group.title}</span>
                <ChevronDown aria-hidden="true" />
              </button>
            ) : (
              <div className="crm-nav-group-title">{group.title}</div>
            )}
            {(!collapsible || expanded) && (
              <ul
                id={collapsible ? groupId : undefined}
                className={`crm-nav-list ${collapsible ? "is-collapsible" : ""}`}
              >
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
            )}
          </div>
        );
      })}
    </nav>
  );
}
