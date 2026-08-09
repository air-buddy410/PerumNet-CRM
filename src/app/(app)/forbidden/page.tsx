import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { requireUser } from "@/lib/rbac";

export const metadata = { title: "Akses Ditolak" };

export default async function ForbiddenPage({
  searchParams,
}: {
  searchParams: Promise<{ perm?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;

  return (
    <div className="mx-auto max-w-md pt-16">
      <div className="card p-8 text-center">
        <ShieldAlert aria-hidden className="mx-auto mb-4 h-12 w-12 text-amber-500" />
        <h1 className="text-lg font-semibold">Akses Ditolak</h1>
        <p className="mt-2 text-sm text-slate-500">
          Akun Anda tidak memiliki izin untuk membuka halaman ini
          {sp.perm ? (
            <>
              {" "}
              (memerlukan permission <code className="font-mono text-xs">{sp.perm}</code>)
            </>
          ) : null}
          . Hubungi Super Admin bila Anda merasa seharusnya memiliki akses.
        </p>
        <Link href="/dashboard" className="btn-primary mt-6 inline-flex">
          Kembali ke Dashboard
        </Link>
      </div>
    </div>
  );
}
