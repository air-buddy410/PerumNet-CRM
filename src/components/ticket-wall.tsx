"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  CircleDot,
  Clock3,
  Expand,
  Layers3,
  Minimize,
  Monitor,
  Phone,
  RefreshCw,
  RotateCcw,
  Tag,
  UserRound,
  Wrench,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition, type ComponentType } from "react";
import { formatUiDateTime, formatUiTime } from "@/components/ui-formatters";

export type TicketWallStep = {
  id: string;
  label: string;
  state: "DONE" | "CURRENT" | "PENDING";
};

export type TicketWallItem = {
  kind: "TICKET" | "WORK_ORDER";
  id: string;
  number: string;
  title: string;
  customerName: string | null;
  maskedPhone: string | null;
  categoryName: string | null;
  tags: string[];
  status: string;
  priority: string | null;
  engineerName: string | null;
  assignedAt: string | null;
  scheduledAt: string | null;
  createdAt: string;
  href: string | null;
  workflow: {
    name: string;
    percentage: number;
    steps: TicketWallStep[];
  } | null;
};

export type TicketWallSnapshot = {
  generatedAt: string;
  from: string;
  to: string;
  statusCounts: Record<string, number>;
  totalCount: number;
  items: TicketWallItem[];
};

type InitialFilters = {
  status: string;
  category: string;
  tag: string;
  engineer: string;
};

type TicketWallProps = {
  snapshot: TicketWallSnapshot;
  initialFilters: InitialFilters;
};

const TICKET_STATUS_ORDER = ["OPEN", "IN_PROGRESS", "PENDING", "SOLVED", "CLOSED"];

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  PENDING: "Pending",
  SOLVED: "Solved",
  CLOSED: "Closed",
  ASSIGNED: "Assigned",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const STATUS_TONES: Record<string, string> = {
  OPEN: "open",
  IN_PROGRESS: "progress",
  PENDING: "pending",
  SOLVED: "solved",
  CLOSED: "closed",
  ASSIGNED: "progress",
  COMPLETED: "solved",
  CANCELLED: "closed",
};

const SUMMARY_ICONS: Record<string, ComponentType<{ size?: number }>> = {
  OPEN: AlertTriangle,
  IN_PROGRESS: Activity,
  PENDING: Clock3,
  SOLVED: CheckCircle2,
  CLOSED: Layers3,
  TOTAL: Layers3,
};

function labelForStatus(status: string) {
  return STATUS_LABELS[status] ?? status.replaceAll("_", " ");
}

function toneForStatus(status: string) {
  return STATUS_TONES[status] ?? "neutral";
}

function formatDateTime(value: string | null) {
  return formatUiDateTime(value, "Belum dijadwalkan");
}

function formatClock(value: Date) {
  return formatUiTime(value);
}

function formatUpdatedAt(value: string) {
  return formatUiTime(value);
}

function categoryIcon(category: string | null) {
  const value = category?.toLowerCase() ?? "";
  if (value.includes("install") || value.includes("pasang")) return Zap;
  if (value.includes("maint") || value.includes("device") || value.includes("perangkat")) return Wrench;
  if (value.includes("outage") || value.includes("fiber") || value.includes("upstream")) return AlertTriangle;
  return Tag;
}

function SummaryTile({ status, count }: { status: string; count: number }) {
  const Icon = SUMMARY_ICONS[status] ?? CircleDot;
  const tone = status === "TOTAL" ? "total" : toneForStatus(status);
  return (
    <div className={`tvwall-summary-tile is-${tone}`} data-testid={`ticket-wall-summary-${status.toLowerCase()}`}>
      <span className="tvwall-summary-icon"><Icon size={20} aria-hidden="true" /></span>
      <span className="tvwall-summary-copy">
        <strong>{labelForStatus(status)}</strong>
        <b>{count}</b>
        <small>{status === "TOTAL" ? "Semua pekerjaan" : "Tiket"}</small>
      </span>
    </div>
  );
}

function WorkflowRail({ workflow }: { workflow: NonNullable<TicketWallItem["workflow"]> }) {
  return (
    <div className="tvwall-workflow" aria-label={`Progress workflow ${workflow.percentage}%`}>
      <div className="tvwall-workflow-heading">
        <span>{workflow.name}</span>
        <strong>{workflow.percentage}%</strong>
      </div>
      <div
        className="tvwall-workflow-track"
        style={{ gridTemplateColumns: `repeat(${Math.max(workflow.steps.length, 1)}, minmax(42px, 1fr))` }}
      >
        {workflow.steps.map((step) => (
          <span key={step.id} className={`tvwall-workflow-step is-${step.state.toLowerCase()}`} title={step.label}>
            <span className="tvwall-workflow-dot">
              {step.state === "DONE" ? <Check size={12} aria-hidden="true" /> : step.state === "CURRENT" ? <CircleDot size={10} aria-hidden="true" /> : <Circle size={9} aria-hidden="true" />}
            </span>
            <span>{step.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function TicketWallCard({ item }: { item: TicketWallItem }) {
  const CategoryIcon = categoryIcon(item.categoryName);
  const content = (
    <article className={`tvwall-card is-${toneForStatus(item.status)} ${item.kind === "WORK_ORDER" ? "is-work-order" : ""}`}>
      <div className="tvwall-card-header">
        <span className="tvwall-card-number">{item.kind === "WORK_ORDER" ? "WO" : "#"}{item.number}</span>
        <span className={`tvwall-status is-${toneForStatus(item.status)}`}>{labelForStatus(item.status)}</span>
      </div>
      <div className="tvwall-card-customer">
        <span className="tvwall-card-customer-name"><UserRound size={14} aria-hidden="true" />{item.customerName ?? "Pelanggan belum ditentukan"}</span>
        {item.maskedPhone && <span className="tvwall-card-phone"><Phone size={12} aria-hidden="true" />{item.maskedPhone}</span>}
      </div>
      <div className="tvwall-card-category">
        <CategoryIcon size={14} aria-hidden="true" />
        <span>{item.categoryName ?? "Tanpa kategori"}</span>
        {item.priority && <span className={`tvwall-priority is-${item.priority.toLowerCase()}`}>{item.priority}</span>}
      </div>
      <h2 title={item.title}>{item.title}</h2>
      <div className="tvwall-card-details">
        <span><UserRound size={13} aria-hidden="true" /> {item.engineerName ?? "Belum ditugaskan"}</span>
        <span><CalendarDays size={13} aria-hidden="true" /> {formatDateTime(item.scheduledAt)}</span>
      </div>
      {item.workflow ? (
        <WorkflowRail workflow={item.workflow} />
      ) : (
        <div className="tvwall-no-workflow">
          <span><Activity size={14} aria-hidden="true" /> Progress workflow belum tersedia</span>
          <small>Dibuat {formatDateTime(item.createdAt)}</small>
        </div>
      )}
      {item.tags.length > 0 && (
        <div className="tvwall-tags" aria-label="Tag tiket">
          {item.tags.slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}
        </div>
      )}
    </article>
  );

  return item.href ? (
    <Link href={item.href} className="tvwall-card-link" aria-label={`Buka ${item.kind === "WORK_ORDER" ? "work order" : "tiket"} ${item.number}`}>
      {content}
    </Link>
  ) : content;
}

export default function TicketWall({ snapshot, initialFilters }: TicketWallProps) {
  const router = useRouter();
  const boardRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();
  const [clock, setClock] = useState("--:--:--");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const [from, setFrom] = useState(snapshot.from);
  const [to, setTo] = useState(snapshot.to);
  const [status, setStatus] = useState(initialFilters.status || "ALL");
  const [category, setCategory] = useState(initialFilters.category || "ALL");
  const [tag, setTag] = useState(initialFilters.tag || "ALL");
  const [engineer, setEngineer] = useState(initialFilters.engineer || "ALL");

  useEffect(() => {
    setFrom(snapshot.from);
    setTo(snapshot.to);
  }, [snapshot.from, snapshot.to]);

  useEffect(() => {
    const tick = () => setClock(formatClock(new Date()));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(document.fullscreenElement === boardRef.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible" || isPending) return;
      startTransition(() => router.refresh());
    };
    const interval = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [isPending, router]);

  const options = useMemo(() => {
    const categories = new Set<string>();
    const tags = new Set<string>();
    const engineers = new Set<string>();
    const statuses = new Set(TICKET_STATUS_ORDER);
    for (const item of snapshot.items) {
      if (item.categoryName) categories.add(item.categoryName);
      item.tags.forEach((itemTag) => tags.add(itemTag));
      if (item.engineerName) engineers.add(item.engineerName);
      statuses.add(item.status);
    }
    return {
      categories: [...categories].sort((a, b) => a.localeCompare(b)),
      tags: [...tags].sort((a, b) => a.localeCompare(b)),
      engineers: [...engineers].sort((a, b) => a.localeCompare(b)),
      statuses: [...statuses],
    };
  }, [snapshot.items]);

  const baseFilteredItems = useMemo(() => snapshot.items.filter((item) =>
    (category === "ALL" || item.categoryName === category) &&
    (tag === "ALL" || item.tags.includes(tag)) &&
    (engineer === "ALL" || item.engineerName === engineer)
  ), [category, engineer, snapshot.items, tag]);

  const visibleItems = useMemo(() => baseFilteredItems.filter((item) => status === "ALL" || item.status === status), [baseFilteredItems, status]);
  const summaryCounts = useMemo(() => {
    const counts = Object.fromEntries(TICKET_STATUS_ORDER.map((itemStatus) => [itemStatus, 0]));
    for (const item of baseFilteredItems) {
      if (item.kind === "TICKET") counts[item.status] = (counts[item.status] ?? 0) + 1;
    }
    return counts;
  }, [baseFilteredItems]);
  const totalJobs = baseFilteredItems.length;
  const totalWorkOrders = baseFilteredItems.filter((item) => item.kind === "WORK_ORDER").length;

  const updateDateRange = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams(window.location.search);
    params.set("from", from);
    params.set("to", to);
    if (status === "ALL") params.delete("status"); else params.set("status", status);
    if (category === "ALL") params.delete("category"); else params.set("category", category);
    if (tag === "ALL") params.delete("tag"); else params.set("tag", tag);
    if (engineer === "ALL") params.delete("engineer"); else params.set("engineer", engineer);
    startTransition(() => router.push(`/helpdesk/dispatch?${params.toString()}`));
  };

  const resetFilters = () => {
    setStatus("ALL");
    setCategory("ALL");
    setTag("ALL");
    setEngineer("ALL");
    startTransition(() => router.push("/helpdesk/dispatch"));
  };

  const toggleFullscreen = async () => {
    setFullscreenError(null);
    if (!document.fullscreenEnabled) {
      setFullscreenError("Fullscreen tidak tersedia di browser ini.");
      return;
    }
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await boardRef.current?.requestFullscreen();
    } catch {
      setFullscreenError("Fullscreen tidak dapat dibuka. Gunakan kontrol fullscreen browser.");
    }
  };

  return (
    <div ref={boardRef} className="tvwall-page" data-testid="ticket-wall">
      <header className="tvwall-header">
        <button type="button" className="tvwall-icon-button" onClick={toggleFullscreen} aria-label={isFullscreen ? "Keluar dari fullscreen" : "Buka fullscreen"} data-testid="ticket-wall-fullscreen">
          {isFullscreen ? <Minimize size={19} aria-hidden="true" /> : <Expand size={19} aria-hidden="true" />}
        </button>
        <div className="tvwall-title">
          <Monitor size={27} aria-hidden="true" />
          <div>
            <h1>Ticket Wall Dashboard</h1>
            <p>Progress pekerjaan tim operasional</p>
          </div>
        </div>
        <div className="tvwall-live-clock" aria-live="polite">
          <strong>{clock}</strong>
          <span><i /> LIVE</span>
        </div>
      </header>

      <form className="tvwall-toolbar" onSubmit={updateDateRange}>
        <label><span>Dari</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label><span>Sampai</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">Semua status</option>{options.statuses.map((itemStatus) => <option key={itemStatus} value={itemStatus}>{labelForStatus(itemStatus)}</option>)}</select></label>
        <label><span>Kategori</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="ALL">Semua kategori</option>{options.categories.map((itemCategory) => <option key={itemCategory} value={itemCategory}>{itemCategory}</option>)}</select></label>
        <label><span>Tag</span><select value={tag} onChange={(event) => setTag(event.target.value)}><option value="ALL">Semua tag</option>{options.tags.map((itemTag) => <option key={itemTag} value={itemTag}>{itemTag}</option>)}</select></label>
        <label><span>Engineer</span><select value={engineer} onChange={(event) => setEngineer(event.target.value)}><option value="ALL">Semua engineer</option>{options.engineers.map((itemEngineer) => <option key={itemEngineer} value={itemEngineer}>{itemEngineer}</option>)}</select></label>
        <button type="submit" className="tvwall-action-button">Terapkan</button>
        <button type="button" className="tvwall-quiet-button" onClick={resetFilters} aria-label="Reset filter"><RotateCcw size={15} aria-hidden="true" /> Reset</button>
        <button type="button" className="tvwall-quiet-button" onClick={() => startTransition(() => router.refresh())} aria-label="Refresh data" data-testid="ticket-wall-refresh"><RefreshCw size={15} aria-hidden="true" /> {isPending ? "Memuat..." : "Refresh"}</button>
      </form>

      {fullscreenError && <p className="tvwall-inline-warning" role="status">{fullscreenError}</p>}

      <section className="tvwall-summary" aria-label="Ringkasan status tiket">
        {TICKET_STATUS_ORDER.map((itemStatus) => <SummaryTile key={itemStatus} status={itemStatus} count={summaryCounts[itemStatus] ?? 0} />)}
        <SummaryTile status="TOTAL" count={totalJobs} />
      </section>

      <div className="tvwall-meta-row">
        <span>{totalJobs} pekerjaan · {totalWorkOrders} work order</span>
        <span><span className="tvwall-live-dot" /> Terakhir diperbarui {formatUpdatedAt(snapshot.generatedAt)} WITA</span>
      </div>

      {visibleItems.length === 0 ? (
        <div className="tvwall-empty" role="status">
          <Layers3 size={28} aria-hidden="true" />
          <strong>{snapshot.items.length === 0 ? "Belum ada pekerjaan pada rentang tanggal ini." : "Tidak ada pekerjaan yang sesuai filter."}</strong>
          <span>Sesuaikan rentang tanggal atau reset filter untuk melihat data lain.</span>
        </div>
      ) : (
        <section className="tvwall-grid" aria-label="Daftar pekerjaan tim">
          {visibleItems.map((item) => <TicketWallCard key={`${item.kind}-${item.id}`} item={item} />)}
        </section>
      )}
    </div>
  );
}
