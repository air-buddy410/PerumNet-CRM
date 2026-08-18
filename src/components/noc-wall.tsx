"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Gauge,
  ListChecks,
  Radio,
  Router,
  ServerCog,
  Ticket,
  UsersRound,
  WifiOff,
} from "lucide-react";
import type { NocWall } from "@/lib/noc-wall";
import { formatUiDateTime } from "@/components/ui-formatters";

type NocWallSnapshot = Omit<NocWall, "diperbaruiPada"> & {
  diperbaruiPada: string;
};

const verdictCopy = {
  SEHAT: { label: "Sehat", description: "Tidak ada gejala kritis yang terdeteksi." },
  PERHATIAN: { label: "Perhatian", description: "Ada kondisi yang perlu dipantau." },
  GAWAT: { label: "Gawat", description: "Ada gangguan yang membutuhkan perhatian segera." },
} as const;

function verdictTone(verdict: NocWallSnapshot["vonis"]) {
  return verdict.toLowerCase();
}

function numberLabel(value: number, singular: string, plural = `${singular}s`) {
  return `${value.toLocaleString("id-ID")} ${value === 1 ? singular : plural}`;
}

function metricTone(value: number, tone: "healthy" | "warning" | "danger" | "neutral") {
  return `${tone} ${value > 0 ? "has-value" : "is-zero"}`;
}

export default function NocWall({ snapshot }: { snapshot: NocWallSnapshot }) {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const interval = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  const verdict = verdictCopy[snapshot.vonis];
  const visibleClusters = snapshot.padamMenggerombol.slice(0, 8);
  const hiddenClusters = Math.max(0, snapshot.padamMenggerombol.length - visibleClusters.length);
  const visibleRouters = [...snapshot.router]
    .sort((a, b) => b.gagalBeruntun - a.gagalBeruntun || a.hostname.localeCompare(b.hostname))
    .slice(0, 6);
  const hiddenRouters = Math.max(0, snapshot.router.length - visibleRouters.length);

  return (
    <main className="nocwall-page" data-testid="noc-wall">
      <header className="nocwall-header">
        <div className="nocwall-title-block">
          <div className="nocwall-eyebrow"><Radio aria-hidden="true" /> PERUMNET NOC · LIVE</div>
          <h1>Status Jaringan</h1>
          <p>Pantauan ringkas sesi pelanggan, jalur akses, router, penjadwal, dan tiket operasional.</p>
        </div>
        <div className={`nocwall-verdict is-${verdictTone(snapshot.vonis)}`} aria-label={`Vonis sistem: ${verdict.label}`}>
          <span className="nocwall-verdict-icon">
            {snapshot.vonis === "SEHAT" ? <CheckCircle2 aria-hidden="true" /> : snapshot.vonis === "GAWAT" ? <CircleAlert aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
          </span>
          <span>
            <small>VONIS SISTEM</small>
            <strong>{verdict.label}</strong>
            <em>{verdict.description}</em>
          </span>
        </div>
      </header>

      <div className="nocwall-meta" aria-live="polite">
        <span><span className="nocwall-live-dot" aria-hidden="true" /> DATA LANGSUNG</span>
        <span>Diperbarui {formatUiDateTime(snapshot.diperbaruiPada, "belum tersedia")} WITA · refresh otomatis 60 detik</span>
      </div>

      <section className="nocwall-block nocwall-session-block" aria-labelledby="nocwall-session-title">
        <div className="nocwall-block-heading">
          <div>
            <span className="nocwall-kicker">AKSES PELANGGAN</span>
            <h2 id="nocwall-session-title">Sesi PPPoE</h2>
          </div>
          <UsersRound aria-hidden="true" />
        </div>
        <div className="nocwall-session-grid">
          <div className={`nocwall-session-metric ${metricTone(snapshot.sesi.online, "healthy")}`}>
            <strong>{snapshot.sesi.online.toLocaleString("id-ID")}</strong>
            <span>Online</span>
            <small>terhubung normal</small>
          </div>
          <div className={`nocwall-session-metric ${metricTone(snapshot.sesi.offline, "warning")}`}>
            <strong>{snapshot.sesi.offline.toLocaleString("id-ID")}</strong>
            <span>Offline</span>
            <small>perlu pemantauan</small>
          </div>
          <div className={`nocwall-session-metric ${metricTone(snapshot.sesi.disabled, "neutral")}`}>
            <strong>{snapshot.sesi.disabled.toLocaleString("id-ID")}</strong>
            <span>Dinonaktifkan</span>
            <small>bukan gangguan jaringan</small>
          </div>
        </div>
      </section>

      <div className="nocwall-two-column">
        <section className="nocwall-block nocwall-alert-block" aria-labelledby="nocwall-outage-title">
          <div className="nocwall-block-heading">
            <div>
              <span className="nocwall-kicker">TEMUAN JARINGAN</span>
              <h2 id="nocwall-outage-title">Padam menggerombol</h2>
            </div>
            <WifiOff aria-hidden="true" />
          </div>
          {visibleClusters.length === 0 ? (
            <div className="nocwall-empty is-healthy" role="status">
              <CheckCircle2 aria-hidden="true" />
              <span>Tidak ada ODP dengan padam menggerombol.</span>
            </div>
          ) : (
            <>
              <ul className="nocwall-alert-list">
                {visibleClusters.map((cluster) => (
                  <li key={`${cluster.odp}-${cluster.ponPort ?? "port"}`}>
                    <span className="nocwall-alert-count">{cluster.jumlah}</span>
                    <span className="nocwall-alert-copy">
                      <strong>{cluster.odp}</strong>
                      <span>{[cluster.olt, cluster.ponPort].filter(Boolean).join(" · ") || "Jalur OLT belum tersedia"}</span>
                    </span>
                    <span className="nocwall-alert-label">PADAM</span>
                  </li>
                ))}
              </ul>
              {hiddenClusters > 0 && <p className="nocwall-more">+ {numberLabel(hiddenClusters, "ODP lain", "ODP lain")} tidak ditampilkan</p>}
            </>
          )}
          <div className="nocwall-submetric"><strong>{snapshot.padamTersebar.toLocaleString("id-ID")}</strong><span>padam tersebar di ODP lain</span></div>
        </section>

        <section className="nocwall-block" aria-labelledby="nocwall-router-title">
          <div className="nocwall-block-heading">
            <div>
              <span className="nocwall-kicker">PERANGKAT AKSES</span>
              <h2 id="nocwall-router-title">Router polling</h2>
            </div>
            <Router aria-hidden="true" />
          </div>
          {visibleRouters.length === 0 ? (
            <div className="nocwall-empty" role="status"><ServerCog aria-hidden="true" /><span>Belum ada router aktif untuk dipantau.</span></div>
          ) : (
            <ul className="nocwall-router-list">
              {visibleRouters.map((item) => {
                const tone = item.gagalBeruntun >= 3 ? "danger" : item.gagalBeruntun > 0 ? "warning" : "healthy";
                return (
                  <li key={item.hostname} className={`is-${tone}`}>
                    <span className="nocwall-status-dot" aria-hidden="true" />
                    <span className="nocwall-router-copy"><strong>{item.hostname}</strong><span>Polling terakhir {item.sejak}</span></span>
                    <span className="nocwall-router-fail">{item.gagalBeruntun > 0 ? `${item.gagalBeruntun} gagal` : "Normal"}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {hiddenRouters > 0 && <p className="nocwall-more">+ {numberLabel(hiddenRouters, "router lain", "router lain")} tidak ditampilkan</p>}
        </section>
      </div>

      <div className="nocwall-two-column">
        <section className="nocwall-block" aria-labelledby="nocwall-task-title">
          <div className="nocwall-block-heading">
            <div>
              <span className="nocwall-kicker">OPERASIONAL</span>
              <h2 id="nocwall-task-title">Penjadwal pekerjaan</h2>
            </div>
            <ListChecks aria-hidden="true" />
          </div>
          <div className="nocwall-ops-grid">
            <div className={`nocwall-ops-metric ${metricTone(snapshot.tugas.macet, "danger")}`}><Clock3 aria-hidden="true" /><strong>{snapshot.tugas.macet.toLocaleString("id-ID")}</strong><span>Macet</span></div>
            <div className={`nocwall-ops-metric ${metricTone(snapshot.tugas.terlambat, "warning")}`}><Activity aria-hidden="true" /><strong>{snapshot.tugas.terlambat.toLocaleString("id-ID")}</strong><span>Terlambat</span></div>
          </div>
          <p className="nocwall-block-note">Angka nol berarti semua tugas terjadwal masih dalam kondisi normal.</p>
        </section>

        <section className="nocwall-block" aria-labelledby="nocwall-ticket-title">
          <div className="nocwall-block-heading">
            <div>
              <span className="nocwall-kicker">HELPDESK</span>
              <h2 id="nocwall-ticket-title">Tiket operasional</h2>
            </div>
            <Ticket aria-hidden="true" />
          </div>
          <div className="nocwall-ticket-grid">
            <div className={`nocwall-ticket-metric ${metricTone(snapshot.tiket.terbuka, "warning")}`}><strong>{snapshot.tiket.terbuka.toLocaleString("id-ID")}</strong><span>Terbuka</span></div>
            <div className={`nocwall-ticket-metric ${metricTone(snapshot.tiket.lewatSla, "danger")}`}><strong>{snapshot.tiket.lewatSla.toLocaleString("id-ID")}</strong><span>Lewat SLA</span></div>
            <div className="nocwall-ticket-metric neutral"><strong>{snapshot.tiket.mttrMenit === null ? "—" : `${snapshot.tiket.mttrMenit} m`}</strong><span>MTTR rata-rata</span></div>
          </div>
          <p className="nocwall-block-note">Panel tetap ditampilkan. Ticketing masih memakai sistem lama sampai cutover.</p>
        </section>
      </div>

      <footer className="nocwall-footer"><Gauge aria-hidden="true" /> PerumNet Network Operations Center <span>·</span> layar informasi saja</footer>
    </main>
  );
}
