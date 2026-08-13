import Link from "next/link";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { BackLink, PageHeader } from "@/components/ui";
import { MailboxAccountWorkbench } from "@/components/mailbox-account-workbench";

export const metadata = { title: "Akun CRM dari Mailbox" };

export default async function MailboxAccountsPage() {
  await requirePermission(PERMISSIONS.USERS_CREATE);

  return (
    <div className="crm-page max-w-7xl">
      <BackLink href="/it/mailserver" label="Kembali ke pengaturan mailserver" />
      <PageHeader
        title="Akun CRM dari Mailbox"
        subtitle="Tinjau mailbox yang belum memiliki akun CRM, lalu pilih aksesnya secara eksplisit."
        action={<Link href="/it/mailserver" className="btn-secondary">Pengaturan mailserver</Link>}
      />
      <MailboxAccountWorkbench />
    </div>
  );
}
