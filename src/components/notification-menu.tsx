"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, BellDot, CheckCheck, ExternalLink, Inbox, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type NotificationPreview = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  module: string;
  href: string | null;
  createdAt: string;
  readAt: string | null;
};

export type NotificationMenuData = {
  unreadCount: number;
  items: NotificationPreview[];
  hasMore: boolean;
};

type FormAction = (formData: FormData) => Promise<void>;
type EmptyAction = () => Promise<void>;

type NotificationMenuProps = {
  data: NotificationMenuData;
  error?: string;
  openNotificationAction: FormAction;
  markAllReadAction: EmptyAction;
};

function formatNotificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Waktu tidak tersedia";

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function NotificationMenu({
  data,
  error,
  openNotificationAction,
  markAllReadAction,
}: NotificationMenuProps) {
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const unreadCount = Math.max(0, data.unreadCount);

  return (
    <div ref={rootRef} className="crm-notification-menu">
      <button
        type="button"
        className="crm-notification-button"
        aria-label={unreadCount > 0 ? `${unreadCount} notifikasi belum dibaca` : "Buka notifikasi"}
        aria-expanded={open}
        aria-controls="crm-notification-popover"
        onClick={() => setOpen((value) => !value)}
      >
        {unreadCount > 0 ? <BellDot aria-hidden="true" /> : <Bell aria-hidden="true" />}
        {unreadCount > 0 && (
          <span className="crm-notification-badge" aria-label={`${unreadCount} belum dibaca`}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          id="crm-notification-popover"
          className="crm-notification-popover"
          role="dialog"
          aria-label="Notifikasi terbaru"
        >
          <div className="crm-notification-heading">
            <div>
              <strong>Notifikasi</strong>
              <span>{unreadCount > 0 ? `${unreadCount} belum dibaca` : "Semua sudah dibaca"}</span>
            </div>
            <button
              type="button"
              className="crm-notification-close"
              aria-label="Tutup notifikasi"
              onClick={() => setOpen(false)}
            >
              <X aria-hidden="true" />
            </button>
          </div>

          {error ? (
            <div className="crm-notification-state is-error">
              <Inbox aria-hidden="true" />
              <strong>Notifikasi belum tersedia</strong>
              <span>{error}</span>
            </div>
          ) : data.items.length === 0 ? (
            <div className="crm-notification-state">
              <Inbox aria-hidden="true" />
              <strong>Belum ada notifikasi</strong>
              <span>Aktivitas penting dari modul Anda akan muncul di sini.</span>
            </div>
          ) : (
            <div className="crm-notification-list">
              {data.items.slice(0, 5).map((item) => (
                <form key={item.id} action={openNotificationAction}>
                  <input type="hidden" name="notificationId" value={item.id} />
                  <button
                    type="submit"
                    className={`crm-notification-item ${item.readAt ? "is-read" : ""}`}
                  >
                    <span className="crm-notification-item-dot" aria-hidden="true" />
                    <span className="crm-notification-item-copy">
                      <span className="crm-notification-item-meta">
                        <small>{item.module || item.type}</small>
                        <time dateTime={item.createdAt}>{formatNotificationTime(item.createdAt)}</time>
                      </span>
                      <strong>{item.title}</strong>
                      {item.body && <span>{item.body}</span>}
                    </span>
                    {item.href && <ExternalLink className="crm-notification-item-link" aria-hidden="true" />}
                  </button>
                </form>
              ))}
              {data.hasMore && (
                <div className="crm-notification-more">Menampilkan 5 notifikasi terbaru.</div>
              )}
            </div>
          )}

          <div className="crm-notification-footer">
            {unreadCount > 0 && !error ? (
              <form action={markAllReadAction}>
                <button type="submit" className="crm-notification-mark-all">
                  <CheckCheck aria-hidden="true" />
                  Tandai semua dibaca
                </button>
              </form>
            ) : (
              <span className="crm-notification-footer-spacer" />
            )}
            <Link href="/notifications" className="crm-notification-all" onClick={() => setOpen(false)}>
              Lihat semua
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
