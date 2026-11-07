export interface ScoringCriterion { answer_type: "boolean" | "numeric" | "flag"; weight: number; numeric_scale: Array<{ value: number }> }
export interface ScoringResult { criterion: ScoringCriterion; value: boolean | number | null }
export interface ScoreResult { finalScore: number | null; applicableWeight: number; contributions: number[] }

export function calculateScore(results: ScoringResult[]): ScoreResult {
  let applicableWeight = 0;
  const contributions = results.map(({ criterion, value }) => {
    if (criterion.answer_type === "flag" || value === null) return 0;
    const maximum = criterion.answer_type === "numeric" ? Math.max(...criterion.numeric_scale.map((item) => item.value)) : 1;
    const normalized = criterion.answer_type === "numeric" ? Number(value) / maximum : value ? 1 : 0;
    applicableWeight += criterion.weight;
    return criterion.weight * normalized;
  });
  if (applicableWeight === 0) return { finalScore: null, applicableWeight, contributions };
  const score = 100 * contributions.reduce((sum, value) => sum + value, 0) / applicableWeight;
  return { finalScore: Math.round((score + Number.EPSILON) * 100) / 100, applicableWeight, contributions };
}
