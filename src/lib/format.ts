/** עיצוב ערכים לתצוגה (עברית, שעון ישראל). בטוח לשימוש גם בקומפוננטות לקוח. */

const TIME_ZONE = "Asia/Jerusalem";
const dateFormatter = new Intl.DateTimeFormat("he-IL", { dateStyle: "medium", timeZone: TIME_ZONE });
const dateTimeFormatter = new Intl.DateTimeFormat("he-IL", { dateStyle: "medium", timeStyle: "short", timeZone: TIME_ZONE });
const isoDateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return dateFormatter.format(new Date(value));
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return dateTimeFormatter.format(new Date(value));
}

export function formatScore(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toFixed(2);
}

export function formatGap(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value > 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
}

export function formatPercent(part: number, total: number): string {
  return total === 0 ? "0%" : `${Math.round((part / total) * 100)}%`;
}

/** YYYY-MM-DD לפי שעון ישראל – לשדות <input type="date"> */
export function toDateInputValue(value: Date | string | null | undefined): string {
  if (!value) return "";
  return isoDateFormatter.format(new Date(value));
}

/** YYYY-MM-DDTHH:mm לפי שעון ישראל – לשדות <input type="datetime-local"> */
export function toDateTimeInputValue(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
