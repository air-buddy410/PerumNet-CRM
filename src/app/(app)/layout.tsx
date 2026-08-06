import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { SidebarNav, type NavGroup } from "@/components/nav";
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
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-20 flex w-60 flex-col bg-slate-900">
        <div className="flex h-16 items-center border-b border-white/10 px-4">
          <Link href="/dashboard">
            <Logo markClassName="h-8 w-8" textClassName="text-base" />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <SidebarNav groups={groups} />
          <div className="mt-8 px-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Fase Berikutnya
            </div>
            <ul className="space-y-1 text-xs text-slate-500">
              <li>Sales &amp; CRM</li>
              <li>Inventory &amp; Operational</li>
              <li>Finance &amp; Project</li>
              <li>NOC</li>
              <li>IT/DevOps</li>
            </ul>
          </div>
        </div>
      </aside>

      <div className="ml-60 flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-6 backdrop-blur">
          <div className="text-sm text-slate-500">
            {[
              user.divisionName,
              user.roles.map((r) => r.name).join(" · ") || "Tanpa role",
            ]
              .filter(Boolean)
              .join(" — ")}
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/profile"
              className="text-sm font-medium text-slate-700 hover:text-brand-600"
            >
              {user.name}
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="btn-secondary px-3 py-1.5 text-xs">
                Keluar
              </button>
            </form>
          </div>
        </header>

        {user.mustChangePassword && (
          <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-800">
            Anda masih menggunakan password awal.{" "}
            <Link href="/profile" className="font-medium underline">
              Ganti password sekarang
            </Link>
            .
          </div>
        )}

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
