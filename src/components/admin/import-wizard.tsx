"use client";

import { useRef, useState, useTransition } from "react";
import { applyEmployeeImportAction, previewEmployeeImportAction } from "@/app/actions/admin-actions";
import type { ImportApplyResult, ImportPreview } from "@/lib/dal/employee-import";
import { Button } from "@/components/ui/button";
import { Alert, Badge, StatCard } from "@/components/ui/kit";
import { FormMessages } from "@/components/ui/action-form";

const ACTION_LABEL: Record<string, { label: string; tone: "success" | "info" | "muted" | "danger" }> = {
  CREATE: { label: "חדש", tone: "success" },
  UPDATE: { label: "עדכון", tone: "info" },
  UNCHANGED: { label: "ללא שינוי", tone: "muted" },
  ERROR: { label: "שגיאה", tone: "danger" },
};

/** ייבוא עובדים: העלאה → תצוגה מקדימה (ללא שמירה) → אישור ושמירה */
export function ImportWizard() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [applied, setApplied] = useState<ImportApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function formData(): FormData {
    const data = new FormData();
    if (file) data.set("file", file);
    return data;
  }

  function runPreview() {
    setError(null);
    setApplied(null);
    startTransition(async () => {
      const result = await previewEmployeeImportAction(formData());
      if (result.ok) setPreview(result.data);
      else {
        setPreview(null);
        setError(result.error.message);
      }
    });
  }

  function runApply() {
    if (!window.confirm("לשמור את השינויים במערכת?")) return;
    setError(null);
    startTransition(async () => {
      const result = await applyEmployeeImportAction(formData());
      if (result.ok) {
        setApplied(result.data);
        setPreview(null);
        setFile(null);
        if (fileInput.current) fileInput.current.value = "";
      } else setError(result.error.message);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-5 shadow-sm">
        <label className="flex-1 space-y-1.5">
          <span className="block text-sm font-medium">קובץ Excel (‎.xlsx, עד 1MB)</span>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="block w-full text-sm file:me-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:font-medium"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setPreview(null);
              setApplied(null);
            }}
          />
        </label>
        <Button type="button" disabled={!file || pending} onClick={runPreview}>
          {pending && !preview ? "בודק…" : "בדיקת הקובץ"}
        </Button>
      </div>

      <FormMessages error={error} />

      {applied ? (
        <Alert tone="success" title="הייבוא הושלם">
          נוספו {applied.created} עובדים, עודכנו {applied.updated}, ללא שינוי {applied.unchanged}
          {applied.departmentsCreated ? `, נוצרו ${applied.departmentsCreated} מחלקות חדשות` : ""}
          {applied.reassignedEvaluations ? `, ${applied.reassignedEvaluations} הערכות פתוחות הועברו למנהל החדש` : ""}.
        </Alert>
      ) : null}

      {preview ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <StatCard label="עובדים חדשים" value={preview.summary.create} tone="success" />
            <StatCard label="עדכונים" value={preview.summary.update} tone="info" />
            <StatCard label="ללא שינוי" value={preview.summary.unchanged} tone="muted" />
            <StatCard label="שורות עם שגיאות" value={preview.summary.errors} tone={preview.summary.errors ? "danger" : "neutral"} />
          </div>
          {preview.departmentsToCreate.length > 0 ? (
            <Alert tone="info">מחלקות חדשות שייווצרו: {preview.departmentsToCreate.join(", ")}</Alert>
          ) : null}
          {preview.canApply ? (
            <Alert tone="success" title="הקובץ תקין">
              בדקו את הטבלה ולחצו &quot;שמירה במערכת&quot;.
            </Alert>
          ) : (
            <Alert tone="danger" title="יש לתקן את השגיאות בקובץ ולהעלות אותו מחדש">
              לא נשמר דבר. השורות עם השגיאות מסומנות בטבלה.
            </Alert>
          )}
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {["שורה", "פעולה", "מס׳ עובד", "שם", "אימייל", "מחלקה", "מנהל ישיר", "הערות"].map((header) => (
                    <th key={header} className="bg-muted/60 px-3 py-2 text-start font-semibold whitespace-nowrap">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.rowNumber} className={row.action === "ERROR" ? "bg-red-50" : ""}>
                    <td className="border-t px-3 py-2 ltr-nums text-start">{row.rowNumber}</td>
                    <td className="border-t px-3 py-2">
                      <Badge tone={ACTION_LABEL[row.action].tone}>{ACTION_LABEL[row.action].label}</Badge>
                    </td>
                    <td className="border-t px-3 py-2">{row.employeeNumber}</td>
                    <td className="border-t px-3 py-2">{row.fullName}</td>
                    <td className="border-t px-3 py-2" dir="ltr">
                      {row.email}
                    </td>
                    <td className="border-t px-3 py-2">{row.department}</td>
                    <td className="border-t px-3 py-2" dir="ltr">
                      {row.managerEmail ?? ""}
                    </td>
                    <td className="border-t px-3 py-2 text-red-700">{row.errors.join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.canApply ? (
            <Button type="button" disabled={pending} onClick={runApply}>
              {pending ? "שומר…" : "שמירה במערכת"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
