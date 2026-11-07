import "server-only";
import { isAppError, type AppErrorCode } from "@/lib/errors";

/** תשובות HTTP אחידות ל-Route Handlers (ייצוא/ייבוא/Cron). */

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  READ_ONLY: 409,
};

export function errorResponse(error: unknown): Response {
  if (isAppError(error)) {
    return Response.json({ error: error.code, message: error.message }, { status: STATUS_BY_CODE[error.code] });
  }
  console.error("[route] unexpected error", error);
  return Response.json({ error: "INTERNAL", message: "אירעה שגיאה בלתי צפויה." }, { status: 500 });
}

export const CONTENT_TYPES = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;

/** קובץ להורדה, עם שם בעברית (RFC 5987) ושם חלופי ב-ASCII לדפדפנים ישנים. */
export function fileResponse(bytes: Uint8Array, filename: string, contentType: string): Response {
  const extension = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")) : "";
  const asciiFallback = `download${extension}`;
  const body = new Uint8Array(bytes);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.byteLength),
      "Content-Disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** מנקה תווים שאסורים בשמות קבצים ב-Windows */
export function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
}
