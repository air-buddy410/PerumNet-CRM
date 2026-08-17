import Link from "next/link";
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
        <p>
          Login portal pelanggan sedang menunggu penyambungan autentikasi resmi. Tidak ada form sementara yang menyimpan atau mengirim sandi.
        </p>
        <div className="customer-portal-honest-note">
          Gunakan nomor layanan dan sandi portal setelah integrasi resmi dari server tersedia.
        </div>
        <Link href="/login" className="btn-secondary customer-portal-back-link">Kembali</Link>
      </section>
    </main>
  );
}
