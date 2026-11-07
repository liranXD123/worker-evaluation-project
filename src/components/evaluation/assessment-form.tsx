"use client";

import { useMemo, useState } from "react";
import { saveManagerAssessmentAction, saveSelfAssessmentAction } from "@/app/actions/evaluation-actions";
import { Button } from "@/components/ui/button";
import { FormMessages, useActionRunner } from "@/components/ui/action-form";
import { inputClass, ProgressBar } from "@/components/ui/kit";
import { cn } from "@/lib/utils";
import type { SaveAssessmentResult } from "@/lib/dal/assessments";

/** טופס הערכה – משמש גם להערכה עצמית וגם להערכת מנהל */

interface FormCategory {
  id: string;
  name: string;
  weight: number;
}

interface FormQuestion {
  id: string;
  text: string;
  helpText: string | null;
  type: "RATING" | "OPEN_TEXT";
  isRequired: boolean;
  categoryId: string | null;
}

interface FormAnswer {
  questionId: string;
  score: number | null;
  textAnswer: string | null;
}

const SCALE: readonly { value: number; label: string }[] = [
  { value: 1, label: "לא עומד בציפיות" },
  { value: 2, label: "עומד חלקית" },
  { value: 3, label: "עומד בציפיות" },
  { value: 4, label: "מעל הציפיות" },
  { value: 5, label: "מעל ומעבר" },
];

export function AssessmentForm({
  mode,
  evaluationId,
  categories,
  questions,
  initialAnswers,
  initialHighPotential = false,
}: {
  mode: "EMPLOYEE" | "MANAGER";
  evaluationId: string;
  categories: FormCategory[];
  questions: FormQuestion[];
  initialAnswers: FormAnswer[];
  initialHighPotential?: boolean;
}) {
  const [scores, setScores] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(initialAnswers.map((answer) => [answer.questionId, answer.score])),
  );
  const [texts, setTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialAnswers.map((answer) => [answer.questionId, answer.textAnswer ?? ""])),
  );
  const [highPotential, setHighPotential] = useState(initialHighPotential);
  const [dirty, setDirty] = useState(false);

  const isManager = mode === "MANAGER";
  const { run, pending, error, fieldErrors, success } = useActionRunner<unknown, SaveAssessmentResult>(
    isManager ? saveManagerAssessmentAction : saveSelfAssessmentAction,
  );

  const ratingQuestions = questions.filter((question) => question.type === "RATING");
  const openQuestions = questions.filter((question) => question.type === "OPEN_TEXT");
  const answeredCount = ratingQuestions.filter((question) => scores[question.id]).length;

  const byCategory = useMemo(
    () => categories.map((category) => ({ category, items: ratingQuestions.filter((question) => question.categoryId === category.id) })),
    [categories, ratingQuestions],
  );

  function buildPayload(submit: boolean) {
    return {
      evaluationId,
      submit,
      answers: questions.map((question) =>
        question.type === "RATING"
          ? { questionId: question.id, score: scores[question.id] ?? null }
          : { questionId: question.id, textAnswer: texts[question.id]?.trim() || null },
      ),
      ...(isManager ? { isHighPotential: highPotential } : {}),
    };
  }

  function save(submit: boolean) {
    if (submit) {
      const missing = ratingQuestions.length - answeredCount;
      if (missing > 0) {
        window.alert(`יש לדרג את כל השאלות לפני השליחה (חסרות ${missing}).`);
        return;
      }
      const confirmText = isManager
        ? "לאחר שליחת הערכת המנהל לא ניתן יהיה לערוך אותה, ויוצגו לך תשובות העובד והדוח ההשוואתי. לשלוח?"
        : "לאחר השליחה לא ניתן יהיה לערוך את ההערכה, והמנהל/ת יקבל/תקבל הודעה. לשלוח?";
      if (!window.confirm(confirmText)) return;
    }
    run(buildPayload(submit), {
      successMessage: submit ? "ההערכה נשלחה בהצלחה." : "הטיוטה נשמרה.",
      onSuccess: () => setDirty(false),
    });
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        save(true);
      }}
    >
      <div className="sticky top-[68px] z-10 rounded-xl border bg-card/95 p-4 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-48 flex-1">
            <p className="text-sm font-medium">
              התקדמות: <span className="ltr-nums">{answeredCount} / {ratingQuestions.length}</span> שאלות דירוג
            </p>
            <ProgressBar value={answeredCount} max={ratingQuestions.length} className="mt-2" />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => save(false)}>
              {pending ? "שומר…" : "שמירת טיוטה"}
            </Button>
            <Button type="submit" disabled={pending}>
              {isManager ? "שליחת הערכת מנהל" : "שליחת הערכה"}
            </Button>
          </div>
        </div>
        {dirty ? <p className="mt-2 text-xs text-amber-700">יש שינויים שלא נשמרו.</p> : null}
        <div className="mt-2">
          <FormMessages error={error} success={success} />
        </div>
      </div>

      {byCategory.map(({ category, items }) => (
        <fieldset key={category.id} className="rounded-xl border bg-card p-5 shadow-sm">
          <legend className="sr-only">{category.name}</legend>
          <div className="mb-4 flex items-baseline justify-between gap-2">
            <h3 className="text-lg font-semibold">{category.name}</h3>
            <span className="text-sm text-muted-foreground">
              משקל <span className="ltr-nums">{category.weight}%</span>
            </span>
          </div>
          <div className="space-y-5">
            {items.map((question) => {
              const selected = scores[question.id] ?? null;
              const questionError = fieldErrors[question.id]?.[0];
              return (
                <div key={question.id} className="space-y-2">
                  <p className="font-medium">{question.text}</p>
                  {question.helpText ? <p className="text-xs text-muted-foreground">{question.helpText}</p> : null}
                  <div role="radiogroup" aria-label={question.text} className="grid grid-cols-5 gap-1.5 sm:gap-2">
                    {SCALE.map((option) => (
                      <label
                        key={option.value}
                        className={cn(
                          "flex cursor-pointer flex-col items-center gap-1 rounded-lg border px-1 py-2 text-center transition",
                          selected === option.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                        )}
                      >
                        <input
                          type="radio"
                          className="sr-only"
                          name={question.id}
                          value={option.value}
                          checked={selected === option.value}
                          onChange={() => {
                            setScores((current) => ({ ...current, [question.id]: option.value }));
                            setDirty(true);
                          }}
                        />
                        <span className="text-lg font-bold">{option.value}</span>
                        <span className="hidden text-[11px] leading-tight sm:block">{option.label}</span>
                      </label>
                    ))}
                  </div>
                  {questionError ? <p className="text-xs text-red-600">{questionError}</p> : null}
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}

      {openQuestions.length > 0 ? (
        <fieldset className="rounded-xl border bg-card p-5 shadow-sm">
          <legend className="sr-only">שאלות פתוחות</legend>
          <h3 className="mb-4 text-lg font-semibold">שאלות פתוחות</h3>
          <div className="space-y-5">
            {openQuestions.map((question) => (
              <div key={question.id} className="space-y-1.5">
                <label htmlFor={`q-${question.id}`} className="block font-medium">
                  {question.text}
                  {question.isRequired ? <span className="text-red-600"> *</span> : null}
                </label>
                <textarea
                  id={`q-${question.id}`}
                  rows={4}
                  className={inputClass}
                  value={texts[question.id] ?? ""}
                  maxLength={5000}
                  onChange={(event) => {
                    setTexts((current) => ({ ...current, [question.id]: event.target.value }));
                    setDirty(true);
                  }}
                />
                {fieldErrors[question.id]?.[0] ? <p className="text-xs text-red-600">{fieldErrors[question.id][0]}</p> : null}
              </div>
            ))}
          </div>
        </fieldset>
      ) : null}

      {isManager ? (
        <label className="flex items-start gap-3 rounded-xl border bg-card p-5 shadow-sm">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-[var(--primary)]"
            checked={highPotential}
            onChange={(event) => {
              setHighPotential(event.target.checked);
              setDirty(true);
            }}
          />
          <span>
            <span className="block font-medium">עובד/ת בעל/ת פוטנציאל גבוה</span>
            <span className="text-sm text-muted-foreground">הסימון מופיע בדוח הפוטנציאל הגבוה של משאבי אנוש ואינו מוצג לעובד.</span>
          </span>
        </label>
      ) : null}
    </form>
  );
}
