import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * הצפנת שדות טקסט חופשי רגישים (תשובות פתוחות, סיכומי שיחת משוב) ב-AES-256-GCM.
 *
 * פורמט ערך מוצפן: "enc:v1:<iv>:<authTag>:<ciphertext>" (כל חלק ב-base64).
 * ערך ללא הקידומת מוחזר כפי שהוא – כך נתוני seed/נתונים ישנים בטקסט גלוי עדיין נקראים.
 *
 * מפתח: FIELD_ENCRYPTION_KEY = 32 בתים בקידוד base64
 *   יצירה: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */
const PREFIX = "enc:v1:";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("FIELD_ENCRYPTION_KEY is not defined");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("FIELD_ENCRYPTION_KEY must be 32 bytes encoded as base64");
  }
  cachedKey = key;
  return key;
}

export function encryptText(plainText: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptText(value: string): string {
  if (!value.startsWith(PREFIX)) return value;
  const parts = value.slice(PREFIX.length).split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted value");
  }
  const [ivPart, tagPart, dataPart] = parts;
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivPart, "base64"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataPart, "base64")), decipher.final()]);
  return decrypted.toString("utf8");
}

/** מחרוזת ריקה / null נשמרים כ-null. */
export function encryptNullable(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : encryptText(trimmed);
}

export function decryptNullable(value: string | null | undefined): string | null {
  return value === null || value === undefined ? null : decryptText(value);
}
