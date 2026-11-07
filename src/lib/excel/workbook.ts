import "server-only";
import ExcelJS from "exceljs";

/** עזרי Excel משותפים: גיליונות מימין לשמאל, כותרת מעוצבת, סינון ושורת כותרת קפואה. */

export interface ColumnSpec<Row> {
  header: string;
  key: string;
  width: number;
  value: (row: Row) => string | number | Date | boolean | null;
  /** פורמט תצוגה ב-Excel, לדוגמה "dd/mm/yyyy" או "0.00" */
  numFmt?: string;
}

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial", size: 11 };

export function createWorkbook(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "מערכת הערכת עובדים";
  workbook.created = new Date();
  return workbook;
}

export function addTableSheet<Row>(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: readonly ColumnSpec<Row>[],
  rows: readonly Row[],
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(name, {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
  });
  sheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width,
    style: column.numFmt ? { numFmt: column.numFmt } : {},
  }));

  const header = sheet.getRow(1);
  header.font = HEADER_FONT;
  header.fill = HEADER_FILL;
  header.alignment = { vertical: "middle", horizontal: "right" };
  header.height = 22;

  for (const row of rows) {
    sheet.addRow(Object.fromEntries(columns.map((column) => [column.key, column.value(row)])));
  }

  if (rows.length > 0) {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  }
  return sheet;
}

/** גיליון מפתח–ערך (סיכומים, הוראות) */
export function addKeyValueSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  rows: readonly (readonly [string, string | number])[],
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(name, { views: [{ rightToLeft: true }] });
  sheet.columns = [
    { key: "label", width: 42 },
    { key: "value", width: 60 },
  ];
  for (const [label, value] of rows) {
    const row = sheet.addRow({ label, value });
    row.getCell("label").font = { bold: true, name: "Arial" };
    row.alignment = { horizontal: "right", wrapText: true, vertical: "top" };
  }
  return sheet;
}

export async function workbookToBytes(workbook: ExcelJS.Workbook): Promise<Uint8Array> {
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
