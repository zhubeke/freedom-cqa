import type { ChecklistCriterion } from "../../checklist-management/domain/checklist.types.js";
import { calculateScore } from "../domain/score.js";

export function calculateEvaluationScore(criteria: ChecklistCriterion[], values: Map<string, boolean | number | null>) {
  const enabled = criteria.filter((criterion) => criterion.enabled);
  const score = calculateScore(enabled.map((criterion) => ({ criterion, value: values.get(criterion.id) ?? null })));
  return {
    ...score,
    weightedContributions: new Map(enabled.map((criterion, index) => [criterion.id, score.contributions[index] ?? 0])),
    criticalFlag: enabled.some((criterion) => criterion.answer_type === "flag" && values.get(criterion.id) === true)
  };
}
