/**
 * חוקי התזכורות (SPEC §6) – קובץ טהור לבדיקה קלה.
 *
 * ימים נספרים לפי ימים קלנדריים בשעון ישראל: יום 0 = יום האירוע (פתיחת מחזור / הגשת העובד).
 * אם ה-Cron פספס יום, נשלחת רק התזכורת העדכנית ביותר (לא שתיים באותו יום).
 */

export const REMINDER_TIME_ZONE = "Asia/Jerusalem";
export const FIRST_REMINDER_DAY = 4;
export const SECOND_REMINDER_DAY = 7;
/** כמה ימים אחרי הגשת המנהל להזכיר לקבוע שיחת משוב אם טרם נקבעה */
export const MEETING_NOT_SCHEDULED_DAY = 4;

const DAY_MS = 24 * 60 * 60 * 1000;
const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: REMINDER_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function calendarDayIndex(date: Date): number {
  const [year, month, day] = dayKeyFormatter.format(date).split("-").map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

/** מספר הימים הקלנדריים (שעון ישראל) בין שני רגעים */
export function calendarDaysBetween(from: Date, to: Date): number {
  return calendarDayIndex(to) - calendarDayIndex(from);
}

export type ReminderLevel = 1 | 2;

export function dueReminderLevel(daysElapsed: number): ReminderLevel | null {
  if (daysElapsed >= SECOND_REMINDER_DAY) return 2;
  if (daysElapsed >= FIRST_REMINDER_DAY) return 1;
  return null;
}
