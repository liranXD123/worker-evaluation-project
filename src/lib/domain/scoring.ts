/**
 * חישובי ציונים והשוואה (SPEC §4 שלב 4, §5).
 * קובץ טהור – ללא תלות ב-DB, ניתן לשימוש גם ב-UI וגם בבדיקות.
 */

export const MIN_SCORE = 1;
export const MAX_SCORE = 5;
/** פער שמסומן אוטומטית: |עובד − מנהל| > 1 */
export const SIGNIFICANT_GAP_THRESHOLD = 1;
/** חוזקה מוסכמת: שני הצדדים נתנו ממוצע ≥ 4 */
export const STRENGTH_THRESHOLD = 4;
/** תחום פיתוח: ממוצע המנהל ≤ 3 */
export const DEVELOPMENT_THRESHOLD = 3;

export interface ScoringCategory {
  id: string;
  key: string;
  name: string;
  weight: number;
  order: number;
}

export interface ScoringQuestion {
  id: string;
  categoryId: string;
  text: string;
  order: number;
}

/** questionId → ציון 1–5 */
export type ScoreMap = ReadonlyMap<string, number>;

export interface CategoryScore {
  categoryId: string;
  key: string;
  name: string;
  weight: number;
  average: number | null;
  answered: number;
  total: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeCategoryScores(
  categories: readonly ScoringCategory[],
  questions: readonly ScoringQuestion[],
  scores: ScoreMap,
): CategoryScore[] {
  return [...categories]
    .sort((a, b) => a.order - b.order)
    .map((category) => {
      const categoryQuestions = questions.filter((question) => question.categoryId === category.id);
      const values = categoryQuestions
        .map((question) => scores.get(question.id))
        .filter((score): score is number => score !== undefined);
      const average = values.length > 0 ? round2(values.reduce((sum, score) => sum + score, 0) / values.length) : null;
      return {
        categoryId: category.id,
        key: category.key,
        name: category.name,
        weight: category.weight,
        average,
        answered: values.length,
        total: categoryQuestions.length,
      };
    });
}

/**
 * ציון משוקלל = Σ(ממוצע קטגוריה × משקל) / Σ(משקלים).
 * מחזיר null אם יש קטגוריה ללא אף ציון (שאלון לא שלם).
 */
export function computeWeightedScore(categoryScores: readonly CategoryScore[]): number | null {
  if (categoryScores.length === 0) return null;
  let weightedSum = 0;
  let totalWeight = 0;
  for (const category of categoryScores) {
    if (category.average === null) return null;
    weightedSum += category.average * category.weight;
    totalWeight += category.weight;
  }
  return totalWeight === 0 ? null : round2(weightedSum / totalWeight);
}

export interface ComparisonRow {
  id: string;
  label: string;
  employeeScore: number | null;
  managerScore: number | null;
  /** עובד − מנהל (חיובי = העובד העריך את עצמו גבוה יותר) */
  gap: number | null;
  isSignificantGap: boolean;
  isAgreedStrength: boolean;
  isDevelopmentArea: boolean;
}

export interface CategoryComparisonRow extends ComparisonRow {
  key: string;
  weight: number;
}

export interface QuestionComparisonRow extends ComparisonRow {
  categoryId: string;
}

function compareScores(employeeScore: number | null, managerScore: number | null) {
  if (employeeScore === null || managerScore === null) {
    return { gap: null, isSignificantGap: false, isAgreedStrength: false, isDevelopmentArea: false };
  }
  const gap = round2(employeeScore - managerScore);
  return {
    gap,
    isSignificantGap: Math.abs(gap) > SIGNIFICANT_GAP_THRESHOLD,
    isAgreedStrength: employeeScore >= STRENGTH_THRESHOLD && managerScore >= STRENGTH_THRESHOLD,
    isDevelopmentArea: managerScore <= DEVELOPMENT_THRESHOLD,
  };
}

export interface ComparisonResult {
  categories: CategoryComparisonRow[];
  questions: QuestionComparisonRow[];
  employeeWeightedScore: number | null;
  managerWeightedScore: number | null;
  weightedGap: number | null;
  significantGaps: string[];
  agreedStrengths: string[];
  developmentAreas: string[];
}

export function buildComparison(
  categories: readonly ScoringCategory[],
  questions: readonly ScoringQuestion[],
  employeeScores: ScoreMap,
  managerScores: ScoreMap,
): ComparisonResult {
  const employeeCategories = computeCategoryScores(categories, questions, employeeScores);
  const managerCategories = computeCategoryScores(categories, questions, managerScores);

  const categoryRows: CategoryComparisonRow[] = employeeCategories.map((employeeCategory, index) => {
    const managerCategory = managerCategories[index];
    return {
      id: employeeCategory.categoryId,
      key: employeeCategory.key,
      label: employeeCategory.name,
      weight: employeeCategory.weight,
      employeeScore: employeeCategory.average,
      managerScore: managerCategory.average,
      ...compareScores(employeeCategory.average, managerCategory.average),
    };
  });

  const questionRows: QuestionComparisonRow[] = [...questions]
    .sort((a, b) => a.order - b.order)
    .map((question) => {
      const employeeScore = employeeScores.get(question.id) ?? null;
      const managerScore = managerScores.get(question.id) ?? null;
      return {
        id: question.id,
        categoryId: question.categoryId,
        label: question.text,
        employeeScore,
        managerScore,
        ...compareScores(employeeScore, managerScore),
      };
    });

  const employeeWeightedScore = computeWeightedScore(employeeCategories);
  const managerWeightedScore = computeWeightedScore(managerCategories);

  return {
    categories: categoryRows,
    questions: questionRows,
    employeeWeightedScore,
    managerWeightedScore,
    weightedGap:
      employeeWeightedScore !== null && managerWeightedScore !== null
        ? round2(employeeWeightedScore - managerWeightedScore)
        : null,
    significantGaps: categoryRows.filter((row) => row.isSignificantGap).map((row) => row.label),
    agreedStrengths: categoryRows.filter((row) => row.isAgreedStrength).map((row) => row.label),
    developmentAreas: categoryRows.filter((row) => row.isDevelopmentArea).map((row) => row.label),
  };
}
