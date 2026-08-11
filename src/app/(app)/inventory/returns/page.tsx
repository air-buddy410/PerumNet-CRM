import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { PERMISSIONS, formatDateTime } from "@/lib/constants";
import { PageHeader, Badge, EmptyState, Flash } from "@/components/ui";
import { verifyReturnAction } from "./actions";

export const metadata = { title: "Pengembalian Material" };

const CONDITION_LABELS: Record<string, string> = {
  GOOD: "Baik",
  USED: "Terpakai",
  DAMAGED: "Rusak",
  RMA: "RMA",
};

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const sp = await searchParams;

  const canVerify = user.permissions.has(PERMISSIONS.STOCK_POST);
  const requests = await db.returnRequest.findMany({
    // Pemegang barang hanya melihat pengajuannya sendiri.
    where: canVerify ? {} : { requesterId: user.id },
    include: {
      requester: true,
      warehouseTo: true,
      verifiedBy: true,
      lines: { include: { item: true, device: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const pending = requests.filter((r) => r.status === "PENDING").length;

  return (
    <div>
      <PageHeader
        title="Pengembalian Material"
        subtitle={`Pengajuan oleh pemegang barang, diverifikasi admin gudang. ${pending} menunggu verifikasi.`}
        action={
          <Link href="/inventory/returns/new" className="btn-primary">
            Ajukan Pengembalian
          </Link>
        }
      />

      <Flash ok={sp.ok} error={sp.error} />

      {requests.length === 0 ? (
        <div className="card">
          <EmptyState message="Belum ada pengajuan pengembalian." />
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => (
            <div key={req.id} className="card p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono text-sm font-medium">{req.returnNumber}</span>
                  <span className="ml-2 text-xs text-slate-500">
                    {req.requester.name} → {req.warehouseTo.name} · {formatDateTime(req.createdAt)}
                  </span>
                </div>
                <Badge value={req.status} />
              </div>

              <ul className="mb-3 space-y-1 text-xs">
                {req.lines.map((line) => (
                  <li key={line.id} className="flex justify-between gap-3">
                    <span>
                      {line.item.name}
                      {line.device ? ` · ${line.device.serialNumber}` : ""}
                    </span>
                    <span className="text-slate-500">
                      {line.qty} · {CONDITION_LABELS[line.condition] ?? line.condition}
                    </span>
                  </li>
                ))}
              </ul>

              {req.note && <p className="mb-3 text-xs text-slate-500">Catatan: {req.note}</p>}
              {req.status !== "PENDING" && (
                <p className="text-xs text-slate-500">
                  {req.status === "ACCEPTED" ? "Diterima" : "Ditolak"} oleh{" "}
                  {req.verifiedBy?.name ?? "-"}
                  {req.verifyNote ? ` — ${req.verifyNote}` : ""}
                </p>
              )}

              {req.status === "PENDING" && canVerify && req.requesterId !== user.id && (
                <form action={verifyReturnAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="requestId" value={req.id} />
                  <input
                    type="text"
                    name="verifyNote"
                    placeholder="Catatan (wajib bila menolak)"
                    className="input flex-1"
                  />
                  <button type="submit" name="accept" value="yes" className="btn-primary">
                    Terima
                  </button>
                  <button type="submit" name="accept" value="no" className="btn-danger">
                    Tolak
                  </button>
                </form>
              )}
              {req.status === "PENDING" && canVerify && req.requesterId === user.id && (
                <p className="text-xs text-amber-600">
                  Anda pengajunya — verifikasi harus dilakukan orang lain.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
