"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  AlarmClock,
  Archive,
  ArrowLeftRight,
  Ban,
  Bell,
  BellRing,
  BookCopy,
  BookOpenCheck,
  Boxes,
  BriefcaseBusiness,
  Building2,
  Calculator,
  CalendarClock,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  Contact,
  CreditCard,
  Database,
  FileClock,
  FileText,
  FolderKanban,
  Gauge,
  GitBranch,
  HandCoins,
  Headphones,
  KeyRound,
  Layers3,
  LayoutDashboard,
  LifeBuoy,
  Link2,
  ListChecks,
  LockKeyhole,
  Map,
  MapPinned,
  Megaphone,
  MonitorCog,
  Monitor,
  Network,
  PackageCheck,
  PackagePlus,
  RadioTower,
  ReceiptText,
  Router,
  Scale,
  Search,
  Send,
  Server,
  Settings,
  ShieldCheck,
  ShieldEllipsis,
  Siren,
  SlidersHorizontal,
  Store,
  Tag,
  Target,
  Ticket,
  Truck,
  Undo2,
  UserRoundCog,
  UsersRound,
  Wallet,
  WalletCards,
  Warehouse,
  Wrench,
  type LucideIcon,
} from "lucide-react";
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

const iconByRoute: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/notifications": Bell,
  "/outages": Siren,
  "/marketing/campaigns": Megaphone,
  "/sales/leads": Target,
  "/sales/pipeline": GitBranch,
  "/sales/surveys": MapPinned,
  "/sales/quotations": ReceiptText,
  "/crm/customers": UsersRound,
  "/crm/subscriptions": Network,
  "/crm/terminations": Ban,
  "/inventory/stock": PackageCheck,
  "/inventory/transactions": ArrowLeftRight,
  "/inventory/slots": Layers3,
  "/inventory/requests": ClipboardList,
  "/inventory/returns": Undo2,
  "/inventory/devices": Router,
  "/inventory/device-recoveries": Truck,
  "/portal": HandCoins,
  "/portal/recoveries": ClipboardCheck,
  "/inventory/items": PackagePlus,
  "/inventory/warehouses": Warehouse,
  "/inventory/opname": ClipboardCheck,
  "/inventory/custody": BriefcaseBusiness,
  "/operations/work-orders": Wrench,
  "/helpdesk/tickets": Ticket,
  "/helpdesk/dispatch": Monitor,
  "/helpdesk/categories": ListChecks,
  "/billing/invoices": ReceiptText,
  "/billing/payments": CreditCard,
  "/billing/runs": CalendarClock,
  "/billing/receivables": ChartNoAxesCombined,
  "/billing/gateway": Network,
  "/billing/isolir": Ban,
  "/billing/merchants": Store,
  "/billing/profiles": Contact,
  "/billing/addons": PackagePlus,
  "/finance/transactions": WalletCards,
  "/finance/cashbooks": Wallet,
  "/finance/closings": LockKeyhole,
  "/finance/gl/journal": BookOpenCheck,
  "/finance/gl/ledger": BookCopy,
  "/finance/gl/trial-balance": Scale,
  "/finance/gl/income": ChartNoAxesCombined,
  "/finance/gl/balance": Calculator,
  "/finance/gl/accounts": Database,
  "/projects": FolderKanban,
  "/noc/incidents": Siren,
  "/noc/alarms": BellRing,
  "/noc/maintenance": CalendarClock,
  "/noc/changes": GitBranch,
  "/noc/sites": MapPinned,
  "/noc/devices": Router,
  "/noc/links": Link2,
  "/noc/ipam": Network,
  "/noc/ftth/kml": Map,
  "/noc/probe": Activity,
  "/noc/pppoe": Gauge,
  "/noc/map": MapPinned,
  "/noc/ftth": RadioTower,
  "/noc/access-jobs": ListChecks,
  "/it/tickets": Ticket,
  "/it/access": KeyRound,
  "/it/deployments": Send,
  "/it/backups": Archive,
  "/it/servers": Server,
  "/it/applications": MonitorCog,
  "/it/assets": Tag,
  "/channels/outbox": Send,
  "/channels/templates": FileText,
  "/channels/preferences": SlidersHorizontal,
  "/channels/announcements": Megaphone,
  "/hrd/my-attendance": CalendarDays,
  "/hrd/attendance": CalendarDays,
  "/hrd/requests": ClipboardList,
  "/hrd/schedule": CalendarClock,
  "/hrd/recap": ChartNoAxesCombined,
  "/hrd/employees": UsersRound,
  "/hrd/shifts": AlarmClock,
  "/approvals": ClipboardCheck,
  "/approval-rules": GitBranch,
  "/settings/users": UserRoundCog,
  "/settings/roles": ShieldCheck,
  "/settings/scheduler": AlarmClock,
  "/settings/master/divisions": Building2,
  "/settings/master/cost-centers": CircleDollarSign,
  "/settings/master/categories": Tag,
  "/settings/master/areas": MapPinned,
  "/settings/master/packages": PackagePlus,
  "/settings/integrations": Network,
  "/audit-log": ShieldEllipsis,
};

const iconByGroup: Record<string, LucideIcon> = {
  Utama: LayoutDashboard,
  Marketing: Megaphone,
  Sales: Target,
  CRM: Contact,
  Inventory: Boxes,
  Operasional: Wrench,
  Helpdesk: Headphones,
  Billing: ReceiptText,
  Finance: WalletCards,
  Akuntansi: BookOpenCheck,
  Projects: FolderKanban,
  NOC: RadioTower,
  "IT/DevOps": Server,
  "IT Support": LifeBuoy,
  "Portal Lapangan": Truck,
  "Kanal Pelanggan": Bell,
  HRD: CalendarDays,
  Approval: ClipboardCheck,
  Pengawasan: ShieldEllipsis,
  Pengaturan: Settings,
};

function routeIcon(item: NavItem, group: NavGroup) {
  return iconByRoute[item.href] ?? iconByGroup[group.title] ?? Search;
}

export function SidebarNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const closeMenu = useCrmMenu();
  const groupHasActiveRoute = (group: NavGroup) =>
    group.items.some(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
    );
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      groups
        .filter((group) => group.items.length > 0 && groupHasActiveRoute(group))
        .map((group) => [group.title, true])
    )
  );

  useEffect(() => {
    const activeGroup = groups.find(
      (group) => group.items.length > 0 && groupHasActiveRoute(group)
    );
    if (!activeGroup) return;

    setOpenGroups((current) =>
      current[activeGroup.title]
        ? current
        : { ...current, [activeGroup.title]: true }
    );
  }, [groups, pathname]);

  return (
    <nav className="crm-navigation" aria-label="Navigasi utama">
      {groups.map((group) => {
        const collapsible = group.items.length > 0;
        const expanded = Boolean(openGroups[group.title]);
        const activeGroup = groupHasActiveRoute(group);
        const groupId = `crm-nav-group-${group.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        const GroupIcon = iconByGroup[group.title] ?? Settings;

        return (
          <div key={group.title} className={`crm-nav-group ${activeGroup ? "is-active-group" : ""}`}>
            {collapsible ? (
              <button
                type="button"
                className="crm-nav-group-toggle"
                aria-label={`${expanded ? "Tutup" : "Buka"} grup ${group.title}`}
                aria-expanded={expanded}
                aria-controls={groupId}
                title={group.title}
                onClick={() =>
                  setOpenGroups((current) => ({
                    ...current,
                    [group.title]: !current[group.title],
                  }))
                }
              >
                <span className="crm-nav-group-icon">
                  <GroupIcon aria-hidden="true" />
                </span>
                <span className="crm-nav-group-label">{group.title}</span>
                <ChevronDown className="crm-nav-group-chevron" aria-hidden="true" />
              </button>
            ) : (
              <div className="crm-nav-group-title" title={group.title}>
                <span className="crm-nav-group-icon">
                  <GroupIcon aria-hidden="true" />
                </span>
                <span className="crm-nav-group-label">{group.title}</span>
              </div>
            )}
            <ul
              id={collapsible ? groupId : undefined}
              className={`crm-nav-list ${collapsible ? "is-collapsible" : ""}`}
              hidden={collapsible && !expanded}
              aria-hidden={collapsible && !expanded ? true : undefined}
            >
              {group.items.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = routeIcon(item, group);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`crm-nav-link ${active ? "is-active" : ""}`}
                      onClick={closeMenu}
                      aria-label={item.label}
                      title={item.label}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon aria-hidden="true" />
                      <span className="crm-nav-link-label">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
