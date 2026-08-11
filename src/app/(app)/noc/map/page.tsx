import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PERMISSIONS } from "@/lib/constants";
import { PageHeader, EmptyState } from "@/components/ui";
import {
  loadNetworkMap,
  projector,
  OCCUPANCY_COLOR,
  OCCUPANCY_LABEL,
  SUBSCRIPTION_COLOR,
  type OccupancyLevel,
} from "@/lib/noc-map";

export const metadata = { title: "Peta Jaringan" };

const WIDTH = 1000;
const HEIGHT = 620;

const OCCUPANCY_FILTERS: { value: OccupancyLevel | ""; label: string }[] = [
  { value: "", label: "Semua okupansi" },
  { value: "MODERATE", label: "≥ 50% terpakai" },
  { value: "TIGHT", label: "≥ 80% terpakai" },
  { value: "FULL", label: "Penuh" },
];

const STATUS_FILTERS = ["", "ACTIVE", "ISOLATED", "SUSPENDED"] as const;

// Fase 23 (PRD-NOC-TOOLS N1) — peta ODP + pelanggan dalam satu tampilan.
// Digambar sebagai SVG, tanpa pustaka peta dan tanpa server ubin eksternal,
// sehingga tetap jalan di jaringan tertutup. Basemap sungguhan bisa dipasang
// belakangan tanpa mengubah lapisan data (lib/noc-map.ts).
export default async function NetworkMapPage({
  searchParams,
}: {
  searchParams: Promise<{
    site?: string;
    olt?: string;
    occ?: string;
    status?: string;
    odp?: string;
  }>;
}) {
  await requirePermission(PERMISSIONS.NOC_MAP_VIEW);
  const sp = await searchParams;

  const [data, sites, olts] = await Promise.all([
    loadNetworkMap({
      siteId: sp.site || null,
      oltId: sp.olt || null,
      minOccupancy: (sp.occ as OccupancyLevel) || null,
      subscriptionStatus: sp.status || null,
    }),
    db.networkSite.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.oltDevice.findMany({
      select: { id: true, networkDevice: { select: { hostname: true } } },
    }),
  ]);

  const selected = sp.odp ? data.odps.find((o) => o.id === sp.odp) ?? null : null;
  const selectedPorts = selected
    ? await db.odpPort.findMany({
        where: { odpId: selected.id },
        orderBy: { portNumber: "asc" },
        include: {
          subscription: {
            select: { serviceNumber: true, status: true, customer: { select: { name: true } } },
          },
        },
      })
    : [];

  const project = data.bounds ? projector(data.bounds, WIDTH, HEIGHT) : null;
  const totalPorts = data.odps.reduce((s, o) => s + o.capacity, 0);
  const usedPorts = data.odps.reduce((s, o) => s + o.used, 0);

  const keep = (extra: Record<string, string>) => {
    const params = new URLSearchParams();
    if (sp.site) params.set("site", sp.site);
    if (sp.olt) params.set("olt", sp.olt);
    if (sp.occ) params.set("occ", sp.occ);
    if (sp.status) params.set("status", sp.status);
    for (const [k, v] of Object.entries(extra)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    const q = params.toString();
    return q ? `/noc/map?${q}` : "/noc/map";
  };

  return (
    <div>
      <PageHeader
        title="Peta Jaringan"
        subtitle={`${data.odps.length} ODP · ${data.customers.length} pelanggan terpetakan · ${usedPorts}/${totalPorts} port terpakai${
          data.missingCoordinates.odps > 0
            ? ` · ${data.missingCoordinates.odps} ODP tanpa koordinat`
            : ""
        }`}
      />

      <form method="get" className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label" htmlFor="site">Site</label>
          <select id="site" name="site" defaultValue={sp.site ?? ""} className="input">
            <option value="">Semua site</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="olt">OLT</label>
          <select id="olt" name="olt" defaultValue={sp.olt ?? ""} className="input">
            <option value="">Semua OLT</option>
            {olts.map((o) => (
              <option key={o.id} value={o.id}>{o.networkDevice.hostname}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="occ">Okupansi ODP</label>
          <select id="occ" name="occ" defaultValue={sp.occ ?? ""} className="input">
            {OCCUPANCY_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="status">Status pelanggan</label>
          <select id="status" name="status" defaultValue={sp.status ?? ""} className="input">
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>{s || "Semua status"}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-primary">Terapkan</button>
        <Link href="/noc/map" className="btn-secondary">Reset</Link>
      </form>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="card overflow-x-auto p-3">
          {!project || data.odps.length === 0 ? (
            <EmptyState message="Belum ada ODP berkoordinat untuk digambar. Isi koordinat ODP di modul FTTH." />
          ) : (
            <svg
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              className="h-auto w-full"
              role="img"
              aria-label="Peta sebaran ODP dan pelanggan"
            >
              {/* Kaskade ODP → ODP induk */}
              {data.cascades.map((c) => {
                const from = data.odps.find((o) => o.id === c.fromId)!;
                const to = data.odps.find((o) => o.id === c.toId)!;
                const a = project(from.latitude, from.longitude);
                const b = project(to.latitude, to.longitude);
                return (
                  <line
                    key={`${c.fromId}-${c.toId}`}
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 3"
                  />
                );
              })}

              {/* Garis pelanggan → ODP tempat port-nya berada */}
              {data.customers.map((c) => {
                const odp = data.odps.find((o) => o.id === c.odpId);
                if (!odp) return null;
                const a = project(c.latitude, c.longitude);
                const b = project(odp.latitude, odp.longitude);
                return (
                  <line
                    key={`link-${c.subscriptionId}`}
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke="#cbd5e1" strokeWidth={0.75}
                  />
                );
              })}

              {/* Pelanggan */}
              {data.customers.map((c) => {
                const p = project(c.latitude, c.longitude);
                return (
                  <circle
                    key={c.subscriptionId}
                    cx={p.x} cy={p.y} r={3}
                    fill={SUBSCRIPTION_COLOR[c.status] ?? "#94a3b8"}
                    opacity={0.85}
                  >
                    <title>{`${c.customerName} · ${c.serviceNumber} · ${c.status}${
                      c.portNumber ? ` · port ${c.portNumber}` : ""
                    }`}</title>
                  </circle>
                );
              })}

              {/* ODP — diwarnai menurut okupansi port */}
              {data.odps.map((o) => {
                const p = project(o.latitude, o.longitude);
                const isSelected = selected?.id === o.id;
                return (
                  <Link key={o.id} href={keep({ odp: isSelected ? "" : o.id })}>
                    <g>
                      <rect
                        x={p.x - 7} y={p.y - 7} width={14} height={14} rx={3}
                        fill={OCCUPANCY_COLOR[o.occupancy]}
                        stroke={isSelected ? "#0f172a" : "#ffffff"}
                        strokeWidth={isSelected ? 3 : 1.5}
                      />
                      <title>{`${o.code} · ${o.used}/${o.capacity} port · ${OCCUPANCY_LABEL[o.occupancy]}`}</title>
                    </g>
                  </Link>
                );
              })}
            </svg>
          )}

          <div className="mt-3 flex flex-wrap gap-4 px-2 text-xs text-slate-500">
            {(Object.keys(OCCUPANCY_COLOR) as OccupancyLevel[]).map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ backgroundColor: OCCUPANCY_COLOR[k] }}
                />
                ODP {OCCUPANCY_LABEL[k].toLowerCase()}
              </span>
            ))}
            {["ACTIVE", "ISOLATED"].map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: SUBSCRIPTION_COLOR[s] }}
                />
                Pelanggan {s.toLowerCase()}
              </span>
            ))}
          </div>
        </div>

        <div className="card p-5">
          {selected ? (
            <>
              <h2 className="mb-1 text-sm font-medium">{selected.code}</h2>
              <p className="mb-3 text-xs text-slate-500">
                {selected.siteName ?? "tanpa site"}
                {selected.ponLabel ? ` · PON ${selected.ponLabel}` : ""} ·{" "}
                {selected.used}/{selected.capacity} port ·{" "}
                {OCCUPANCY_LABEL[selected.occupancy]}
                {selected.opticPowerDbm !== null ? ` · ${selected.opticPowerDbm} dBm` : ""}
              </p>
              <h3 className="mb-2 text-xs font-medium text-slate-500">Denah Port</h3>
              <ul className="space-y-1 text-xs">
                {selectedPorts.map((port) => (
                  <li key={port.id} className="flex justify-between gap-2">
                    <span className="font-mono">#{String(port.portNumber).padStart(2, "0")}</span>
                    <span className="flex-1 truncate">
                      {port.subscription
                        ? `${port.subscription.customer.name} (${port.subscription.serviceNumber})`
                        : "—"}
                    </span>
                    <span className="text-slate-400">{port.status}</span>
                  </li>
                ))}
              </ul>
              <Link href={`/noc/ftth/odp/${selected.id}`} className="btn-secondary mt-4 w-full justify-center">
                Buka Detail ODP
              </Link>
            </>
          ) : (
            <p className="text-xs text-slate-500">
              Klik salah satu kotak ODP di peta untuk melihat denah portnya — siapa
              menempati port nomor berapa.
            </p>
          )}

          {data.missingCoordinates.customers > 0 && (
            <p className="mt-4 text-xs text-amber-600">
              {data.missingCoordinates.customers} pelanggan tidak punya koordinat
              sendiri dan digambar di titik ODP-nya.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
