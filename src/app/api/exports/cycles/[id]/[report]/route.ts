import type { NextRequest } from "next/server";
import { exportCycleReport, isCycleReportKey } from "@/lib/dal/exports";
import { CONTENT_TYPES, errorResponse, fileResponse } from "@/lib/http/responses";

/** GET /api/exports/cycles/:id/:report – דוחות HR ב-Excel: departments | goals | high-potential */

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; report: string }> }): Promise<Response> {
  try {
    const { id, report } = await params;
    if (!isCycleReportKey(report)) {
      return Response.json({ error: "NOT_FOUND", message: "דוח לא מוכר." }, { status: 404 });
    }
    const file = await exportCycleReport(id, report);
    return fileResponse(file.bytes, file.filename, CONTENT_TYPES.xlsx);
  } catch (error) {
    return errorResponse(error);
  }
}
