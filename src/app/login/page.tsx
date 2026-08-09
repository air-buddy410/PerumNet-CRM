import { Logo } from "@/components/logo";
import { LogIn } from "lucide-react";
import { loginAction } from "./actions";

export const metadata = { title: "Login" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const sp = await searchParams;

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

          <form action={loginAction} className="crm-login-form">
            {sp.next && <input type="hidden" name="next" value={sp.next} />}
            <div>
              <label className="label" htmlFor="identifier">
                Username atau Email
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
              <input
                id="password"
                name="password"
                type="password"
                className="input"
                autoComplete="current-password"
                placeholder="Masukkan password"
                required
              />
            </div>
            <button type="submit" className="btn-primary w-full justify-center">
              Masuk
            </button>
          </form>
        </div>
        <p className="crm-login-footer">
          © 2026 PerumNet. All Rights Reserved.
        </p>
      </div>
    </main>
  );
}
