import { CustomerPortalLoginForm } from "@/components/customer-portal-login-form";
import { Logo } from "@/components/logo";

export const metadata = { title: "Portal Pelanggan" };

export default function CustomerPortalLoginPage() {
  return (
    <main className="customer-portal-shell customer-portal-shell-centered">
      <section className="customer-portal-empty-card customer-portal-login-card">
        <div className="customer-portal-brand customer-portal-brand-static">
          <Logo markClassName="h-10 w-9" textClassName="text-[21px]" />
          <span>PORTAL PELANGGAN</span>
        </div>
        <span className="customer-portal-eyebrow">Akses pelanggan</span>
        <h1>Masuk ke layanan Anda</h1>
        <p>Masuk menggunakan nomor layanan dan kata sandi portal yang diberikan oleh PerumNet.</p>
        <CustomerPortalLoginForm />
      </section>
    </main>
  );
}
