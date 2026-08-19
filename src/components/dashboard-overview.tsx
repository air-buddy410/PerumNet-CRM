import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Clock3,
  MapPin,
  Radio,
  Server,
  UsersRound,
  Wifi,
} from "lucide-react";
import type {
  MetrikDivisi,
  RingkasanDashboard,
} from "@/lib/dashboard-service";
import { formatUiDateTime } from "@/components/ui-formatters";

type DashboardOverviewProps = {
  summary: RingkasanDashboard;
  canOpenNoc: boolean;
};

const formatNumber = (value: number) => value.toLocaleString("id-ID");

const metricFor = (
  summary: RingkasanDashboard,
  divisionCode: string,
  label: string,
): MetrikDivisi | undefined =>
  summary.divisi.find((division) => division.kode === divisionCode)?.metrik.find(
    (metric) => metric.label === label,
  );

const toneClass = (metric?: MetrikDivisi) =>
  `is-${metric?.nada ?? "netral"}`;

const fractionLabel = (metric: MetrikDivisi) => {
  if (metric.dari === undefined) return metric.satuan ?? "";

  const fraction = `${formatNumber(metric.nilai)} / ${formatNumber(metric.dari)}`;
  if (metric.dari <= 0) return fraction;

  return `${fraction} · ${Math.round((metric.nilai / metric.dari) * 100)}%`;
};

const stateLabel = {
  BERISI: "Berisi",
  "SENGAJA-KOSONG": "Sengaja kosong",
  "BELUM-DIPAKAI": "Belum dipakai",
} as const;

const stateClass = {
  BERISI: "is-filled",
  "SENGAJA-KOSONG": "is-intentionally-empty",
  "BELUM-DIPAKAI": "is-muted",
} as const;

function DashboardNoc({ summary, canOpenNoc }: DashboardOverviewProps) {
  const { noc } = summary;
  const sessionMetric = metricFor(summary, "NOC", "Sesi PPPoE online");
  const alarmMetric = metricFor(summary, "NOC", "Alarm terbuka");
  const probeMetric = metricFor(summary, "NOC", "Probe DOWN");
  const isolatedMetric = metricFor(summary, "OAC", "Terisolir");
  const ageMs = noc.penarikanTerakhir
    ? Math.max(0, summary.sekarang.getTime() - noc.penarikanTerakhir.getTime())
    : null;
  const isStale = ageMs === null || ageMs > 5 * 60 * 1000;
  const freshness = noc.penarikanTerakhir
    ? `Terakhir berhasil ${formatUiDateTime(noc.penarikanTerakhir)}`
    : "Belum ada penarikan PPPoE yang berhasil";

  const cards = [
    {
      label: "Sesi PPPoE online",
      value: formatNumber(noc.sesiOnline),
      detail: `${formatNumber(noc.sesiOnline)} / ${formatNumber(noc.sesiTotal)} total · ${formatNumber(noc.sesiYatim)} belum cocok`,
      icon: Wifi,
      tone: toneClass(sessionMetric),
    },
    {
      label: "Alarm terbuka",
      value: formatNumber(noc.alarmTerbuka),
      detail: `${formatNumber(noc.alarmKritis)} kritis`,
      icon: AlertTriangle,
      tone: toneClass(alarmMetric),
    },
    {
      label: "Probe DOWN",
      value: formatNumber(noc.probeDown),
      detail: `${formatNumber(noc.probeDown)} / ${formatNumber(noc.probeAktif)} probe aktif`,
      icon: Radio,
      tone: toneClass(probeMetric),
    },
    {
      label: "Langganan terisolir",
      value: formatNumber(noc.langgananIsolir),
      detail: `${formatNumber(noc.langgananAktif)} langganan aktif`,
      icon: Activity,
      tone: toneClass(isolatedMetric),
    },
  ];

  return (
    <section className="crm-dashboard-noc crm-panel" aria-labelledby="dashboard-noc-title">
      <div className="crm-dashboard-noc-heading">
        <div>
          <span className="crm-dashboard-kicker">
            <span className="crm-dashboard-live-dot" aria-hidden="true" />
            NOC / snapshot operasional
          </span>
          <h2 id="dashboard-noc-title">Kondisi jaringan sekarang</h2>
          <p>Angka operasional diambil dari satu snapshot backend agar konteksnya tetap konsisten.</p>
        </div>
        {canOpenNoc ? (
          <Link href="/noc/map" className="crm-dashboard-noc-link">
            Buka peta NOC <ArrowUpRight aria-hidden="true" />
          </Link>
        ) : null}
      </div>

      <div className="crm-dashboard-noc-grid" aria-label="Sorotan NOC">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className={`crm-dashboard-noc-metric ${card.tone}`}>
              <span className="crm-dashboard-noc-metric-icon" aria-hidden="true">
                <Icon />
              </span>
              <span className="crm-dashboard-noc-metric-copy">
                <span className="crm-dashboard-noc-metric-label">{card.label}</span>
                <strong className="crm-dashboard-noc-metric-value">{card.value}</strong>
                <span className="crm-dashboard-noc-metric-detail">{card.detail}</span>
              </span>
            </div>
          );
        })}
      </div>

      <div className="crm-dashboard-noc-meta">
        <span>
          <Server aria-hidden="true" />
          {formatNumber(noc.perangkat)} perangkat · {formatNumber(noc.perangkatTidakAktif)} tidak aktif
        </span>
        <span>
          <MapPin aria-hidden="true" />
          ODP berkoordinat {formatNumber(noc.odpBerkoordinat)} / {formatNumber(noc.odpTotal)}
        </span>
        <span className={isStale ? "crm-dashboard-noc-freshness is-stale" : "crm-dashboard-noc-freshness"}>
          <Clock3 aria-hidden="true" />
          {freshness}
          {isStale ? " · Perlu diperiksa" : ""}
        </span>
      </div>
    </section>
  );
}

function DashboardDivisions({ summary }: { summary: RingkasanDashboard }) {
  return (
    <section className="crm-dashboard-divisions" aria-labelledby="dashboard-divisions-title">
      <div className="crm-dashboard-section-heading">
        <div>
          <span className="crm-dashboard-kicker">CRM / seluruh divisi</span>
          <h2 id="dashboard-divisions-title">Modul dan keadaan data</h2>
          <p>Setiap divisi tetap ditampilkan, termasuk modul yang sengaja kosong atau belum dipakai.</p>
        </div>
        <span className="crm-dashboard-snapshot-label">
          Snapshot {formatUiDateTime(summary.sekarang)}
        </span>
      </div>

      <div className="crm-dashboard-division-grid">
        {summary.divisi.map((division) => (
          <article
            key={division.kode}
            className={`crm-dashboard-division-card ${stateClass[division.keadaan]}`}
          >
            <div className="crm-dashboard-division-header">
              <div>
                <span className="crm-dashboard-division-code">DIV {division.kode}</span>
                <h3>{division.nama}</h3>
              </div>
              <span className={`crm-dashboard-division-state ${stateClass[division.keadaan]}`}>
                {stateLabel[division.keadaan]}
              </span>
            </div>

            <div className="crm-dashboard-division-people">
              <UsersRound aria-hidden="true" />
              {formatNumber(division.pegawai)} pegawai
            </div>
            <p className="crm-dashboard-division-note">{division.catatan}</p>

            {division.metrik.length > 0 ? (
              <ul className="crm-dashboard-division-metrics">
                {division.metrik.map((metric) => {
                  const body = (
                    <>
                      <span className="crm-dashboard-division-metric-label">{metric.label}</span>
                      <span className={`crm-dashboard-division-metric-value ${toneClass(metric)}`}>
                        <strong>{formatNumber(metric.nilai)}</strong>
                        <small>{fractionLabel(metric)}</small>
                      </span>
                    </>
                  );

                  return (
                    <li key={metric.label} className="crm-dashboard-division-metric">
                      {metric.href ? (
                        <Link href={metric.href} className="crm-dashboard-division-metric-link">
                          {body}
                        </Link>
                      ) : (
                        <div className="crm-dashboard-division-metric-link">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="crm-dashboard-division-empty">Belum ada metrik untuk ditampilkan.</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

export function DashboardOverview({ summary, canOpenNoc }: DashboardOverviewProps) {
  return (
    <div className="crm-dashboard-overview">
      <DashboardNoc summary={summary} canOpenNoc={canOpenNoc} />
      <DashboardDivisions summary={summary} />
    </div>
  );
}
