"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Ban,
  Boxes,
  BriefcaseBusiness,
  Command,
  FileText,
  MapPinned,
  ReceiptText,
  Search,
  Ticket,
  UsersRound,
  Wrench,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { NavGroup } from "@/components/nav";

type MenuSearchEntry = {
  href: string;
  label: string;
  group: string;
};

type EntitySearchResult = {
  id: string;
  type: string;
  module: string;
  title: string;
  subtitle: string | null;
  href: string;
};

type EntitySearchState = "idle" | "loading" | "success" | "error";

const entityIcons: Record<string, ComponentType<{ size?: number; strokeWidth?: number }>> = {
  customer: UsersRound,
  subscription: BriefcaseBusiness,
  device: Boxes,
  ticket: Ticket,
  invoice: ReceiptText,
  work_order: Wrench,
  termination: Ban,
};

function EntityIcon({ type }: { type: string }) {
  const Icon = entityIcons[type] ?? FileText;
  return <Icon size={16} strokeWidth={1.8} aria-hidden="true" />;
}

export function GlobalSearch({ groups }: { groups: NavGroup[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [entityResults, setEntityResults] = useState<EntitySearchResult[]>([]);
  const [entityState, setEntityState] = useState<EntitySearchState>("idle");

  const entries = useMemo<MenuSearchEntry[]>(
    () =>
      [
        ...groups.flatMap((group) =>
          group.items.map((item) => ({
            href: item.href,
            label: item.label,
            group: group.title,
          })),
        ),
        { href: "/profile", label: "Profil saya", group: "Akun" },
      ].filter(
        (entry, index, all) =>
          all.findIndex((candidate) => candidate.href === entry.href) === index,
      ),
    [groups],
  );

  const normalizedQuery = query.trim().toLocaleLowerCase("id-ID");
  const menuResults = useMemo(
    () =>
      normalizedQuery
        ? entries
            .filter((entry) =>
              `${entry.label} ${entry.group} ${entry.href}`
                .toLocaleLowerCase("id-ID")
                .includes(normalizedQuery),
            )
            .slice(0, 8)
        : [],
    [entries, normalizedQuery],
  );

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setMobileOpen(true);
        window.requestAnimationFrame(() => inputRef.current?.focus());
      }
    };

    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setMobileOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  useEffect(() => {
    if (normalizedQuery.length < 2) {
      abortRef.current?.abort();
      abortRef.current = null;
      setEntityResults([]);
      setEntityState("idle");
      return;
    }

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setEntityResults([]);
    setEntityState("loading");

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, {
          signal: controller.signal,
          cache: "no-store",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("Pencarian data tidak tersedia.");
        const payload = (await response.json()) as { results?: unknown };
        const results = Array.isArray(payload.results)
          ? payload.results.filter(isEntitySearchResult)
          : [];
        if (controller.signal.aborted) return;
        setEntityResults(results);
        setEntityState("success");
      } catch (error) {
        if (controller.signal.aborted) return;
        setEntityResults([]);
        setEntityState("error");
      }
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [normalizedQuery, query]);

  useEffect(() => {
    setMobileOpen(false);
    setQuery("");
  }, [pathname]);

  function closeSearch() {
    setMobileOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSearch();
      return;
    }

    if (event.key === "Enter") {
      const firstResult = menuResults[0] ?? entityResults[0];
      if (!firstResult) return;
      event.preventDefault();
      router.push(firstResult.href);
      closeSearch();
    }
  }

  const showResults = mobileOpen || query.trim().length > 0;
  const hasEntitySearch = normalizedQuery.length >= 2;
  const hasResults = menuResults.length > 0 || entityResults.length > 0;

  return (
    <div
      ref={rootRef}
      className={`crm-global-search ${mobileOpen ? "is-mobile-open" : ""}`}
    >
      <button
        type="button"
        className="crm-search-mobile-toggle"
        aria-label="Buka pencarian menu atau data"
        aria-expanded={mobileOpen}
        onClick={() => {
          setMobileOpen(true);
          window.requestAnimationFrame(() => inputRef.current?.focus());
        }}
      >
        <Search aria-hidden="true" />
      </button>

      <div className="crm-search-field-shell">
        <Search className="crm-search-leading-icon" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setMobileOpen(true)}
          onKeyDown={handleKeyDown}
          className="crm-search-input"
          placeholder="Cari menu atau data..."
          aria-label="Cari menu atau data"
          aria-controls="crm-search-results"
          aria-expanded={showResults}
          autoComplete="off"
        />
        <span className="crm-search-shortcut" aria-hidden="true">
          <Command /> K
        </span>
        {query && (
          <button
            type="button"
            className="crm-search-clear"
            aria-label="Bersihkan pencarian"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
          >
            <X aria-hidden="true" />
          </button>
        )}
      </div>

      {showResults && (
        <div
          id="crm-search-results"
          className="crm-search-popover"
          role="listbox"
          aria-label="Hasil pencarian"
        >
          {!query.trim() ? (
            <div className="crm-search-hint">
              <Search aria-hidden="true" />
              <span>Ketik nama menu atau data untuk mulai mencari.</span>
            </div>
          ) : (
            <>
              {menuResults.length > 0 && (
                <div className="crm-search-section">
                  <span className="crm-search-section-label">Menu</span>
                  {menuResults.map((entry) => (
                    <Link
                      key={`menu-${entry.href}`}
                      href={entry.href}
                      className="crm-search-result"
                      role="option"
                      onClick={closeSearch}
                    >
                      <span className="crm-search-result-icon">
                        <MapPinned aria-hidden="true" />
                      </span>
                      <span className="crm-search-result-copy">
                        <strong>{entry.label}</strong>
                        <small>{entry.group}</small>
                      </span>
                      <span className="crm-search-result-path">Menu</span>
                    </Link>
                  ))}
                </div>
              )}

              {hasEntitySearch && (
                <div className="crm-search-section">
                  <span className="crm-search-section-label">Data</span>
                  {entityState === "loading" ? (
                    <div className="crm-search-state">Mencari data...</div>
                  ) : entityState === "error" ? (
                    <div className="crm-search-state is-error">
                      Pencarian data belum tersedia. Coba lagi.
                    </div>
                  ) : entityResults.length > 0 ? (
                    entityResults.map((result) => (
                      <Link
                        key={`entity-${result.type}-${result.id}`}
                        href={result.href}
                        className="crm-search-result"
                        role="option"
                        onClick={closeSearch}
                      >
                        <span className="crm-search-result-icon">
                          <EntityIcon type={result.type} />
                        </span>
                        <span className="crm-search-result-copy">
                          <strong>{result.title}</strong>
                          <small>{result.subtitle || result.module}</small>
                        </span>
                        <span className="crm-search-result-path">{result.module}</span>
                      </Link>
                    ))
                  ) : (
                    <div className="crm-search-state">Tidak ada data yang cocok.</div>
                  )}
                </div>
              )}

              {!hasResults && !hasEntitySearch && (
                <div className="crm-search-empty">
                  <span>Tidak ada menu yang cocok.</span>
                  <small>Ketik minimal 2 karakter untuk mencari data.</small>
                </div>
              )}

            </>
          )}
        </div>
      )}
    </div>
  );
}

function isEntitySearchResult(value: unknown): value is EntitySearchResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.type === "string" &&
    typeof candidate.module === "string" &&
    typeof candidate.title === "string" &&
    (candidate.subtitle === null || typeof candidate.subtitle === "string") &&
    typeof candidate.href === "string" &&
    candidate.href.startsWith("/")
  );
}
