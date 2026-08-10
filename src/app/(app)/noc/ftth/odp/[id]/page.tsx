import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS, statusLabel } from "@/lib/constants";
import { PageHeader, Flash, BackLink, Badge } from "@/components/ui";
import { assignPortAction, releasePortAction, setPortStatusAction } from "../../actions";

export const metadata = { title: "Detail ODP" };

export default async function OdpDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.NOC_VIEW);
  const { id } = await params;
  const sp = await searchParams;

  const odp = await db.odp.findUnique({
    where: { id },
    include: {
      site: true,
      parent: true,
      children: true,
      ponPort: { include: { olt: { include: { networkDevice: true } } } },
      ports: {
        include: { subscription: { include: { customer: true } } },
        orderBy: { portNumber: "asc" },
      },
    },
  });
  if (!odp) notFound();

  const canManage = user.permissions.has(PERMISSIONS.FTTH_MANAGE);
  // Langganan yang belum menempati port mana pun.
  const freeSubs = canManage
    ? await db.subscription.findMany({
        where: { status: { notIn: ["TERMINATED"] }, odpPort: { is: null } },
        include: { customer: true },
        orderBy: { serviceNumber: "asc" },
        take: 200,
      })
    : [];

  return (
    <div className="max-w-5xl">
      <BackLink href="/noc/ftth" label="Kembali ke daftar FTTH" />
      <PageHeader
        title={`ODP ${odp.code}`}
        subtitle={`${odp.portUsed}/${odp.portCapacity} port terpakai${odp.ponPort ? ` · ${odp.ponPort.label} (${odp.ponPort.olt.networkDevice.hostname})` : ""}${odp.parent ? ` · kaskade dari ${odp.parent.code}` : ""}${odp.opticPowerDbm !== null ? ` · optic ${odp.opticPowerDbm} dBm` : ""}`}
        action={<Badge value={odp.status} label={statusLabel(odp.status)} />}
      />
      <Flash ok={sp.ok} error={sp.error} />

      {odp.children.length > 0 && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          ODP anak:{" "}
          {odp.children.map((c, i) => (
            <span key={c.id}>
              {i > 0 && ", "}
              <Link href={`/noc/ftth/odp/${c.id}`} className="font-mono text-brand-600 hover:underline">
                {c.code}
              </Link>
            </span>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="card overflow-x-auto">
          <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-medium">
            Peta Port — diketahui port nomor berapa dipakai pelanggan mana (§7)
          </h2>
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Port</th>
                <th className="th">Status</th>
                <th className="th">Langganan</th>
                <th className="th">Pelanggan</th>
                <th className="th">Catatan</th>
                {canManage && <th className="th"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {odp.ports.map((p) => (
                <tr key={p.id} className={p.status === "DAMAGED" ? "bg-red-50/40" : "hover:bg-slate-50"}>
                  <td className="td whitespace-nowrap font-mono text-xs font-medium">#{p.portNumber}</td>
                  <td className="td"><Badge value={p.status} label={statusLabel(p.status)} /></td>
                  <td className="td whitespace-nowrap font-mono text-xs">
                    {p.subscription?.serviceNumber ?? "-"}
                  </td>
                  <td className="td whitespace-nowrap text-xs">{p.subscription?.customer.name ?? "-"}</td>
                  <td className="td max-w-40 text-xs">
                    <span className="block truncate">{p.note ?? "-"}</span>
                  </td>
                  {canManage && (
                    <td className="td whitespace-nowrap text-right text-xs">
                      {p.subscriptionId ? (
                        <form action={releasePortAction} className="inline">
                          <input type="hidden" name="odpPortId" value={p.id} />
                          <input type="hidden" name="odpId" value={odp.id} />
                          <button type="submit" className="text-red-600 hover:underline">Lepas</button>
                        </form>
                      ) : (
                        <form action={setPortStatusAction} className="inline-flex items-center gap-1">
                          <input type="hidden" name="odpPortId" value={p.id} />
                          <input type="hidden" name="odpId" value={odp.id} />
                          <select name="status" className="input px-1 py-0.5 text-xs" defaultValue={p.status}>
                            <option value="FREE">Kosong</option>
                            <option value="RESERVED">Dicadangkan</option>
                            <option value="DAMAGED">Rusak</option>
                          </select>
                          <input name="note" className="input w-24 px-1 py-0.5 text-xs" placeholder="ket." />
                          <button type="submit" className="text-brand-600 hover:underline">Set</button>
                        </form>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canManage && (
          <div className="card h-fit p-5">
            <h2 className="mb-1 font-medium">Alokasi Port</h2>
            <p className="mb-3 text-xs text-slate-500">
              Satu langganan menempati satu port. portUsed direkap otomatis.
            </p>
            <form action={assignPortAction} className="space-y-3">
              <input type="hidden" name="odpId" value={odp.id} />
              <div>
                <label className="label" htmlFor="odpPortId">Port Kosong</label>
                <select id="odpPortId" name="odpPortId" className="input" required defaultValue="">
                  <option value="" disabled>— pilih port —</option>
                  {odp.ports.filter((p) => p.status === "FREE" || p.status === "RESERVED").map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.portNumber}{p.status === "RESERVED" ? " (dicadangkan)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="subscriptionId">Langganan</label>
                <select id="subscriptionId" name="subscriptionId" className="input" required defaultValue="">
                  <option value="" disabled>— pilih —</option>
                  {freeSubs.map((s) => (
                    <option key={s.id} value={s.id}>{s.serviceNumber} · {s.customer.name}</option>
                  ))}
                </select>
              </div>
              <input name="note" className="input" placeholder="Catatan (opsional)" />
              <button type="submit" className="btn-primary w-full justify-center">Alokasikan</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
