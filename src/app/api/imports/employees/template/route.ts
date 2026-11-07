import { connection, type NextRequest } from "next/server";
import { buildImportTemplate } from "@/lib/dal/employee-import";
import { CONTENT_TYPES, errorResponse, fileResponse } from "@/lib/http/responses";

/** GET /api/imports/employees/template – קובץ Excel ריק לייבוא עובדים, עם הוראות. מנהל מערכת בלבד. */

export async function GET(_request: NextRequest): Promise<Response> {
  await connection();
  try {
    const bytes = await buildImportTemplate();
    return fileResponse(bytes, "תבנית ייבוא עובדים.xlsx", CONTENT_TYPES.xlsx);
  } catch (error) {
    return errorResponse(error);
  }
}
