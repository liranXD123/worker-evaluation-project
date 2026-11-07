"use client";

import { useState } from "react";
import { createCycleAction } from "@/app/actions/admin-actions";
import { Button } from "@/components/ui/button";
import { FormMessages, useActionRunner } from "@/components/ui/action-form";
import { Field, inputClass } from "@/components/ui/kit";

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function CreateCycleForm({ templates, today }: { templates: { id: string; label: string }[]; today: string }) {
  const [values, setValues] = useState({
    name: "הערכה שנתית",
    year: Number(today.slice(0, 4)),
    templateId: templates[0]?.id ?? "",
    startDate: today,
    selfAssessmentDueDate: addDays(today, 14),
    managerAssessmentDueDate: addDays(today, 28),
    endDate: addDays(today, 45),
  });
  const { run, pending, error, fieldErrors, success } = useActionRunner(createCycleAction);
  const set = (patch: Partial<typeof values>) => setValues((current) => ({ ...current, ...patch }));

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        run(values, { successMessage: "המחזור נוצר במצב טיוטה. לחצו \"פתיחת מחזור\" כדי לשלוח את המיילים לעובדים." });
      }}
    >
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="שם המחזור" htmlFor="c-name" error={fieldErrors.name?.[0]}>
          <input id="c-name" required className={inputClass} value={values.name} onChange={(event) => set({ name: event.target.value })} />
        </Field>
        <Field label="שנה" htmlFor="c-year" error={fieldErrors.year?.[0]}>
          <input id="c-year" type="number" required className={inputClass} value={values.year} onChange={(event) => set({ year: Number(event.target.value) })} />
        </Field>
        <Field label="שאלון" htmlFor="c-template" error={fieldErrors.templateId?.[0]}>
          <select id="c-template" required className={inputClass} value={values.templateId} onChange={(event) => set({ templateId: event.target.value })}>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="תאריך פתיחה" htmlFor="c-start" error={fieldErrors.startDate?.[0]}>
          <input id="c-start" type="date" required className={inputClass} value={values.startDate} onChange={(event) => set({ startDate: event.target.value })} />
        </Field>
        <Field label="מועד אחרון – הערכה עצמית" htmlFor="c-self" error={fieldErrors.selfAssessmentDueDate?.[0]}>
          <input id="c-self" type="date" required className={inputClass} value={values.selfAssessmentDueDate} onChange={(event) => set({ selfAssessmentDueDate: event.target.value })} />
        </Field>
        <Field label="מועד אחרון – הערכת מנהל" htmlFor="c-manager" error={fieldErrors.managerAssessmentDueDate?.[0]}>
          <input id="c-manager" type="date" required className={inputClass} value={values.managerAssessmentDueDate} onChange={(event) => set({ managerAssessmentDueDate: event.target.value })} />
        </Field>
        <Field label="תאריך סיום מתוכנן" htmlFor="c-end" error={fieldErrors.endDate?.[0]}>
          <input id="c-end" type="date" required className={inputClass} value={values.endDate} onChange={(event) => set({ endDate: event.target.value })} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || templates.length === 0}>
          {pending ? "יוצר…" : "יצירת מחזור (טיוטה)"}
        </Button>
        <FormMessages error={error} success={success} />
      </div>
    </form>
  );
}
