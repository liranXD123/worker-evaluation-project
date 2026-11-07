import { connection, type NextRequest } from "next/server";
import { exportEmployeesWorkbook } from "@/lib/dal/exports";
import { CONTENT_TYPES, errorResponse, fileResponse } from "@/lib/http/responses";

/** GET /api/exports/users – רשימת עובדים ב-Excel (בפורמט קובץ הייבוא). מנהל מערכת בלבד. */

export async function GET(_request: NextRequest): Promise<Response> {
  await connection();
  try {
    const file = await exportEmployeesWorkbook();
    return fileResponse(file.bytes, file.filename, CONTENT_TYPES.xlsx);
  } catch (error) {
    return errorResponse(error);
  }
}
