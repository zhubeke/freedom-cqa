import assert from "node:assert/strict";
import test from "node:test";
import { appealOutcome, deriveOutcome, displayValue, finalizedContribution, resolveEvidence, workflowLabel } from "../src/pages/reviews/review-model.ts";
import type { Appeal } from "../src/shared/types/appeal.ts";
import type { ChecklistCriterion } from "../src/shared/types/checklist.ts";
import type { TranscriptEntry } from "../src/shared/types/conversation.ts";
import type { EvaluationRun } from "../src/shared/types/evaluation.ts";

const original: Appeal["original_evaluation"] = { raw_value: 10, explanation: "Original rationale", evidence_message_ids: ["p1-en-001:m0001"], evidence_turns: [2], weighted_contribution: 15, answer_type: "numeric", allowed_values: [0, 4, 7, 10], na_enabled: true };
const transcript: TranscriptEntry[] = [
  { message_id: "p1-en-001:m0000", speaker: "system", timestamp: "2026-11-08T00:00:00Z", elapsed_ms: 0, text: "Call started" },
  { message_id: "p1-en-001:m0001", speaker: "client", timestamp: "2026-11-08T00:00:01Z", elapsed_ms: 1000, text: "Question" },
  { message_id: "p1-en-001:m0002", speaker: "operator", timestamp: "2026-11-08T00:00:02Z", elapsed_ms: 2000, text: "Answer" }
];
test("workflow status remains separate from outcome", () => {
  assert.equal(workflowLabel("OPEN"), "Pending");
  assert.equal(workflowLabel("UNDER_REVIEW"), "In review");
  assert.equal(workflowLabel("OVERRIDDEN"), "Decided");
});
test("outcomes reflect actual numeric, boolean, N/A, reasoning and evidence changes", () => {
  assert.equal(deriveOutcome(original, 7), "SCORE_CHANGED");
  assert.equal(deriveOutcome(original, 10), "UPHELD");
  assert.equal(deriveOutcome(original, 10, "Revised rationale"), "REASONING_CHANGED");
  assert.equal(deriveOutcome(original, 10, original.explanation, []), "REASONING_CHANGED");
  assert.equal(deriveOutcome({ ...original, raw_value: true }, false), "SCORE_CHANGED");
  assert.equal(deriveOutcome(original, null), "SCORE_CHANGED");
  assert.equal(displayValue(null), "N/A");
});
test("legacy equal-value overrides are never labeled score changed", () => {
  const appeal = { original_evaluation: original, decision: { effective_value: 10, justification: "Reviewer rationale", outcome: "SCORE_CHANGED" } } as Appeal;
  assert.equal(appealOutcome(appeal), "UPHELD");
});
test("persisted outcomes and exact evaluation reasoning match backend semantics", () => {
  assert.equal(deriveOutcome(original, 10, `${original.explanation} `), "REASONING_CHANGED");
  assert.equal(deriveOutcome(original, 10, original.explanation, [...original.evidence_message_ids, ...original.evidence_message_ids]), "UPHELD");
  const appeal = { original_evaluation: original, decision: { effective_value: 10, outcome: "REASONING_CHANGED", effective_explanation: "Revised" } } as Appeal;
  assert.equal(appealOutcome(appeal), "REASONING_CHANGED");
});
test("evidence preserves original turn order including system events", () => {
  const resolved = resolveEvidence(transcript, [], [1, 3]);
  assert.deepEqual(resolved.map(item => item.messageId), ["p1-en-001:m0000", "p1-en-001:m0002"]);
  assert.equal(resolveEvidence(transcript, ["p1-en-001:m0001"], [3])[0]?.label, "Turn 2");
  assert.equal(transcript[0]?.speaker, "system");
});
test("invalid stable references never silently fall back to a supplied turn", () => {
  const reference = resolveEvidence(transcript, ["missing:m0001"], [2])[0]!;
  assert.equal(reference.messageId, null);
  assert.match(reference.warning!, /missing or invalid/);
  assert.equal(resolveEvidence(transcript, [], [0, 9]).every(item => item.warning && !item.messageId), true);
});
test("ambiguous unqualified message IDs do not select unrelated evidence", () => {
  const other = { ...transcript[1]!, message_id: "another:m0001" };
  assert.equal(resolveEvidence([...transcript, other], ["m0001"], [2])[0]?.messageId, null);
});
test("nonuniform numeric scale maximum remains independent of criterion weight", () => {
  const criterion = { id: "dialogue", enabled: true, weight: 15, answer_type: "numeric", numeric_scale: [0, 4, 7, 10].map(value => ({ value, description: String(value) })) } as ChecklistCriterion;
  const run = { criteria: [{ criterion_id: "dialogue", raw_value: 10 }], appeals: [{ criterion_id: "dialogue", status: "OVERRIDDEN", updated_at: "2026-11-08", decision: { effective_value: 7, decided_at: "2026-11-08" } }] } as EvaluationRun;
  assert.equal(finalizedContribution(run, [criterion], "dialogue"), 10.5);
  run.appeals![0]!.decision!.effective_value = null;
  assert.equal(finalizedContribution(run, [criterion], "dialogue"), null);
  assert.equal(run.criteria[0]?.raw_value, 10);
});
