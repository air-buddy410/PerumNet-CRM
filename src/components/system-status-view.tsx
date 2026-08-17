import Link from "next/link";
import type { BarisRouter, BarisTugas, StatusSistem } from "@/lib/system-status-service";
import { formatUiDateTime } from "@/components/ui-formatters";

type Verdict = StatusSistem["vonis"];
type Freshness = BarisTugas["kesegaran"];

const verdictMeta: Record<Verdict, { label: string; description: string; className: string }> = {
  SEHAT: {
    label: "Sistem sehat",
    description: "Tidak ada gejala operasional yang perlu ditindaklanjuti.",
    className: "is-healthy",
  },
  PERHATIAN: {
    label: "Perlu perhatian",
    description: "Ada gejala yang perlu ditinjau, tetapi belum menunjukkan kegawatan.",
    className: "is-attention",
  },
  GAWAT: {
    label: "Gawat",
    description: "Ada bagian penting yang kemungkinan berhenti atau gagal berulang.",
    className: "is-critical",
  },
};

const freshnessMeta: Record<Freshness, { label: string; className: string }> = {
  MATI: { label: "Dimatikan", className: "is-disabled" },
  SEGAR: { label: "Segar", className: "is-healthy" },
  TERLAMBAT: { label: "Terlambat", className: "is-attention" },
  MACET: { label: "Macet", className: "is-critical" },
};

function StatusPill({ label, className }: { label: string; className: string }) {
  return <span className={`system-status-pill ${className}`}>{label}</span>;
}

function SummaryMetric({ label, value, detail, href }: { label: string; value: string | number; detail?: string; href?: string }) {
  const content = (
    <>
      <span className="system-status-metric-label">{label}</span>
      <strong>{value}</strong>
      {detail && <span className="system-status-metric-detail">{detail}</span>}
    </>
  );

  return href ? (
    <Link href={href} className="system-status-metric">
      {content}
    </Link>
  ) : (
    <div className="system-status-metric">{content}</div>
  );
}

export function SystemStatusSummaryCard({ status, canOpen = false }: { status: StatusSistem | null; canOpen?: boolean }) {
  if (!status) {
    return (
      <section className="crm-panel system-status-summary-card is-unavailable" aria-labelledby="system-status-summary-title">
        <div className="system-status-summary-icon" aria-hidden="true">?</div>
        <div className="system-status-summary-copy">
          <h2 id="system-status-summary-title">Status sistem belum tersedia</h2>
          <p>Ringkasan operasional tidak dapat dimuat saat ini. Coba lagi dari halaman Status Sistem.</p>
        </div>
        {canOpen && <Link href="/settings/status" className="btn-secondary whitespace-nowrap">Buka status</Link>}
      </section>
    );
  }

  const meta = verdictMeta[status.vonis];
  const card = (
    <section className={`crm-panel system-status-summary-card ${meta.className}`} aria-labelledby="system-status-summary-title">
      <div className="system-status-summary-icon" aria-hidden="true">{status.vonis === "SEHAT" ? "✓" : status.vonis === "GAWAT" ? "!" : "~"}</div>
      <div className="system-status-summary-copy">
        <div className="system-status-summary-kicker">Status sistem</div>
        <h2 id="system-status-summary-title">{meta.label}</h2>
        <p>{status.gejala.length === 0 ? "Tidak ada gejala aktif." : `${status.gejala.length} gejala perlu ditinjau.`}</p>
      </div>
      {canOpen && <span className="system-status-summary-link">Lihat detail →</span>}
    </section>
  );

  return canOpen ? <Link href="/settings/status" className="system-status-summary-link-wrap">{card}</Link> : card;
}

function TaskTable({ tasks }: { tasks: BarisTugas[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] system-status-table">
        <thead>
          <tr>
            <th className="th">Tugas</th>
            <th className="th">Kesegaran</th>
            <th className="th">Terakhir berjalan</th>
            <th className="th">Keterangan</th>
            <th className="th">Sewa</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const meta = freshnessMeta[task.kesegaran];
            return (
              <tr key={task.code}>
                <td className="td min-w-0">
                  <strong className="block break-words text-sm text-slate-700">{task.name}</strong>
                  <span className="font-mono text-[11px] text-slate-400">{task.code}</span>
                </td>
                <td className="td"><StatusPill label={meta.label} className={meta.className} /></td>
                <td className="td whitespace-nowrap text-xs text-slate-600">{task.sejak}</td>
                <td className="td max-w-[24rem] break-words text-xs text-slate-500">{task.alasan}</td>
                <td className="td">
                  {task.sewaTertinggal ? <StatusPill label="Tertinggal" className="is-critical" /> : <span className="text-xs text-slate-400">Normal</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RouterTable({ routers }: { routers: BarisRouter[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] system-status-table">
        <thead>
          <tr>
            <th className="th">Router</th>
            <th className="th">Polling</th>
            <th className="th">Terakhir ditarik</th>
            <th className="th">Gagal beruntun</th>
            <th className="th">Sesi online</th>
            <th className="th">Error terakhir</th>
          </tr>
        </thead>
        <tbody>
          {routers.map((router) => (
            <tr key={router.hostname}>
              <td className="td font-mono text-xs font-semibold">{router.hostname}</td>
              <td className="td"><StatusPill label={router.isPollingEnabled ? "Aktif" : "Dimatikan"} className={router.isPollingEnabled ? "is-healthy" : "is-disabled"} /></td>
              <td className="td whitespace-nowrap text-xs text-slate-600">{router.sejak}</td>
              <td className="td">
                <span className={router.gagalBeruntun > 0 ? "font-semibold text-red-600" : "text-slate-500"}>{router.gagalBeruntun}</span>
              </td>
              <td className="td whitespace-nowrap text-xs text-slate-600">{router.sesiOnline}</td>
              <td className="td max-w-[22rem] break-words text-xs text-slate-500">{router.errorTerakhir ?? "Tidak ada"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SystemStatusView({ status }: { status: StatusSistem }) {
  const meta = verdictMeta[status.vonis];
  const latestSync = formatUiDateTime(status.librenms.terakhirSinkron, "Belum pernah");

  return (
    <div className="system-status-page">
      <section className={`system-status-verdict ${meta.className}`} aria-labelledby="system-status-verdict-title">
        <div>
          <div className="system-status-summary-kicker">Pemeriksaan operasional</div>
          <h2 id="system-status-verdict-title">{meta.label}</h2>
          <p>{meta.description}</p>
        </div>
        <div className="system-status-verdict-count">
          <strong>{status.gejala.length}</strong>
          <span>gejala aktif</span>
        </div>
      </section>

      <div className="system-status-metric-grid" aria-label="Ringkasan sistem">
        <SummaryMetric label="Perintah router" value={status.antrean.queued} detail="menunggu" href="/noc/access-jobs" />
        <SummaryMetric label="Gagal ditinjau" value={status.antrean.failed} detail="di antrean" href="/noc/access-jobs" />
        <SummaryMetric label="Sedang berjalan" value={status.antrean.running} detail="proses" href="/noc/access-jobs" />
        <SummaryMetric label="LibreNMS" value={`${status.librenms.perangkat}/${status.librenms.port}`} detail={`perangkat/port · ${status.librenms.sejak}`} href="/noc/devices" />
        <SummaryMetric label="OLT & PON" value={`${status.olt.olt}/${status.olt.ponPort}`} detail="OLT/port PON" href="/noc/ftth" />
        <SummaryMetric label="ODP tanpa PON" value={status.olt.odpTanpaPon} detail="perlu pemetaan" href="/noc/ftth" />
      </div>

      <section className="crm-panel system-status-section" aria-labelledby="system-status-symptoms-title">
        <div className="crm-panel-heading">
          <div>
            <h2 id="system-status-symptoms-title">Gejala yang perlu ditinjau</h2>
            <p>{status.gejala.length === 0 ? "Tidak ada gejala aktif saat pemeriksaan ini." : "Sumber gejala ditampilkan apa adanya dari pemeriksaan server."}</p>
          </div>
        </div>
        {status.gejala.length === 0 ? (
          <div className="system-status-empty">Semua pemeriksaan berjalan dalam batas yang diharapkan.</div>
        ) : (
          <ul className="system-status-symptoms">
            {status.gejala.map((symptom, index) => (
              <li key={`${symptom.bagian}-${index}`} className={`system-status-symptom ${symptom.vonis === "GAWAT" ? "is-critical" : symptom.vonis === "PERHATIAN" ? "is-attention" : "is-healthy"}`}>
                <StatusPill label={symptom.vonis === "GAWAT" ? "Gawat" : "Perhatian"} className={symptom.vonis === "GAWAT" ? "is-critical" : "is-attention"} />
                <div className="min-w-0">
                  <strong>{symptom.bagian}</strong>
                  <p>{symptom.pesan}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="crm-panel system-status-section" aria-labelledby="system-status-tasks-title">
        <div className="crm-panel-heading">
          <div>
            <h2 id="system-status-tasks-title">Tugas terjadwal</h2>
            <p>Kesegaran dibandingkan dengan interval masing-masing tugas.</p>
          </div>
        </div>
        {status.tugas.length === 0 ? <div className="system-status-empty">Belum ada tugas terjadwal.</div> : <TaskTable tasks={status.tugas} />}
      </section>

      <section className="crm-panel system-status-section" aria-labelledby="system-status-routers-title">
        <div className="crm-panel-heading">
          <div>
            <h2 id="system-status-routers-title">Router dan polling</h2>
            <p>Gagal beruntun ditampilkan terpisah dari riwayat kegagalan seumur hidup.</p>
          </div>
          <Link href="/noc/pppoe" className="text-xs font-semibold text-brand-600 hover:underline">Monitor PPPoE</Link>
        </div>
        {status.router.length === 0 ? <div className="system-status-empty">Belum ada router yang terdaftar.</div> : <RouterTable routers={status.router} />}
      </section>

      <section className="system-status-footer-note">
        Sinkronisasi LibreNMS terakhir: <strong>{latestSync}</strong>. Halaman ini adalah ringkasan operasional; detail tindakan tetap berada di modul sumbernya.
      </section>
    </div>
  );
}
