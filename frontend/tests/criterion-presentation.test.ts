import assert from "node:assert/strict";
import test from "node:test";
import { criterionState, earnedCriterionPoints, reviewerDecision } from "../src/components/CriterionScorecard/criterion-presentation.ts";
import { freedomDefaultConfiguration } from "../../backend/src/modules/checklist-management/seed/freedom-default-checklist.ts";
import type { CriterionEvaluation } from "../src/shared/types/evaluation.ts";
import type { Appeal } from "../src/shared/types/appeal.ts";
import type { EvaluationRun } from "../src/shared/types/evaluation.ts";

const decision = (value: number, at: string): NonNullable<Appeal["decision"]> => ({ effective_value: value, decided_at: at, justification: "Evidence reviewed", reviewer: "QA" });
const appeal = (status: Appeal["status"], value: number, at: string) => ({ criterion_id: "consultation", status, decision: decision(value, at) }) as Appeal;

test("completed answers retain earned points when the run failed before storing contributions", () => {
  const criterion = { processing_state: "completed", raw_value: true, weighted_contribution: null, weight: 20, is_na: false } as CriterionEvaluation;
  assert.equal(earnedCriterionPoints(criterion, freedomDefaultConfiguration.criteria[2]), 20);
  assert.equal(earnedCriterionPoints({ ...criterion, raw_value: false }, freedomDefaultConfiguration.criteria[2]), 0);
  const dialogue = { ...criterion, raw_value: 10, weight: 15 };
  assert.equal(earnedCriterionPoints(dialogue, freedomDefaultConfiguration.criteria[5]), 15);
  assert.equal(criterionState(dialogue, freedomDefaultConfiguration.criteria[5]), "full");
  assert.equal(earnedCriterionPoints({ ...dialogue, raw_value: 7 }, freedomDefaultConfiguration.criteria[5]), 10.5);
  assert.equal(earnedCriterionPoints({ ...criterion, processing_state: "error" }, freedomDefaultConfiguration.criteria[2]), null);
  assert.equal(earnedCriterionPoints({ ...criterion, is_na: true, raw_value: null }, freedomDefaultConfiguration.criteria[2]), null);
  assert.equal(earnedCriterionPoints(criterion), null);
  assert.equal(earnedCriterionPoints({ ...criterion, weighted_contribution: 20 }), 20);
});
test("a later confirmation does not hide a persisted scoring override", () => {
  const override = appeal("OVERRIDDEN", 15, "2026-11-01T12:00:00Z");
  const confirmed = appeal("CONFIRMED", 20, "2026-11-02T12:00:00Z");
  const run = { finalized_at: "2026-11-02T12:00:00Z", appeals: [confirmed, override] } as EvaluationRun;
  assert.equal(reviewerDecision(run, "consultation"), override.decision);
  assert.equal(reviewerDecision(run, "consultation")?.effective_value, 15);
});
test("upheld-only decisions retain reviewer metadata for the reviewed badge", () => {
  const older = appeal("CONFIRMED", 20, "2026-11-01T12:00:00Z");
  const latest = appeal("CONFIRMED", 20, "2026-11-02T12:00:00Z");
  const run = { finalized_at: "2026-11-02T12:00:00Z", appeals: [latest, older] } as EvaluationRun;
  assert.equal(reviewerDecision(run, "consultation"), latest.decision);
  assert.equal(reviewerDecision({ ...run, finalized_at: undefined }, "consultation"), null);
  assert.equal(reviewerDecision(run, "different-criterion"), null);
});
test("the latest override wins independently of appeal queue order", () => {
  const older = appeal("OVERRIDDEN", 15, "2026-11-01T12:00:00Z");
  const latest = appeal("OVERRIDDEN", 10, "2026-11-03T12:00:00Z");
  const confirmed = appeal("CONFIRMED", 20, "2026-11-04T12:00:00Z");
  const run = { finalized_at: "2026-11-04T12:00:00Z", appeals: [latest, confirmed, older] } as EvaluationRun;
  assert.equal(reviewerDecision(run, "consultation"), latest.decision);
});
