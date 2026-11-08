import assert from "node:assert/strict";
import test from "node:test";
import { ClassificationRepository } from "../adapters/persistence/classification-repository.js";

test("reclassification uses finalized criterion values and revised evidence without mutating AI records", async () => {
  const original = { criterion_id: "freedom-criterion-08", raw_value: false, is_na: false, explanation: "Original rationale", evidence_message_ids: ["p1-en-001:m1"] };
  const db = { collection: (name: string) => ({
    findOne: async () => name === "evaluation_runs" ? { run_id: "run", final_score: 80, finalized_score: 70, critical_flag: false, finalized_critical_flag: true } : null,
    find: () => { const cursor = { sort: () => cursor, toArray: async () => name === "criterion_evaluations" ? [original] : [{ criterion_id: original.criterion_id, decision: { effective_value: true, effective_explanation: "Reviewed rationale", effective_evidence_message_ids: ["p1-en-001:m2"] } }] }; return cursor; }
  }) };
  const result = await new ClassificationRepository(db as never).inputs("QA", "p1-en-001");
  assert.equal(result.evaluation.final_score, 70); assert.equal(result.evaluation.critical_flag, true);
  assert.equal(result.criteria[0]!.raw_value, true);
  assert.equal(result.criteria[0]!.explanation, "Reviewed rationale");
  assert.deepEqual(result.criteria[0]!.evidence_message_ids, ["p1-en-001:m2"]);
  assert.equal(original.raw_value, false); assert.deepEqual(original.evidence_message_ids, ["p1-en-001:m1"]);
});
