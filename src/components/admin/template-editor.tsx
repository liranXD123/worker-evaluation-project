"use client";

import { useState } from "react";
import { updateTemplateAction } from "@/app/actions/admin-actions";
import { Button } from "@/components/ui/button";
import { FormMessages, useActionRunner } from "@/components/ui/action-form";
import { Field, inputClass } from "@/components/ui/kit";
import { cn } from "@/lib/utils";

export interface EditorCategory {
  key: string;
  name: string;
  nameEn: string;
  weight: number;
  questions: { text: string; helpText: string | null }[];
}

export interface EditorOpenQuestion {
  text: string;
  audience: "EMPLOYEE" | "MANAGER" | "BOTH";
}

const AUDIENCE_LABELS: Record<EditorOpenQuestion["audience"], string> = {
  EMPLOYEE: "לעובד",
  MANAGER: "למנהל",
  BOTH: "לשניהם",
};

/** עריכת שאלון שעדיין לא שויך למחזור (קטגוריות, משקלים, שאלות דירוג ושאלות פתוחות) */
export function TemplateEditor({
  templateId,
  initial,
}: {
  templateId: string;
  initial: { name: string; description: string | null; categories: EditorCategory[]; openQuestions: EditorOpenQuestion[] };
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? "");
  const [categories, setCategories] = useState<EditorCategory[]>(initial.categories);
  const [openQuestions, setOpenQuestions] = useState<EditorOpenQuestion[]>(initial.openQuestions);
  const { run, pending, error, success } = useActionRunner(updateTemplateAction);
  const totalWeight = categories.reduce((sum, category) => sum + (category.weight || 0), 0);

  const updateCategory = (index: number, patch: Partial<EditorCategory>) =>
    setCategories((current) => current.map((category, i) => (i === index ? { ...category, ...patch } : category)));

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        run({ templateId, name, description: description || null, categories, openQuestions }, { successMessage: "השאלון נשמר." });
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="שם השאלון" htmlFor="t-name">
          <input id="t-name" required className={inputClass} value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="תיאור" htmlFor="t-desc">
          <input id="t-desc" className={inputClass} value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold">קטגוריות ושאלות דירוג (1–5)</h3>
          <span className={cn("text-sm font-medium", totalWeight === 100 ? "text-emerald-700" : "text-amber-700")}>
            סכום משקלים: <span className="ltr-nums">{totalWeight}%</span> {totalWeight === 100 ? "✓" : "(נדרש 100%)"}
          </span>
        </div>
        {categories.map((category, index) => (
          <div key={index} className="space-y-3 rounded-lg border p-4">
            <div className="grid gap-3 md:grid-cols-[2fr_2fr_1fr_1fr_auto] md:items-end">
              <Field label="שם הקטגוריה" htmlFor={`cat-name-${index}`}>
                <input id={`cat-name-${index}`} required className={inputClass} value={category.name} onChange={(event) => updateCategory(index, { name: event.target.value })} />
              </Field>
              <Field label="שם באנגלית" htmlFor={`cat-en-${index}`}>
                <input id={`cat-en-${index}`} required dir="ltr" className={inputClass} value={category.nameEn} onChange={(event) => updateCategory(index, { nameEn: event.target.value })} />
              </Field>
              <Field label="מפתח (KEY)" htmlFor={`cat-key-${index}`}>
                <input
                  id={`cat-key-${index}`}
                  required
                  dir="ltr"
                  className={inputClass}
                  value={category.key}
                  onChange={(event) => updateCategory(index, { key: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "") })}
                />
              </Field>
              <Field label="משקל %" htmlFor={`cat-w-${index}`}>
                <input id={`cat-w-${index}`} type="number" min={1} max={100} required className={inputClass} value={category.weight || ""} onChange={(event) => updateCategory(index, { weight: Number(event.target.value) })} />
              </Field>
              <Button type="button" variant="ghost" size="sm" disabled={categories.length <= 1} onClick={() => setCategories((current) => current.filter((_, i) => i !== index))}>
                הסרה
              </Button>
            </div>
            <div className="space-y-2">
              {category.questions.map((question, questionIndex) => (
                <div key={questionIndex} className="flex gap-2">
                  <input
                    aria-label={`שאלה ${questionIndex + 1}`}
                    required
                    className={inputClass}
                    value={question.text}
                    onChange={(event) =>
                      updateCategory(index, {
                        questions: category.questions.map((item, i) => (i === questionIndex ? { ...item, text: event.target.value } : item)),
                      })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={category.questions.length <= 1}
                    onClick={() => updateCategory(index, { questions: category.questions.filter((_, i) => i !== questionIndex) })}
                  >
                    ✕
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => updateCategory(index, { questions: [...category.questions, { text: "", helpText: null }] })}>
                הוספת שאלה
              </Button>
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() => setCategories((current) => [...current, { key: `CATEGORY_${current.length + 1}`, name: "", nameEn: "", weight: 0, questions: [{ text: "", helpText: null }] }])}
        >
          הוספת קטגוריה
        </Button>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold">שאלות פתוחות</h3>
        {openQuestions.map((question, index) => (
          <div key={index} className="flex flex-wrap gap-2">
            <input
              aria-label={`שאלה פתוחה ${index + 1}`}
              required
              className={`${inputClass} min-w-64 flex-1`}
              value={question.text}
              onChange={(event) => setOpenQuestions((current) => current.map((item, i) => (i === index ? { ...item, text: event.target.value } : item)))}
            />
            <select
              aria-label="למי מוצגת השאלה"
              className={`${inputClass} w-auto`}
              value={question.audience}
              onChange={(event) =>
                setOpenQuestions((current) => current.map((item, i) => (i === index ? { ...item, audience: event.target.value as EditorOpenQuestion["audience"] } : item)))
              }
            >
              {Object.entries(AUDIENCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpenQuestions((current) => current.filter((_, i) => i !== index))}>
              ✕
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setOpenQuestions((current) => [...current, { text: "", audience: "EMPLOYEE" }])}>
          הוספת שאלה פתוחה
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? "שומר…" : "שמירת השאלון"}
        </Button>
        <FormMessages error={error} success={success} />
      </div>
    </form>
  );
}
