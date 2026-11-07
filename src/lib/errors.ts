/**
 * שגיאות עסקיות של המערכת. נזרקות מה-DAL ומתורגמות ל-ActionResult בשכבת ה-Server Actions.
 * ההודעות בעברית כי הן מוצגות למשתמש כפי שהן.
 */
export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "READ_ONLY";

export type FieldErrors = Record<string, string[]>;

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly fieldErrors?: FieldErrors;

  constructor(code: AppErrorCode, message: string, fieldErrors?: FieldErrors) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function unauthenticated(): AppError {
  return new AppError("UNAUTHENTICATED", "יש להתחבר למערכת.");
}

export function forbidden(message = "אין לך הרשאה לבצע פעולה זו."): AppError {
  return new AppError("FORBIDDEN", message);
}

export function notFound(entity = "הרשומה"): AppError {
  return new AppError("NOT_FOUND", `${entity} לא נמצאה או שאין לך גישה אליה.`);
}

export function validationError(message: string, fieldErrors?: FieldErrors): AppError {
  return new AppError("VALIDATION", message, fieldErrors);
}

export function conflict(message: string): AppError {
  return new AppError("CONFLICT", message);
}

export function readOnly(message = "מחזור ההערכה סגור – הנתונים לקריאה בלבד."): AppError {
  return new AppError("READ_ONLY", message);
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
