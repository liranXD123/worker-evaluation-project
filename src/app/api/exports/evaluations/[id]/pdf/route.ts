import type { NextRequest } from "next/server";
import { exportEvaluationPdf } from "@/lib/dal/exports";
import { CONTENT_TYPES, errorResponse, fileResponse } from "@/lib/http/responses";

/** GET /api/exports/evaluations/:id/pdf – דוח עובד ב-PDF (התוכן מסונן לפי הרשאות הצופה) */

export const maxDuration = 60;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const file = await exportEvaluationPdf(id);
    return fileResponse(file.bytes, file.filename, CONTENT_TYPES.pdf);
  } catch (error) {
    return errorResponse(error);
  }
}
