import Link from "next/link";
import { ArrowLeft, MailQuestion } from "lucide-react";
import { Logo } from "@/components/logo";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export const metadata = { title: "Lupa password" };

export default function ForgotPasswordPage() {
  return (
    <main className="crm-login-page">
      <div className="crm-login-wrap">
        <div className="crm-login-brand">
          <Logo markClassName="h-12 w-10" textClassName="text-[22px]" />
          <span>CRM &amp; OPERATIONS</span>
        </div>
        <section className="crm-login-card" aria-labelledby="forgot-password-title">
          <div className="crm-login-icon"><MailQuestion aria-hidden="true" /></div>
          <h1 id="forgot-password-title">Permintaan reset password</h1>
          <p>
            Masukkan alamat email akun. Permintaan akan diteruskan ke tim IT untuk
            verifikasi dan pemulihan akses.
          </p>
          <ForgotPasswordForm />
          <Link href="/login" className="btn-secondary crm-login-back-link">
            <ArrowLeft aria-hidden="true" />
            Kembali ke login
          </Link>
        </section>
        <p className="crm-login-footer">
          © 2026 PerumNet. All Rights Reserved.
        </p>
      </div>
    </main>
  );
}
