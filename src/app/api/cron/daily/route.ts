import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { runDailyJobs } from "@/lib/dal/reminders";
import { errorResponse } from "@/lib/http/responses";

/**
 * משימה יומית: תזכורות ימים 4/7 + שליחת כל ההתראות הממתינות.
 *
 * מאובטח בכותרת:  Authorization: Bearer <CRON_SECRET>
 *  - Vercel Cron שולח אותה אוטומטית כשמוגדר CRON_SECRET בפרויקט (ראו vercel.json).
 *  - ב-Azure: Logic App / Function עם Timer Trigger שקורא ל-GET לכתובת זו עם אותה כותרת.
 * הנתיב מוחרג מ-proxy.ts (אין Session), לכן הבדיקה כאן היא שכבת ההגנה היחידה.
 */

export const maxDuration = 60;

const MIN_SECRET_LENGTH = 24;

function isAuthorized(request: NextRequest): boolean | "misconfigured" {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) return "misconfigured";
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

async function handle(request: NextRequest): Promise<Response> {
  const authorized = isAuthorized(request);
  if (authorized === "misconfigured") {
    console.error("[cron] CRON_SECRET is missing or shorter than 24 characters");
    return Response.json({ error: "CRON_NOT_CONFIGURED" }, { status: 503 });
  }
  if (!authorized) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const result = await runDailyJobs();
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export const GET = handle;
export const POST = handle;
