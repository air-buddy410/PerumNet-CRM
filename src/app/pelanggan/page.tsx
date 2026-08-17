import { redirect } from "next/navigation";
import { pelangganSekarang, loadBerandaPortal } from "@/lib/portal-service";
import { CustomerPortalHome, CustomerPortalUnavailable } from "@/components/customer-portal-home";

export const metadata = { title: "Portal Pelanggan" };
export const dynamic = "force-dynamic";

export default async function CustomerPortalPage() {
  let account: Awaited<ReturnType<typeof pelangganSekarang>>;
  try {
    account = await pelangganSekarang();
  } catch {
    return <CustomerPortalUnavailable message="Layanan portal sedang disiapkan. Silakan coba lagi setelah konfigurasi keamanan selesai." />;
  }

  if (!account) redirect("/pelanggan/login");

  try {
    const data = await loadBerandaPortal(account.customerId);
    if (!data) {
      return <CustomerPortalUnavailable message="Data layanan pelanggan belum tersedia. Hubungi PerumNet untuk mendapatkan bantuan." />;
    }
    return <CustomerPortalHome data={data} />;
  } catch {
    return <CustomerPortalUnavailable message="Informasi layanan belum dapat dimuat. Silakan coba lagi beberapa saat lagi." />;
  }
}
