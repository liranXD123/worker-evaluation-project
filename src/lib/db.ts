import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";

/**
 * Prisma Client יחיד לכל התהליך.
 * בפיתוח שומרים אותו על globalThis כדי ש-HMR לא יפתח מאגר חיבורים חדש בכל שמירה.
 * מותר לייבא קובץ זה רק מתוך src/lib/dal ו-src/auth.ts (ראו CLAUDE.md).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not defined");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/** לקוח רגיל או לקוח טרנזקציה – לפונקציות שצריכות לרוץ בשני ההקשרים. */
export type DbClient = PrismaClient | Prisma.TransactionClient;

/** הפרת אילוץ ייחודיות (P2002) */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function decimalToNumber(value: Prisma.Decimal | null | undefined): number | null {
  return value === null || value === undefined ? null : value.toNumber();
}
