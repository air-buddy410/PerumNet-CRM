"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, BellDot, CheckCheck, ExternalLink, Inbox, KeyRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatUiNotificationTime } from "@/components/ui-formatters";

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
  passwordChangeRequired?: boolean;
  openNotificationAction: FormAction;
  markAllReadAction: EmptyAction;
};

export function NotificationMenu({
  data,
  error,
  passwordChangeRequired = false,
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
  const visibleUnreadCount = unreadCount + (passwordChangeRequired ? 1 : 0);

  return (
    <div ref={rootRef} className="crm-notification-menu">
      <button
        type="button"
        className="crm-notification-button"
        aria-label={
          passwordChangeRequired
            ? `Password perlu diganti${unreadCount > 0 ? ` dan ${unreadCount} notifikasi belum dibaca` : ""}`
            : unreadCount > 0
              ? `${unreadCount} notifikasi belum dibaca`
              : "Buka notifikasi"
        }
        aria-expanded={open}
        aria-controls="crm-notification-popover"
        onClick={() => setOpen((value) => !value)}
      >
        {visibleUnreadCount > 0 ? <BellDot aria-hidden="true" /> : <Bell aria-hidden="true" />}
        {visibleUnreadCount > 0 && (
          <span className="crm-notification-badge" aria-label={`${visibleUnreadCount} item perlu ditinjau`}>
            {visibleUnreadCount > 9 ? "9+" : visibleUnreadCount}
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
              <span>{visibleUnreadCount > 0 ? `${visibleUnreadCount} item perlu ditinjau` : "Semua sudah dibaca"}</span>
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

          <div className="crm-notification-list">
            {passwordChangeRequired && (
              <div className="crm-notification-security" role="alert">
                <span className="crm-notification-security-icon" aria-hidden="true">
                  <KeyRound />
                </span>
                <span className="crm-notification-security-copy">
                  <span className="crm-notification-item-meta">
                    <small>Keamanan akun</small>
                    <span>Perlu tindakan</span>
                  </span>
                  <strong>Ganti password diperlukan</strong>
                  <span>Password akun Anda masih perlu diganti untuk menjaga keamanan akses.</span>
                  <Link href="/profile#password-title" onClick={() => setOpen(false)}>
                    Buka pengaturan password
                  </Link>
                </span>
              </div>
            )}

            {error ? (
              <div className="crm-notification-state is-error">
                <Inbox aria-hidden="true" />
                <strong>Notifikasi belum tersedia</strong>
                <span>{error}</span>
              </div>
            ) : data.items.length === 0 ? (
              passwordChangeRequired ? null : (
                <div className="crm-notification-state">
                  <Inbox aria-hidden="true" />
                  <strong>Belum ada notifikasi</strong>
                  <span>Aktivitas penting dari modul Anda akan muncul di sini.</span>
                </div>
              )
            ) : (
              <>
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
                          <time dateTime={item.createdAt}>{formatUiNotificationTime(item.createdAt)}</time>
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
              </>
            )}
          </div>

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
