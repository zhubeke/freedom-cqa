import assert from "node:assert/strict";
import test from "node:test";
import { calculateScore } from "../domain/score.js";

test("calculates Boolean and numeric contributions with N/A weight redistribution", () => {
  const result = calculateScore([
    { criterion: { answer_type: "boolean", weight: 10, numeric_scale: [] }, value: true },
    { criterion: { answer_type: "boolean", weight: 20, numeric_scale: [] }, value: null },
    { criterion: { answer_type: "numeric", weight: 20, numeric_scale: [{ value: 0 }, { value: 10 }, { value: 20 }] }, value: 10 },
    { criterion: { answer_type: "flag", weight: 0, numeric_scale: [] }, value: true }
  ]);
  assert.equal(result.applicableWeight, 30);
  assert.deepEqual(result.contributions, [10, 0, 10, 0]);
  assert.equal(result.finalScore, 66.67);
});

test("returns null when there is no applicable scoring weight", () => {
  assert.equal(calculateScore([{ criterion: { answer_type: "boolean", weight: 10, numeric_scale: [] }, value: null }]).finalScore, null);
});
