import type { ChecklistCriterion } from "../../checklist-management/domain/checklist.types.js";
import { calculateEvaluationScore } from "../../score-calculation/application/calculate-evaluation-score.js";

interface CriterionValue { criterion_id: string; raw_value: boolean | number | null }
interface FinalAppeal { criterion_id: string; status: string; decision?: { effective_value?: boolean | number | null } | null }

export function calculateFinalizedEvaluation(checklist: ChecklistCriterion[], criteria: CriterionValue[], appeals: FinalAppeal[]) {
  const values = new Map(criteria.map((item) => [item.criterion_id, item.raw_value]));
  for (const appeal of appeals) if (appeal.status === "OVERRIDDEN" && appeal.decision && "effective_value" in appeal.decision) values.set(appeal.criterion_id, appeal.decision.effective_value ?? null);
  return calculateEvaluationScore(checklist, values);
}
