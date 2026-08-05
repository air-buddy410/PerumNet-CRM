import { Logo } from "@/components/logo";
import { loginAction } from "./actions";

export const metadata = { title: "Login" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const sp = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-white to-brand-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo markClassName="h-14 w-14" textClassName="text-2xl" />
        </div>
        <div className="card p-6">
          <h1 className="mb-1 text-lg font-semibold">Masuk ke PerumNet CRM</h1>
          <p className="mb-5 text-sm text-slate-500">
            CRM &amp; Operations Management System
          </p>

          {sp.error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {sp.error}
            </div>
          )}

          <form action={loginAction} className="space-y-4">
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
                autoFocus
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
                required
              />
            </div>
            <button type="submit" className="btn-primary w-full justify-center">
              Masuk
            </button>
          </form>
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} PerumNet — Internet Service Provider
        </p>
      </div>
    </main>
  );
}
