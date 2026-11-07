import { QuestionType } from "@/generated/prisma/enums";
import type { EvaluationDetailDTO, AnswerDTO } from "@/lib/dal/evaluations";
import type { FeedbackMeetingDTO } from "@/lib/dal/feedback";
import type { GoalDTO } from "@/lib/dal/goals";
import { buildComparison, computeCategoryScores, type ScoringCategory, type ScoringQuestion } from "@/lib/domain/scoring";
import { escapeHtml } from "@/lib/mail/render";

/**
 * HTML של "דוח עובד" להדפסה ל-PDF.
 * מציג רק את מה שה-DTOs מכילים – וה-DTOs כבר סוננו ב-DAL לפי הרשאות וחוק הסודיות,
 * כך שאותו דוח בדיוק מציג פחות מידע לעובד לפני אישור הסיכום, ויותר למנהל/HR.
 */

export interface EvaluationReportInput {
  detail: EvaluationDetailDTO;
  feedback: FeedbackMeetingDTO | null;
  goals: GoalDTO[] | null;
  generatedAt: Date;
  generatedBy: string;
  fontCss: string;
}

const dateFormatter = new Intl.DateTimeFormat("he-IL", { dateStyle: "medium", timeZone: "Asia/Jerusalem" });
const dateTimeFormatter = new Intl.DateTimeFormat("he-IL", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jerusalem" });

function formatDate(date: Date | null): string {
  return date ? dateFormatter.format(date) : "—";
}

function formatScore(score: number | null): string {
  return score === null ? "—" : score.toFixed(2);
}

function formatGap(gap: number | null): string {
  if (gap === null) return "—";
  return gap > 0 ? `+${gap.toFixed(2)}` : gap.toFixed(2);
}

function text(value: string | null | undefined): string {
  if (!value) return '<span class="muted">—</span>';
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function scoringInputs(detail: EvaluationDetailDTO): { categories: ScoringCategory[]; questions: ScoringQuestion[] } {
  return {
    categories: detail.categories.map((category) => ({
      id: category.id,
      key: category.key,
      name: category.name,
      weight: category.weight,
      order: category.order,
    })),
    questions: detail.questions
      .filter((question): question is typeof question & { categoryId: string } => question.type === QuestionType.RATING && question.categoryId !== null)
      .map((question) => ({ id: question.id, categoryId: question.categoryId, text: question.text, order: question.order })),
  };
}

function scoreMap(answers: AnswerDTO[] | null): Map<string, number> {
  return new Map((answers ?? []).filter((answer) => answer.score !== null).map((answer) => [answer.questionId, answer.score as number]));
}

function scoresSection(detail: EvaluationDetailDTO): string {
  const { categories, questions } = scoringInputs(detail);
  const showEmployee = detail.employeeAnswers !== null;
  const showManager = detail.managerAnswers !== null;
  if (!showEmployee && !showManager) return "";

  if (showEmployee && showManager && detail.permissions.canViewComparison) {
    const comparison = buildComparison(categories, questions, scoreMap(detail.employeeAnswers), scoreMap(detail.managerAnswers));
    const rows = comparison.categories
      .map(
        (row) => `<tr class="${row.isSignificantGap ? "gap" : ""}">
          <td>${escapeHtml(row.label)}</td><td class="num">${row.weight}%</td>
          <td class="num">${formatScore(row.employeeScore)}</td><td class="num">${formatScore(row.managerScore)}</td>
          <td class="num">${formatGap(row.gap)}${row.isSignificantGap ? " ⚠" : ""}</td></tr>`,
      )
      .join("");
    const list = (items: string[]) => (items.length ? items.map(escapeHtml).join(", ") : '<span class="muted">—</span>');
    return `<section>
      <h2>דוח השוואתי</h2>
      <table><thead><tr><th>קטגוריה</th><th>משקל</th><th>עובד</th><th>מנהל</th><th>פער</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>ציון משוקלל</td><td></td><td class="num">${formatScore(comparison.employeeWeightedScore)}</td>
      <td class="num">${formatScore(comparison.managerWeightedScore)}</td><td class="num">${formatGap(comparison.weightedGap)}</td></tr></tfoot></table>
      <div class="insights">
        <div><strong>חוזקות מוסכמות:</strong> ${list(comparison.agreedStrengths)}</div>
        <div><strong>תחומי פיתוח:</strong> ${list(comparison.developmentAreas)}</div>
        <div><strong>פערים משמעותיים (מעל נקודה):</strong> ${list(comparison.significantGaps)}</div>
      </div>
    </section>`;
  }

  const employeeCategories = showEmployee ? computeCategoryScores(categories, questions, scoreMap(detail.employeeAnswers)) : null;
  const managerCategories = showManager ? computeCategoryScores(categories, questions, scoreMap(detail.managerAnswers)) : null;
  const rows = categories
    .map((category, index) => `<tr><td>${escapeHtml(category.name)}</td><td class="num">${category.weight}%</td>
      ${employeeCategories ? `<td class="num">${formatScore(employeeCategories[index]?.average ?? null)}</td>` : ""}
      ${managerCategories ? `<td class="num">${formatScore(managerCategories[index]?.average ?? null)}</td>` : ""}</tr>`)
    .join("");
  return `<section>
    <h2>ציונים לפי קטגוריה</h2>
    <table><thead><tr><th>קטגוריה</th><th>משקל</th>${showEmployee ? "<th>הערכה עצמית</th>" : ""}${showManager ? "<th>הערכת מנהל</th>" : ""}</tr></thead>
    <tbody>${rows}</tbody></table>
  </section>`;
}

function openAnswersSection(detail: EvaluationDetailDTO): string {
  const openQuestions = detail.questions.filter((question) => question.type === QuestionType.OPEN_TEXT);
  const employeeById = new Map((detail.employeeAnswers ?? []).map((answer) => [answer.questionId, answer.textAnswer]));
  const managerById = new Map((detail.managerAnswers ?? []).map((answer) => [answer.questionId, answer.textAnswer]));
  const items = openQuestions
    .map((question) => {
      const parts: string[] = [];
      if (employeeById.has(question.id)) parts.push(`<div class="answer"><span class="who">עובד:</span> ${text(employeeById.get(question.id))}</div>`);
      if (managerById.has(question.id)) parts.push(`<div class="answer"><span class="who">מנהל:</span> ${text(managerById.get(question.id))}</div>`);
      return parts.length ? `<div class="qa"><div class="question">${escapeHtml(question.text)}</div>${parts.join("")}</div>` : "";
    })
    .filter(Boolean)
    .join("");
  return items ? `<section><h2>שאלות פתוחות</h2>${items}</section>` : "";
}

function feedbackSection(feedback: FeedbackMeetingDTO | null): string {
  if (!feedback) return "";
  const field = (label: string, value: string | null) => `<div class="field"><div class="label">${label}</div><div>${text(value)}</div></div>`;
  return `<section>
    <h2>סיכום שיחת משוב</h2>
    <div class="meta">מועד השיחה: ${formatDate(feedback.heldAt ?? feedback.scheduledAt)}${feedback.approvedAt ? ` · אושר: ${formatDate(feedback.approvedAt)}` : ""}${feedback.employeeAcknowledgedAt ? ` · העובד אישר קריאה: ${formatDate(feedback.employeeAcknowledgedAt)}` : ""}</div>
    ${field("הישגים מרכזיים", feedback.achievements)}
    ${field("חוזקות", feedback.strengths)}
    ${field("תחומי שיפור", feedback.improvementAreas)}
    ${field("הזדמנויות פיתוח", feedback.developmentOpportunities)}
    ${field("סיכום שיחה", feedback.summary)}
    ${field("הערות מנהל", feedback.managerComments)}
    ${field("הערות העובד", feedback.employeeComments)}
  </section>`;
}

function goalsSection(goals: GoalDTO[] | null): string {
  if (!goals || goals.length === 0) return "";
  const rows = goals
    .map((goal) => `<tr><td><strong>${escapeHtml(goal.title)}</strong><div class="muted">${escapeHtml(goal.description)}</div></td>
      <td>${escapeHtml(goal.kpi)}</td><td class="num">${goal.weight}%</td><td class="num">${formatDate(goal.dueDate)}</td></tr>`)
    .join("");
  return `<section class="avoid-break"><h2>יעדים לשנה הבאה</h2>
    <table><thead><tr><th>יעד</th><th>מדד הצלחה</th><th>משקל</th><th>תאריך יעד</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

export function renderEvaluationReportHtml(input: EvaluationReportInput): string {
  const { detail, feedback, goals, generatedAt, generatedBy, fontCss } = input;
  const hiddenNotice =
    detail.employeeAnswers === null || detail.managerAnswers === null
      ? `<div class="notice">חלק מהנתונים אינם מוצגים בשלב זה בהתאם לכללי הסודיות של תהליך ההערכה.</div>`
      : "";

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<title>${escapeHtml(`הערכת עובד – ${detail.employee.fullName}`)}</title>
<style>
${fontCss}
*{box-sizing:border-box}
body{font-family:"Heebo",Arial,sans-serif;color:#111827;font-size:11pt;line-height:1.5;margin:0;direction:rtl}
header{border-bottom:3px solid #1d4ed8;padding-bottom:10px;margin-bottom:16px}
h1{font-size:19pt;margin:0 0 4px}
h2{font-size:13pt;color:#1d4ed8;margin:20px 0 8px;border-bottom:1px solid #e5e7eb;padding-bottom:4px}
.subtitle{color:#4b5563}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 18px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px}
.grid .label,.field .label{color:#6b7280;font-size:9pt}
.scores{display:flex;gap:12px;margin-top:12px}
.score{flex:1;border:1px solid #e5e7eb;border-radius:6px;padding:8px 12px;text-align:center}
.score .value{font-size:18pt;font-weight:700;color:#1d4ed8}
table{width:100%;border-collapse:collapse;font-size:10pt}
th,td{border:1px solid #e5e7eb;padding:6px 8px;text-align:right;vertical-align:top}
th{background:#eff6ff;font-weight:700}
tfoot td{font-weight:700;background:#f9fafb}
td.num{text-align:center;white-space:nowrap;direction:ltr}
tr.gap td{background:#fef3c7}
.insights{margin-top:8px;display:grid;gap:4px;font-size:10pt}
.qa{margin-bottom:10px;page-break-inside:avoid}
.question{font-weight:700;margin-bottom:2px}
.answer{margin-inline-start:10px}
.who{color:#6b7280}
.field{margin-bottom:8px;page-break-inside:avoid}
.meta,.muted{color:#6b7280;font-size:9.5pt}
.notice{background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:8px 12px;margin:12px 0;font-size:10pt}
.avoid-break{page-break-inside:avoid}
footer{margin-top:24px;border-top:1px solid #e5e7eb;padding-top:6px;color:#6b7280;font-size:8.5pt}
</style>
</head>
<body>
<header>
  <h1>סיכום הערכת עובד</h1>
  <div class="subtitle">${escapeHtml(detail.cycle.name)} ${detail.cycle.year} · סטטוס: ${escapeHtml(detail.statusLabel)}</div>
</header>
<div class="grid">
  <div><div class="label">שם העובד</div>${escapeHtml(detail.employee.fullName)}</div>
  <div><div class="label">מספר עובד</div>${escapeHtml(detail.employee.employeeNumber)}</div>
  <div><div class="label">תפקיד</div>${escapeHtml(detail.employee.jobTitle)}</div>
  <div><div class="label">מחלקה</div>${escapeHtml(detail.employee.department)}</div>
  <div><div class="label">מנהל ישיר</div>${escapeHtml(detail.manager.fullName)}</div>
  <div><div class="label">הושלם</div>${formatDate(detail.completedAt)}</div>
  <div><div class="label">הגשת הערכה עצמית</div>${formatDate(detail.employeeSubmittedAt)}</div>
  <div><div class="label">הגשת הערכת מנהל</div>${formatDate(detail.managerSubmittedAt)}</div>
  ${detail.isHighPotential ? '<div><div class="label">סימון</div>פוטנציאל גבוה</div>' : ""}
</div>
<div class="scores">
  ${detail.employeeAnswers !== null ? `<div class="score"><div class="label">ציון משוקלל – הערכה עצמית</div><div class="value">${formatScore(detail.employeeWeightedScore)}</div></div>` : ""}
  ${detail.managerAnswers !== null ? `<div class="score"><div class="label">ציון משוקלל – הערכת מנהל</div><div class="value">${formatScore(detail.managerWeightedScore)}</div></div>` : ""}
</div>
${hiddenNotice}
${scoresSection(detail)}
${openAnswersSection(detail)}
${feedbackSection(feedback)}
${goalsSection(goals)}
<footer>מסמך פנימי – סודי. הופק ע"י ${escapeHtml(generatedBy)} ב-${dateTimeFormatter.format(generatedAt)}.</footer>
</body>
</html>`;
}
