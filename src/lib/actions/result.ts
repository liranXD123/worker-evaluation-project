import "server-only";
import { unstable_rethrow } from "next/navigation";
import { isAppError, type AppErrorCode, type FieldErrors } from "@/lib/errors";

/**
 * תוצאה אחידה לכל Server Action. ה-UI מקבל הודעה בעברית ושגיאות לפי שדה, אף פעם לא stack trace.
 */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: AppErrorCode | "INTERNAL"; message: string; fieldErrors?: FieldErrors } };

export async function runAction<T>(operation: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await operation() };
  } catch (error) {
    unstable_rethrow(error);
    if (isAppError(error)) {
      return { ok: false, error: { code: error.code, message: error.message, fieldErrors: error.fieldErrors } };
    }
    console.error("[server-action] unexpected error", error);
    return {
      ok: false,
      error: { code: "INTERNAL", message: "אירעה שגיאה בלתי צפויה. נסו שוב או פנו למנהל המערכת." },
    };
  }
}
