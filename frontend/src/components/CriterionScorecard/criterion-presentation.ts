import type { Appeal } from "../../shared/types/appeal";
import type { ChecklistCriterion } from "../../shared/types/checklist";
import type { CriterionEvaluation, EvaluationRun } from "../../shared/types/evaluation";

export type CriterionState = "full" | "partial" | "zero" | "na" | "critical" | "clear" | "pending" | "error";

export function reviewerDecision(run: EvaluationRun, criterionId: string): Appeal["decision"] {
  if (!run.finalized_at) return null;
  const decisions = [...(run.appeals ?? [])]
    .filter((appeal) => appeal.criterion_id === criterionId && ["CONFIRMED", "OVERRIDDEN"].includes(appeal.status) && appeal.decision)
    .sort((a, b) => (a.decision?.decided_at ?? "").localeCompare(b.decision?.decided_at ?? ""));
  // Score finalization applies persisted overrides. A subsequent confirmation
  // records reviewer metadata without undoing an earlier effective override.
  return decisions.filter(appeal => appeal.status === "OVERRIDDEN").at(-1)?.decision ?? decisions.at(-1)?.decision ?? null;
}

export function isSevereCriterion(criterion: CriterionEvaluation, configuration?: ChecklistCriterion): boolean {
  return configuration?.answer_type === "flag" || criterion.external_code === "critical";
}

export function earnedCriterionPoints(criterion: CriterionEvaluation, configuration?: ChecklistCriterion): number | null {
  if (criterion.processing_state !== "completed" || criterion.is_na || criterion.raw_value === null) return null;
  if (criterion.weighted_contribution !== null) return criterion.weighted_contribution;
  // Older runs stored points only after every criterion succeeded. The pinned
  // configuration lets completed answers retain their points when a sibling fails.
  if (!configuration) return null;
  if (configuration.answer_type === "flag") return 0;
  if (configuration.answer_type === "boolean") return typeof criterion.raw_value === "boolean" ? (criterion.raw_value ? criterion.weight : 0) : null;
  if (typeof criterion.raw_value !== "number" || !configuration.numeric_scale.some((option) => option.value === criterion.raw_value)) return null;
  const maximum = Math.max(...configuration.numeric_scale.map((option) => option.value));
  return maximum > 0 ? criterion.weight * criterion.raw_value / maximum : null;
}

export function criterionState(criterion: CriterionEvaluation, configuration?: ChecklistCriterion, decision: Appeal["decision"] = null): CriterionState {
  if (criterion.processing_state === "error") return "error";
  if (criterion.processing_state !== "completed") return "pending";
  const value = decision ? decision.effective_value : criterion.raw_value;
  if (value === null) return "na";
  if (isSevereCriterion(criterion, configuration)) return value === true ? "critical" : "clear";
  if (typeof value === "boolean") return value ? "full" : "zero";
  const maximum = configuration?.numeric_scale.length ? Math.max(...configuration.numeric_scale.map((option) => option.value)) : null;
  if (value === 0) return "zero";
  if (maximum !== null) return value === maximum ? "full" : "partial";
  // A historical score can still be presented without guessing its raw numerical scale.
  return !decision && criterion.weighted_contribution === criterion.weight ? "full" : "partial";
}

export function summarizeCriteria(run: EvaluationRun) {
  const summary = { passed: 0, partial: 0, failed: 0, applicable: 0, na: 0 };
  for (const criterion of run.criteria) {
    const configuration = run.checklist_snapshot?.criteria.find((item) => item.id === criterion.criterion_id);
    if (isSevereCriterion(criterion, configuration) || criterion.processing_state !== "completed") continue;
    const state = criterionState(criterion, configuration, reviewerDecision(run, criterion.criterion_id));
    if (state === "na") { summary.na += 1; continue; }
    summary.applicable += 1;
    if (state === "full") summary.passed += 1;
    if (state === "partial") summary.partial += 1;
    if (state === "zero") summary.failed += 1;
  }
  return summary;
}

export function answerLabel(value: boolean | number | null): string {
  return value === null ? "N/A" : typeof value === "boolean" ? value ? "Yes" : "No" : String(value);
}
