import { Logo } from "@/components/logo";
import { PasswordVisibilityInput } from "@/components/password-visibility-input";
import { LogIn } from "lucide-react";
import Link from "next/link";
import { loginAction } from "./actions";
import { oidcBlocker } from "@/lib/oidc";

export const metadata = { title: "Login" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const oidcAvailable = oidcBlocker() === null;

  return (
    <main className="crm-login-page">
      <div className="crm-login-wrap">
        <div className="crm-login-brand">
          <Logo markClassName="h-12 w-10" textClassName="text-[22px]" />
          <span>CRM &amp; OPERATIONS</span>
        </div>
        <div className="crm-login-card">
          <div className="crm-login-icon"><LogIn aria-hidden="true" /></div>
          <h1>Masuk ke PerumNet CRM</h1>
          <p>
            CRM &amp; Operations Management System
          </p>

          {sp.error && (
            <div className="crm-flash is-error">
              {sp.error}
            </div>
          )}

          {/* Fase 45 — jalur utama saat identitas terpusat aktif.
              Form password TETAP ditampilkan di bawahnya, bukan disembunyikan:
              itulah jalur akun darurat, dan menyembunyikannya berarti tidak ada
              yang bisa masuk saat penyedia identitas mati. */}
          {oidcAvailable && (
            <>
              <a href="/api/auth/oidc/start" className="btn-primary w-full justify-center">
                Masuk dengan Akun PerumNet
              </a>
              <p className="mt-3 text-center text-xs text-slate-500">
                Password di bawah hanya untuk akun darurat.
              </p>
            </>
          )}

          <form action={loginAction} className="crm-login-form">
            {sp.next && <input type="hidden" name="next" value={sp.next} />}
            <div>
              <label className="label" htmlFor="identifier">
                Email atau Username
              </label>
              <input
                id="identifier"
                name="identifier"
                className="input"
                autoComplete="username"
                inputMode="email"
                autoFocus
                placeholder="nama@email.com"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <PasswordVisibilityInput
                id="password"
                name="password"
                autoComplete="current-password"
                placeholder="Masukkan password"
                required
              />
            </div>
            <button type="submit" className="btn-primary w-full justify-center">
              Masuk
            </button>
          </form>
          <Link href="/login/forgot-password" className="crm-login-reset-link">
            Lupa password?
          </Link>
        </div>
        <p className="crm-login-footer">
          © 2026 PerumNet. All Rights Reserved.
        </p>
      </div>
    </main>
  );
}
