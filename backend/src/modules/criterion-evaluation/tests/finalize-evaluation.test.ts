import assert from "node:assert/strict";
import test from "node:test";
import { EvaluationConsumer } from "../adapters/events/evaluation-consumer.js";
import { freedomDefaultConfiguration } from "../../checklist-management/seed/freedom-default-checklist.js";
import type { ChecklistVersionRecord } from "../../checklist-management/domain/checklist.types.js";

test("a failed severe-violation result preserves points for all seven successful criteria without issuing a final score", async () => {
  const values = [false, false, true, 20, false, 10, true, null];
  const results = freedomDefaultConfiguration.criteria.map((criterion, index) => ({ criterion_id: criterion.id, raw_value: values[index], processing_state: index === 7 ? "error" : "completed", error_category: index === 7 ? "malformed_response" : null }));
  const contributions = new Map<string, number>();
  let finalUpdate: Record<string, unknown> | undefined;
  let completed = 0;
  const db = { collection: (name: string) => name === "criterion_evaluations" ? {
    find: () => ({ toArray: async () => results }),
    updateOne: async (filter: { criterion_id: string }, update: { $set: { weighted_contribution: number } }) => contributions.set(filter.criterion_id, update.$set.weighted_contribution)
  } : {
    updateOne: async (_filter: unknown, update: { $set: { completed_criteria: number } }) => { completed = update.$set.completed_criteria; },
    findOneAndUpdate: async (_filter: unknown, update: { $set: Record<string, unknown> }) => { finalUpdate = update.$set; return null; }
  } };
  const consumer = new EvaluationConsumer({} as never, {} as never, db as never, {} as never, {} as never);
  await (consumer as unknown as { finalize: (runId: string, version: ChecklistVersionRecord) => Promise<void> }).finalize("run-1", freedomDefaultConfiguration as ChecklistVersionRecord);
  assert.equal(completed, 8);
  assert.deepEqual([...contributions.values()], [0, 0, 20, 20, 0, 15, 5]);
  assert.equal(contributions.has("freedom-criterion-08"), false);
  assert.equal(finalUpdate?.status, "failed");
  assert.equal(finalUpdate?.final_score, null);
  assert.equal(finalUpdate?.critical_flag, null);
});
