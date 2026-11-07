/**
 * אתר הדגמה: ממלא נתוני דמה רק אם מסד הנתונים ריק (בהפעלה הראשונה).
 * כך נתונים שהוזנו בהדגמה לא נמחקים בכל הפעלה מחדש של השרת.
 * רץ רק כאשר DEMO_MODE="true" – באתר אמיתי הסקריפט לא עושה דבר.
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function main(): Promise<void> {
  if (process.env.DEMO_MODE !== "true") return;
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const users = await prisma.user.count();
  await prisma.$disconnect();
  if (users > 0) {
    console.log(`[demo] מסד הנתונים כבר מכיל ${users} משתמשים – לא נוצרים נתוני דמה`);
    return;
  }
  console.log("[demo] מסד נתונים ריק – יוצר נתוני דמה...");
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
}

main().catch((error) => {
  console.error("[demo] יצירת נתוני הדמה נכשלה:", error);
  process.exitCode = 1;
});
