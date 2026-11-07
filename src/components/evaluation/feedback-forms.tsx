"use client";

import { useState } from "react";
import {
  acknowledgeFeedbackAction,
  saveFeedbackSummaryAction,
  saveGoalsAction,
  scheduleFeedbackMeetingAction,
} from "@/app/actions/evaluation-actions";
import { Button } from "@/components/ui/button";
import { FormMessages, useActionRunner } from "@/components/ui/action-form";
import { Field, inputClass } from "@/components/ui/kit";
import { toDateInputValue, toDateTimeInputValue } from "@/lib/format";
import { cn } from "@/lib/utils";

// -----------------------------------------------------------------------------
// קביעת מועד שיחה
// -----------------------------------------------------------------------------

export function ScheduleMeetingForm({
  evaluationId,
  scheduledAt,
  location,
}: {
  evaluationId: string;
  scheduledAt: Date | null;
  location: string | null;
}) {
  const [when, setWhen] = useState(toDateTimeInputValue(scheduledAt));
  const [where, setWhere] = useState(location ?? "");
  const { run, pending, error, fieldErrors, success } = useActionRunner(scheduleFeedbackMeetingAction);

  return (
    <form
      className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        if (!when) return;
        run(
          { evaluationId, scheduledAt: new Date(when).toISOString(), location: where || null },
          { successMessage: "מועד השיחה נשמר. העובד/ת יקבל/תקבל תזכורת יום לפני." },
        );
      }}
    >
      <Field label="מועד השיחה" htmlFor="meeting-when" error={fieldErrors.scheduledAt?.[0]}>
        <input id="meeting-when" type="datetime-local" required className={inputClass} value={when} onChange={(event) => setWhen(event.target.value)} />
      </Field>
      <Field label="מיקום" htmlFor="meeting-where">
        <input
          id="meeting-where"
          className={inputClass}
          placeholder="חדר ישיבות / Teams"
          value={where}
          maxLength={200}
          onChange={(event) => setWhere(event.target.value)}
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "שומר…" : scheduledAt ? "עדכון מועד" : "קביעת שיחה"}
      </Button>
      <div className="sm:col-span-3">
        <FormMessages error={error} success={success} />
      </div>
    </form>
  );
}

// -----------------------------------------------------------------------------
// סיכום שיחה
// -----------------------------------------------------------------------------

export interface FeedbackFields {
  heldAt: Date | null;
  achievements: string | null;
  strengths: string | null;
  improvementAreas: string | null;
  developmentOpportunities: string | null;
  summary: string | null;
  managerComments: string | null;
  employeeComments: string | null;
}

const SUMMARY_FIELDS: readonly { key: Exclude<keyof FeedbackFields, "heldAt">; label: string; required: boolean }[] = [
  { key: "achievements", label: "הישגים מרכזיים", required: true },
  { key: "strengths", label: "חוזקות", required: true },
  { key: "improvementAreas", label: "תחומי שיפור", required: true },
  { key: "developmentOpportunities", label: "הזדמנויות פיתוח", required: false },
  { key: "summary", label: "סיכום שיחה", required: true },
  { key: "managerComments", label: "הערות מנהל", required: false },
  { key: "employeeComments", label: "הערות העובד", required: false },
];

export function FeedbackSummaryForm({ evaluationId, initial }: { evaluationId: string; initial: FeedbackFields }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(SUMMARY_FIELDS.map(({ key }) => [key, initial[key] ?? ""])),
  );
  const [heldAt, setHeldAt] = useState(toDateInputValue(initial.heldAt));
  const { run, pending, error, success } = useActionRunner(saveFeedbackSummaryAction);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        run(
          {
            evaluationId,
            heldAt: heldAt ? new Date(`${heldAt}T12:00:00`).toISOString() : null,
            ...Object.fromEntries(SUMMARY_FIELDS.map(({ key }) => [key, values[key]?.trim() || null])),
          },
          { successMessage: "סיכום השיחה נשמר." },
        );
      }}
    >
      <div className="max-w-xs">
        <Field label="תאריך קיום השיחה" htmlFor="held-at">
          <input id="held-at" type="date" className={inputClass} value={heldAt} onChange={(event) => setHeldAt(event.target.value)} />
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {SUMMARY_FIELDS.map(({ key, label, required }) => (
          <Field key={key} label={required ? `${label} *` : label} htmlFor={`fb-${key}`}>
            <textarea
              id={`fb-${key}`}
              rows={4}
              className={inputClass}
              value={values[key] ?? ""}
              maxLength={10000}
              onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
            />
          </Field>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">שדות המסומנים ב-* נדרשים לפני אישור הסיכום. ניתן לשמור ולחזור לעריכה בכל שלב.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "שומר…" : "שמירת סיכום"}
        </Button>
        <FormMessages error={error} success={success} />
      </div>
    </form>
  );
}

// -----------------------------------------------------------------------------
// יעדים לשנה הבאה
// -----------------------------------------------------------------------------

interface GoalDraft {
  title: string;
  description: string;
  kpi: string;
  weight: number;
  dueDate: string;
}

export interface GoalInitial {
  title: string;
  description: string;
  kpi: string;
  weight: number;
  dueDate: Date;
}

const EMPTY_GOAL = (dueDate: string): GoalDraft => ({ title: "", description: "", kpi: "", weight: 0, dueDate });

export function GoalsEditor({ evaluationId, initial, defaultDueDate }: { evaluationId: string; initial: GoalInitial[]; defaultDueDate: string }) {
  const [goals, setGoals] = useState<GoalDraft[]>(() =>
    initial.length > 0
      ? initial.map((goal) => ({ ...goal, dueDate: toDateInputValue(goal.dueDate) }))
      : [EMPTY_GOAL(defaultDueDate), EMPTY_GOAL(defaultDueDate), EMPTY_GOAL(defaultDueDate)],
  );
  const { run, pending, error, fieldErrors, success } = useActionRunner(saveGoalsAction);
  const total = goals.reduce((sum, goal) => sum + (Number.isFinite(goal.weight) ? goal.weight : 0), 0);

  function update(index: number, patch: Partial<GoalDraft>) {
    setGoals((current) => current.map((goal, i) => (i === index ? { ...goal, ...patch } : goal)));
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        run(
          {
            evaluationId,
            goals: goals.map((goal) => ({ ...goal, dueDate: new Date(`${goal.dueDate}T12:00:00`).toISOString() })),
          },
          { successMessage: "היעדים נשמרו." },
        );
      }}
    >
      {goals.map((goal, index) => (
        <div key={index} className="rounded-lg border p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-semibold">יעד {index + 1}</p>
            {goals.length > 3 ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setGoals((current) => current.filter((_, i) => i !== index))}>
                הסרה
              </Button>
            ) : null}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="שם היעד" htmlFor={`g-title-${index}`} error={fieldErrors[`goals.${index}.title`]?.[0]}>
              <input id={`g-title-${index}`} required className={inputClass} value={goal.title} maxLength={200} onChange={(event) => update(index, { title: event.target.value })} />
            </Field>
            <Field label="מדד הצלחה (KPI)" htmlFor={`g-kpi-${index}`} error={fieldErrors[`goals.${index}.kpi`]?.[0]}>
              <input id={`g-kpi-${index}`} required className={inputClass} value={goal.kpi} maxLength={500} onChange={(event) => update(index, { kpi: event.target.value })} />
            </Field>
            <div className="md:col-span-2">
              <Field label="תיאור" htmlFor={`g-desc-${index}`} error={fieldErrors[`goals.${index}.description`]?.[0]}>
                <textarea id={`g-desc-${index}`} required rows={2} className={inputClass} value={goal.description} maxLength={2000} onChange={(event) => update(index, { description: event.target.value })} />
              </Field>
            </div>
            <Field label="משקל (%)" htmlFor={`g-weight-${index}`} error={fieldErrors[`goals.${index}.weight`]?.[0]}>
              <input
                id={`g-weight-${index}`}
                type="number"
                min={1}
                max={100}
                required
                className={inputClass}
                value={goal.weight || ""}
                onChange={(event) => update(index, { weight: Number(event.target.value) })}
              />
            </Field>
            <Field label="תאריך יעד" htmlFor={`g-due-${index}`} error={fieldErrors[`goals.${index}.dueDate`]?.[0]}>
              <input id={`g-due-${index}`} type="date" required className={inputClass} value={goal.dueDate} onChange={(event) => update(index, { dueDate: event.target.value })} />
            </Field>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {goals.length < 5 ? (
            <Button type="button" variant="outline" onClick={() => setGoals((current) => [...current, EMPTY_GOAL(defaultDueDate)])}>
              הוספת יעד
            </Button>
          ) : null}
          <span className={cn("text-sm font-medium", total === 100 ? "text-emerald-700" : "text-amber-700")}>
            סכום משקלים: <span className="ltr-nums">{total}%</span> {total === 100 ? "✓" : "(נדרש 100%)"}
          </span>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "שומר…" : "שמירת יעדים"}
        </Button>
      </div>
      <FormMessages error={error ?? fieldErrors.goals?.[0] ?? null} success={success} />
    </form>
  );
}

// -----------------------------------------------------------------------------
// אישור קריאה ע"י העובד
// -----------------------------------------------------------------------------

export function AcknowledgeForm({ evaluationId }: { evaluationId: string }) {
  const [comments, setComments] = useState("");
  const { run, pending, error, success } = useActionRunner(acknowledgeFeedbackAction);
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        run({ evaluationId, employeeComments: comments.trim() || null }, { successMessage: "תודה! אישור הקריאה נשמר." });
      }}
    >
      <Field label="הערות שלך (לא חובה)" htmlFor="ack-comments">
        <textarea id="ack-comments" rows={3} className={inputClass} value={comments} maxLength={10000} onChange={(event) => setComments(event.target.value)} />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "שומר…" : "קראתי ואני מאשר/ת"}
        </Button>
        <FormMessages error={error} success={success} />
      </div>
    </form>
  );
}
