import { redirect } from "next/navigation";
import { SidebarNav, type NavGroup } from "@/components/nav";
import CrmAppShell from "@/components/app-shell";
import { LogOut } from "lucide-react";
import { requireUser } from "@/lib/rbac";
import { logout } from "@/lib/auth";
import { unreadCount } from "@/lib/notify";
import { PERMISSIONS } from "@/lib/constants";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();
  const can = (p: string) => user.permissions.has(p);
  const unread = await unreadCount(user.id);

  const groups: NavGroup[] = [];

  const utamaItems = [];
  if (can(PERMISSIONS.DASHBOARD_VIEW))
    utamaItems.push({ href: "/dashboard", label: "Dashboard" });
  utamaItems.push({
    href: "/notifications",
    label: unread > 0 ? `Notifikasi (${unread > 9 ? "9+" : unread})` : "Notifikasi",
  });
  if (can(PERMISSIONS.OUTAGES_VIEW))
    utamaItems.push({ href: "/outages", label: "Status Gangguan" });
  groups.push({ title: "Utama", items: utamaItems });

  if (can(PERMISSIONS.CAMPAIGNS_VIEW)) {
    groups.push({
      title: "Marketing",
      items: [{ href: "/marketing/campaigns", label: "Campaigns" }],
    });
  }

  const salesItems = [];
  if (can(PERMISSIONS.LEADS_VIEW))
    salesItems.push({ href: "/sales/leads", label: "Leads" });
  if (can(PERMISSIONS.OPPORTUNITIES_VIEW))
    salesItems.push({ href: "/sales/pipeline", label: "Pipeline" });
  if (can(PERMISSIONS.SURVEYS_VIEW))
    salesItems.push({ href: "/sales/surveys", label: "Surveys" });
  if (can(PERMISSIONS.QUOTATIONS_VIEW))
    salesItems.push({ href: "/sales/quotations", label: "Quotations" });
  if (salesItems.length) groups.push({ title: "Sales", items: salesItems });

  const crmItems = [];
  if (can(PERMISSIONS.CUSTOMERS_VIEW))
    crmItems.push({ href: "/crm/customers", label: "Customers" });
  if (can(PERMISSIONS.SUBSCRIPTIONS_VIEW))
    crmItems.push({ href: "/crm/subscriptions", label: "Subscriptions" });
  if (crmItems.length) groups.push({ title: "CRM", items: crmItems });

  const inventoryItems = [];
  if (can(PERMISSIONS.INVENTORY_VIEW)) {
    inventoryItems.push(
      { href: "/inventory/stock", label: "Posisi Stock" },
      { href: "/inventory/transactions", label: "Transaksi Stock" },
      { href: "/inventory/devices", label: "Perangkat" },
      { href: "/inventory/items", label: "Item Master" },
      { href: "/inventory/warehouses", label: "Gudang" },
      { href: "/inventory/opname", label: "Stock Opname" }
    );
  }
  if (can(PERMISSIONS.CUSTODY_VIEW))
    inventoryItems.push({ href: "/inventory/custody", label: "Custody Teknisi" });
  if (inventoryItems.length)
    groups.push({ title: "Inventory", items: inventoryItems });

  if (can(PERMISSIONS.WORK_ORDERS_VIEW)) {
    groups.push({
      title: "Operasional",
      items: [{ href: "/operations/work-orders", label: "Work Orders" }],
    });
  }

  if (can(PERMISSIONS.CTICKETS_VIEW)) {
    groups.push({
      title: "Helpdesk",
      items: [
        { href: "/helpdesk/tickets", label: "Tiket Pelanggan" },
        { href: "/helpdesk/dispatch", label: "Dispatch Board" },
        { href: "/helpdesk/categories", label: "Kategori & Workflow" },
      ],
    });
  }

  if (can(PERMISSIONS.BILLING_VIEW)) {
    groups.push({
      title: "Billing",
      items: [
        { href: "/billing/invoices", label: "Invoices" },
        { href: "/billing/payments", label: "Payments" },
        { href: "/billing/runs", label: "Invoice Runs" },
        { href: "/billing/receivables", label: "Aging Piutang" },
        { href: "/billing/gateway", label: "Gateway Bundles" },
        { href: "/billing/isolir", label: "Isolir & Dunning" },
        { href: "/billing/merchants", label: "Merchants" },
        { href: "/billing/profiles", label: "Billing Profiles" },
        { href: "/billing/addons", label: "Addon Services" },
      ],
    });
  }

  const financeItems = [];
  if (can(PERMISSIONS.CASH_CREATE) || can(PERMISSIONS.FINANCE_VIEW))
    financeItems.push({ href: "/finance/transactions", label: "Transaksi Kas" });
  if (can(PERMISSIONS.FINANCE_VIEW)) {
    financeItems.push(
      { href: "/finance/cashbooks", label: "Cashbooks" },
      { href: "/finance/closings", label: "Closing Kas" }
    );
  }
  if (financeItems.length) groups.push({ title: "Finance", items: financeItems });

  if (can(PERMISSIONS.GL_VIEW)) {
    groups.push({
      title: "Akuntansi",
      items: [
        { href: "/finance/gl/journal", label: "Jurnal Umum" },
        { href: "/finance/gl/ledger", label: "Buku Besar" },
        { href: "/finance/gl/trial-balance", label: "Neraca Saldo" },
        { href: "/finance/gl/income", label: "Laba Rugi" },
        { href: "/finance/gl/balance", label: "Neraca" },
        { href: "/finance/gl/accounts", label: "Chart of Accounts" },
      ],
    });
  }

  if (can(PERMISSIONS.PROJECTS_VIEW)) {
    groups.push({
      title: "Projects",
      items: [{ href: "/projects", label: "Daftar Proyek" }],
    });
  }

  if (can(PERMISSIONS.NOC_VIEW)) {
    groups.push({
      title: "NOC",
      items: [
        { href: "/noc/incidents", label: "Incidents" },
        { href: "/noc/alarms", label: "Alarms" },
        { href: "/noc/maintenance", label: "Maintenance" },
        { href: "/noc/changes", label: "Changes" },
        { href: "/noc/sites", label: "Sites" },
        { href: "/noc/devices", label: "Perangkat Jaringan" },
        { href: "/noc/links", label: "Links" },
        { href: "/noc/ipam", label: "IPAM" },
        { href: "/noc/probe", label: "Network Monitor" },
      { href: "/noc/pppoe", label: "Monitor PPPoE" },
      { href: "/noc/map", label: "Peta Jaringan" },
      { href: "/noc/ftth", label: "FTTH (OLT/ODP)" },
        { href: "/noc/access-jobs", label: "Antrian Router" },
      ],
    });
  }

  if (can(PERMISSIONS.IT_VIEW)) {
    groups.push({
      title: "IT/DevOps",
      items: [
        { href: "/it/tickets", label: "IT Tickets" },
        { href: "/it/access", label: "Access" },
        { href: "/it/deployments", label: "Deployments" },
        { href: "/it/backups", label: "Backup & DR" },
        { href: "/it/servers", label: "Servers" },
        { href: "/it/applications", label: "Applications" },
        { href: "/it/assets", label: "Domain & License" },
      ],
    });
  } else {
    // Service desk terbuka untuk seluruh staff (PRD §39–40).
    const supportItems = [];
    if (can(PERMISSIONS.IT_TICKETS_CREATE))
      supportItems.push({ href: "/it/tickets", label: "IT Tickets" });
    if (can(PERMISSIONS.ACCESS_REQUEST))
      supportItems.push({ href: "/it/access", label: "Akses Sistem" });
    if (supportItems.length)
      groups.push({ title: "IT Support", items: supportItems });
  }

  if (can(PERMISSIONS.CHANNELS_VIEW)) {
    groups.push({
      title: "Kanal Pelanggan",
      items: [
        { href: "/channels/outbox", label: "Antrian Pesan" },
        { href: "/channels/templates", label: "Template Pesan" },
        { href: "/channels/preferences", label: "Preferensi Notifikasi" },
        { href: "/channels/announcements", label: "Pengumuman & Promo" },
      ],
    });
  }

  const hrdItems = [];
  if (can(PERMISSIONS.ATTENDANCE_SELF))
    hrdItems.push({ href: "/hrd/my-attendance", label: "Absensi Saya" });
  if (can(PERMISSIONS.HRD_VIEW)) {
    hrdItems.push(
      { href: "/hrd/attendance", label: "Absensi Harian" },
      { href: "/hrd/requests", label: "Izin & Lembur" },
      { href: "/hrd/schedule", label: "Jadwal Shift" },
      { href: "/hrd/recap", label: "Rekap Bulanan" },
      { href: "/hrd/employees", label: "Karyawan" },
      { href: "/hrd/shifts", label: "Shift & Lokasi" }
    );
  }
  if (hrdItems.length) groups.push({ title: "HRD", items: hrdItems });

  const approvalItems = [];
  if (can(PERMISSIONS.APPROVALS_VIEW))
    approvalItems.push({ href: "/approvals", label: "Approval Request" });
  if (can(PERMISSIONS.APPROVALS_CONFIGURE))
    approvalItems.push({ href: "/approval-rules", label: "Approval Matrix" });
  if (approvalItems.length)
    groups.push({ title: "Approval", items: approvalItems });

  const settingItems = [];
  if (can(PERMISSIONS.USERS_VIEW))
    settingItems.push({ href: "/settings/users", label: "Users" });
  if (can(PERMISSIONS.ROLES_VIEW))
    settingItems.push({ href: "/settings/roles", label: "Roles & Permissions" });
  if (can(PERMISSIONS.MASTER_DATA_VIEW)) {
    settingItems.push(
      { href: "/settings/master/divisions", label: "Divisi" },
      { href: "/settings/master/cost-centers", label: "Cost Centers" },
      { href: "/settings/master/categories", label: "Kategori" },
      { href: "/settings/master/areas", label: "Area" },
      { href: "/settings/master/packages", label: "Paket Internet" }
    );
  }
  if (can(PERMISSIONS.INTEGRATIONS_MANAGE))
    settingItems.push({ href: "/settings/integrations", label: "Integrasi" });
  if (settingItems.length)
    groups.push({ title: "Pengaturan", items: settingItems });

  if (can(PERMISSIONS.AUDIT_LOG_VIEW)) {
    groups.push({
      title: "Pengawasan",
      items: [{ href: "/audit-log", label: "Audit Log" }],
    });
  }

  async function logoutAction() {
    "use server";
    await logout();
    redirect("/login");
  }

  return (
    <CrmAppShell
      groups={groups}
      navigation={<SidebarNav groups={groups} />}
      user={{ name: user.name, email: user.email }}
      mustChangePassword={user.mustChangePassword}
      profileMenuAction={
        <form action={logoutAction}>
          <button type="submit" role="menuitem" className="crm-signout-button">
            <LogOut aria-hidden="true" />
            Keluar
          </button>
        </form>
      }
    >
      {children}
    </CrmAppShell>
  );
}
