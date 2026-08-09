import { redirect } from "next/navigation";
import { SidebarNav, type NavGroup } from "@/components/nav";
import CrmAppShell from "@/components/app-shell";
import { LogOut } from "lucide-react";
import { requireUser } from "@/lib/rbac";
import { logout } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/constants";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();
  const can = (p: string) => user.permissions.has(p);

  const groups: NavGroup[] = [];

  if (can(PERMISSIONS.DASHBOARD_VIEW)) {
    groups.push({
      title: "Utama",
      items: [{ href: "/dashboard", label: "Dashboard" }],
    });
  }

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
      ],
    });
  }

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
