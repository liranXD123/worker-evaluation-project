import "server-only";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { isAppError, type AppErrorCode } from "@/lib/errors";

/**
 * טעינת נתונים בדף: לא מחובר → מסך התחברות, לא נמצא → 404,
 * ושגיאות הרשאה/עסקיות מוחזרות לתצוגה ידידותית במקום מסך שגיאה כללי.
 */
export type PageResult<T> = { ok: true; data: T } | { ok: false; code: AppErrorCode; message: string };

export async function loadPage<T>(load: () => Promise<T>): Promise<PageResult<T>> {
  // הדף תלוי במשתמש המחובר – תמיד מרונדר בזמן הבקשה
  await connection();
  try {
    return { ok: true, data: await load() };
  } catch (error) {
    if (isAppError(error)) {
      if (error.code === "UNAUTHENTICATED") redirect("/login");
      if (error.code === "NOT_FOUND") notFound();
      return { ok: false, code: error.code, message: error.message };
    }
    throw error;
  }
}
