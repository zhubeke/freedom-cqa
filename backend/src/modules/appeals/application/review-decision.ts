import type { ChecklistCriterion } from "../../checklist-management/domain/checklist.types.js";
import type { AppealDocument, DecisionOutcome } from "./appeal.types.js";

export class AppealDecisionError extends Error {}
const sameEvidence = (left: string[], right: string[]) => {
  const a = new Set(left); const b = new Set(right);
  return a.size === b.size && [...a].every(id => b.has(id));
};

/** Reviewer rationale records why a decision was made; it does not by itself revise the evaluation. */
export function decisionOutcome(original: AppealDocument["original_evaluation"], effective: {
  effective_value: boolean | number | null; effective_explanation?: string | null; effective_evidence_message_ids?: string[];
}): DecisionOutcome {
  if (original.raw_value !== effective.effective_value) return "SCORE_CHANGED";
  if ((effective.effective_explanation ?? original.explanation ?? "") !== (original.explanation ?? "") ||
      !sameEvidence(effective.effective_evidence_message_ids ?? original.evidence_message_ids, original.evidence_message_ids)) return "REASONING_CHANGED";
  return "UPHELD";
}

export function validateDecisionValue(criterion: ChecklistCriterion, value: unknown): asserts value is boolean | number | null {
  if (value === null) {
    if (!criterion.na_enabled) throw new AppealDecisionError("This criterion does not allow N/A");
  } else if (criterion.answer_type === "numeric") {
    if (typeof value !== "number" || !Number.isFinite(value) || !criterion.numeric_scale.some(option => option.value === value)) throw new AppealDecisionError("Override value is not in the criterion numeric scale");
  } else if (typeof value !== "boolean") throw new AppealDecisionError("Override value must be boolean for this criterion");
}

/** Only exact stable transcript IDs may be persisted for revised evidence. */
export function validateRevisedEvidence(value: unknown, transcript: Array<{ message_id?: string }>): string[] {
  if (!Array.isArray(value) || value.some(id => typeof id !== "string" || !id)) throw new AppealDecisionError("Revised evidence must contain stable message IDs");
  const known = new Set(transcript.map(message => message.message_id));
  if (value.some(id => !known.has(id))) throw new AppealDecisionError("Revised evidence references an unknown transcript message");
  return [...new Set(value as string[])];
}
