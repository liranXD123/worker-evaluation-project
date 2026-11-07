import "server-only";
import { after } from "next/server";
import { dispatchDueNotifications } from "@/lib/dal/notification-dispatch";

/**
 * שליחה מיידית של התראות שנכנסו לתור בפעולה הנוכחית, אחרי שהתשובה כבר נשלחה למשתמש.
 * כך "עובד השלים הערכה עצמית" מגיע למנהל תוך שניות ולא רק בריצת ה-Cron היומית.
 * כישלון כאן לא משפיע על המשתמש – ה-Cron היומי ינסה שוב.
 */
export function dispatchNotificationsAfterResponse(): void {
  after(async () => {
    try {
      await dispatchDueNotifications({ limit: 50 });
    } catch (error) {
      console.error("[notifications] immediate dispatch failed; the daily cron will retry", error);
    }
  });
}
