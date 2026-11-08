import type { Appeal, AppealStatus, DecisionOutcome } from "../../shared/types/appeal";
import type { ChecklistCriterion } from "../../shared/types/checklist";
import type { TranscriptEntry } from "../../shared/types/conversation";
import type { EvaluationRun } from "../../shared/types/evaluation";

export const isDecided = (appeal: Appeal) => appeal.status === "CONFIRMED" || appeal.status === "OVERRIDDEN";
export const workflowLabel = (status: AppealStatus) => ({ OPEN: "Pending", UNDER_REVIEW: "In review", CONFIRMED: "Decided", OVERRIDDEN: "Decided" }[status]);
export const outcomeLabel = (outcome: DecisionOutcome) => ({ UPHELD: "Upheld", SCORE_CHANGED: "Score changed", REASONING_CHANGED: "Reasoning changed" }[outcome]);
export const displayValue = (value: boolean | number | null) => value === null ? "N/A" : typeof value === "boolean" ? value ? "Yes" : "No" : String(value);
export function deriveOutcome(original: Appeal["original_evaluation"], value: boolean | number | null, explanation = original.explanation, evidence = original.evidence_message_ids): DecisionOutcome {
  if (original.raw_value !== value) return "SCORE_CHANGED";
  const originalIds = new Set(original.evidence_message_ids); const finalIds = new Set(evidence);
  const sameEvidence = originalIds.size === finalIds.size && [...originalIds].every(id => finalIds.has(id));
  return (original.explanation ?? "") !== (explanation ?? original.explanation ?? "") || !sameEvidence ? "REASONING_CHANGED" : "UPHELD";
}
export function appealOutcome(appeal: Appeal): DecisionOutcome {
  const decision = appeal.decision;
  if (!decision) return "UPHELD";
  return deriveOutcome(appeal.original_evaluation, decision.effective_value, decision.effective_explanation === undefined ? appeal.original_evaluation.explanation : decision.effective_explanation, decision.effective_evidence_message_ids ?? appeal.original_evaluation.evidence_message_ids);
}

export interface EvidenceReference { key: string; label: string; messageId: string | null; warning: string | null }
// Turns refer to the complete original transcript, including system and bot events.
// Invalid stable IDs never fall back to a similarly numbered unrelated turn.
export function resolveEvidence(transcript: TranscriptEntry[], ids: string[], turns: number[]): EvidenceReference[] {
  if (ids.length) return ids.map(id => {
    const exact = transcript.find(message => message.message_id === id);
    const suffix = id.includes(":") ? [] : transcript.filter(message => message.message_id.split(":").at(-1) === id);
    const message = exact ?? (suffix.length === 1 ? suffix[0] : undefined);
    const index = message ? transcript.indexOf(message) : -1;
    return { key: id, label: index >= 0 ? `Turn ${index + 1}` : id, messageId: message?.message_id ?? null, warning: message ? null : `Evidence reference “${id}” is missing or invalid.` };
  });
  return turns.map(turn => {
    const message = Number.isInteger(turn) && turn > 0 ? transcript[turn - 1] : undefined;
    return { key: `turn:${turn}`, label: `Turn ${turn}`, messageId: message?.message_id ?? null, warning: message ? null : `Evidence turn ${turn} is outside the original transcript.` };
  });
}

// This matches the stored weighted contribution before N/A redistribution.
// Saved conversation totals, including redistribution, always come from the API.
export function finalizedContribution(run: EvaluationRun, configuration: ChecklistCriterion[], criterionId: string): number | null {
  const values = new Map(run.criteria.map(item => [item.criterion_id, item.raw_value]));
  const decisions = [...(run.appeals ?? [])].filter(item => item.status === "OVERRIDDEN" && item.decision)
    .sort((a, b) => (a.decision?.decided_at ?? a.updated_at).localeCompare(b.decision?.decided_at ?? b.updated_at));
  for (const appeal of decisions) values.set(appeal.criterion_id, appeal.decision!.effective_value);
  const target = configuration.find(item => item.id === criterionId);
  if (!target || !target.enabled) return null;
  if (target.answer_type === "flag") return 0;
  const value = values.get(criterionId);
  if (value === undefined || value === null) return null;
  const maximum = target.answer_type === "numeric" ? Math.max(...target.numeric_scale.map(option => option.value)) : 1;
  if (!(maximum > 0)) return null;
  const normalized = typeof value === "boolean" ? Number(value) : value === null ? 0 : value / maximum;
  return Math.round(normalized * target.weight * 100) / 100;
}
