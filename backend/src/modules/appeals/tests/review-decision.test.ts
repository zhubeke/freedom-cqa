import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { decisionOutcome, validateDecisionValue, validateRevisedEvidence } from "../application/review-decision.js";
import { freedomDefaultConfiguration } from "../../checklist-management/seed/freedom-default-checklist.js";
import { AppealDecisionBodySchema } from "../schemas/appeal.schemas.js";

const original = { raw_value: 20, explanation: "Original AI rationale", evidence_message_ids: ["p1-en-001:m1"], evidence_turns: [1], weighted_contribution: 20, answer_type: "numeric" as const, allowed_values: [0, 5, 10, 15, 20], na_enabled: true };

test("decision outcomes agree with actual value, reasoning and evidence changes", () => {
  assert.equal(decisionOutcome(original, { effective_value: 15 }), "SCORE_CHANGED");
  assert.equal(decisionOutcome(original, { effective_value: null }), "SCORE_CHANGED");
  assert.equal(decisionOutcome(original, { effective_value: 20, effective_explanation: "Reviewer revised rationale" }), "REASONING_CHANGED");
  assert.equal(decisionOutcome(original, { effective_value: 20, effective_evidence_message_ids: ["p1-en-001:m2"] }), "REASONING_CHANGED");
  assert.equal(decisionOutcome(original, { effective_value: 20 }), "UPHELD");
  assert.equal(decisionOutcome(original, { effective_value: 20, effective_explanation: original.explanation, effective_evidence_message_ids: original.evidence_message_ids }), "UPHELD");
  assert.equal(decisionOutcome({ ...original, raw_value: true }, { effective_value: false }), "SCORE_CHANGED");
  assert.equal(decisionOutcome({ ...original, raw_value: null }, { effective_value: null }), "UPHELD");
});

test("evidence order and duplicate references do not fabricate a reasoning change", () => {
  const source = { ...original, evidence_message_ids: ["a", "b"] };
  assert.equal(decisionOutcome(source, { effective_value: 20, effective_evidence_message_ids: ["b", "a", "a"] }), "UPHELD");
});

test("decision values follow each immutable checklist scale including nonuniform steps", () => {
  const dialogue = freedomDefaultConfiguration.criteria.find(c => c.code === "06")!;
  for (const value of [0, 4, 7, 10]) assert.doesNotThrow(() => validateDecisionValue(dialogue, value));
  for (const value of [1, 5, 6, 15, null, true, "7", undefined, NaN]) assert.throws(() => validateDecisionValue(dialogue, value));
  const consultation = freedomDefaultConfiguration.criteria.find(c => c.code === "04")!;
  assert.doesNotThrow(() => validateDecisionValue(consultation, null));
  assert.doesNotThrow(() => validateDecisionValue(consultation, 15));
  assert.throws(() => validateDecisionValue(consultation, 14));
  const boolean = freedomDefaultConfiguration.criteria.find(c => c.code === "01")!;
  assert.doesNotThrow(() => validateDecisionValue(boolean, false));
  assert.throws(() => validateDecisionValue(boolean, 0));
});

test("revised evidence only accepts the conversation's exact stable message IDs", () => {
  const messages = [{ message_id: "p1-en-001:m1" }, { message_id: "p1-en-001:m2" }];
  assert.deepEqual(validateRevisedEvidence(["p1-en-001:m2", "p1-en-001:m2"], messages), ["p1-en-001:m2"]);
  assert.throws(() => validateRevisedEvidence(["m1"], messages), /unknown/);
  assert.throws(() => validateRevisedEvidence(["p1-en-002:m1"], messages), /unknown/);
  assert.throws(() => validateRevisedEvidence([1], messages), /stable/);
  assert.deepEqual(validateRevisedEvidence([], messages), []);
});

test("HTTP validation preserves numeric zero, booleans and N/A for snapshot validation", async () => {
  const app = Fastify();
  app.post<{ Body: { override_value: unknown } }>("/decision", { schema: { body: AppealDecisionBodySchema } }, async request => ({ value: request.body.override_value }));
  try {
    for (const value of [0, 1, 7, true, false, null, "7"]) {
      const response = await app.inject({ method: "POST", url: "/decision", payload: { status: "OVERRIDDEN", reviewer: "QA", justification: "Verified evidence", override_value: value } });
      assert.equal(response.statusCode, 200); assert.deepEqual(response.json(), { value });
    }
    const invalid = await app.inject({ method: "POST", url: "/decision", payload: { status: "OVERRIDDEN", reviewer: "QA" } });
    assert.equal(invalid.statusCode, 400);
  } finally { await app.close(); }
});
