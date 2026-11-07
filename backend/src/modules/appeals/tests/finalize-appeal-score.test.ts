import assert from "node:assert/strict";
import test from "node:test";
import type { ChecklistCriterion } from "../../checklist-management/domain/checklist.types.js";
import { calculateFinalizedEvaluation } from "../application/finalize-appeal-score.js";

const criteria: ChecklistCriterion[] = [
  { id: "a", code: "A", display_order: 1, section_id: "s", source_name: "A", display_name: "A", description: "", evaluation_instructions: "", answer_type: "boolean", weight: 60, numeric_scale: [], na_enabled: true, na_rule: "", enabled: true },
  { id: "b", code: "B", display_order: 2, section_id: "s", source_name: "B", display_name: "B", description: "", evaluation_instructions: "", answer_type: "boolean", weight: 40, numeric_scale: [], na_enabled: true, na_rule: "", enabled: true }
];

test("an override recalculates the finalized score without changing original criterion values", () => {
  const originals = [{ criterion_id: "a", raw_value: false }, { criterion_id: "b", raw_value: true }];
  const result = calculateFinalizedEvaluation(criteria, originals, [{ criterion_id: "a", status: "OVERRIDDEN", decision: { effective_value: true } }]);
  assert.equal(result.finalScore, 100);
  assert.deepEqual(originals.map((item) => item.raw_value), [false, true]);
});

test("confirmed decisions retain the original score and N/A overrides redistribute weight", () => {
  const originals = [{ criterion_id: "a", raw_value: false }, { criterion_id: "b", raw_value: true }];
  assert.equal(calculateFinalizedEvaluation(criteria, originals, [{ criterion_id: "a", status: "CONFIRMED", decision: { effective_value: true } }]).finalScore, 40);
  assert.equal(calculateFinalizedEvaluation(criteria, originals, [{ criterion_id: "a", status: "OVERRIDDEN", decision: { effective_value: null } }]).finalScore, 100);
});
