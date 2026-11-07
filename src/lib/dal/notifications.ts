import "server-only";
import { NotificationStatus, type NotificationType } from "@/generated/prisma/enums";
import type { DbClient } from "@/lib/db";
import type { NotificationContent } from "@/lib/notifications/templates";

/**
 * תור ההתראות. ה-DAL רק מוסיף רשומות PENDING; שירות השליחה וה-Cron (שלב 3) שולחים בפועל.
 * dedupeKey ייחודי מבטיח שאותה התראה לא תיווצר/תישלח פעמיים.
 */

export interface NotificationDraft {
  type: NotificationType;
  recipientId: string;
  content: NotificationContent;
  cycleId?: string | null;
  evaluationId?: string | null;
  scheduledAt?: Date;
  /** ברירת מחדל: "<evaluationId|cycleId>:<type>:<recipientId>" */
  dedupeKey?: string;
}

export function buildDedupeKey(scopeId: string, type: NotificationType, recipientId: string, suffix?: string): string {
  return [scopeId, type, recipientId, suffix].filter(Boolean).join(":");
}

export async function enqueueNotifications(db: DbClient, drafts: readonly NotificationDraft[]): Promise<number> {
  if (drafts.length === 0) return 0;
  const result = await db.notification.createMany({
    data: drafts.map((draft) => {
      const scopeId = draft.evaluationId ?? draft.cycleId ?? "global";
      return {
        type: draft.type,
        status: NotificationStatus.PENDING,
        dedupeKey: draft.dedupeKey ?? buildDedupeKey(scopeId, draft.type, draft.recipientId),
        subject: draft.content.subject,
        body: draft.content.body,
        recipientId: draft.recipientId,
        cycleId: draft.cycleId ?? null,
        evaluationId: draft.evaluationId ?? null,
        scheduledAt: draft.scheduledAt ?? new Date(),
      };
    }),
    skipDuplicates: true,
  });
  return result.count;
}

/** ביטול התראות שטרם נשלחו (למשל בשינוי מועד שיחה או בסגירת מחזור). */
export async function cancelPendingNotifications(
  db: DbClient,
  where: { evaluationId?: string; cycleId?: string; type?: NotificationType },
): Promise<number> {
  const result = await db.notification.deleteMany({
    where: { ...where, status: NotificationStatus.PENDING },
  });
  return result.count;
}
