const UI_LOCALE = "id-ID";
const UI_TIME_ZONE = "Asia/Makassar";

const dateFormatter = new Intl.DateTimeFormat(UI_LOCALE, {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: UI_TIME_ZONE,
});

const dateTimeFormatter = new Intl.DateTimeFormat(UI_LOCALE, {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: UI_TIME_ZONE,
});

const notificationTimeFormatter = new Intl.DateTimeFormat(UI_LOCALE, {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: UI_TIME_ZONE,
});

const timeFormatter = new Intl.DateTimeFormat(UI_LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: UI_TIME_ZONE,
});

function toValidDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatUiDate(value: Date | string | null | undefined, fallback = "—") {
  const date = toValidDate(value);
  return date ? dateFormatter.format(date) : fallback;
}

export function formatUiDateTime(value: Date | string | null | undefined, fallback = "—") {
  const date = toValidDate(value);
  return date ? dateTimeFormatter.format(date) : fallback;
}

export function formatUiNotificationTime(value: Date | string | null | undefined, fallback = "Waktu tidak tersedia") {
  const date = toValidDate(value);
  return date ? notificationTimeFormatter.format(date) : fallback;
}

export function formatUiTime(value: Date | string | null | undefined, fallback = "belum tersedia") {
  const date = toValidDate(value);
  return date ? timeFormatter.format(date) : fallback;
}
