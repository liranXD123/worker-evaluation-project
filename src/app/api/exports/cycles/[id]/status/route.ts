import type { NextRequest } from "next/server";
import { exportCycleStatusWorkbook } from "@/lib/dal/exports";
import { CONTENT_TYPES, errorResponse, fileResponse } from "@/lib/http/responses";

/** GET /api/exports/cycles/:id/status – סטטוס מחזור ב-Excel (HR: כל הארגון, מנהל: כפיפים ישירים) */

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const file = await exportCycleStatusWorkbook(id);
    return fileResponse(file.bytes, file.filename, CONTENT_TYPES.xlsx);
  } catch (error) {
    return errorResponse(error);
  }
}
