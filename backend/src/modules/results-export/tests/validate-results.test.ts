import assert from "node:assert/strict";
import test from "node:test";
import { freedomDefaultConfiguration } from "../../checklist-management/seed/freedom-default-checklist.js";
import type { OrganizerResults } from "../application/results.types.js";
import { validateOrganizerResults } from "../application/validate-results.js";

const valid: OrganizerResults = {
  schema_version: "1.0", team_name: "team", model: { mode: "external_api", name: "model" }, results: [
    {
      conversation_id: "one", status: "ok",
      criteria: [
        { criterion_id: "contact", value: true, rationale: "Shown", evidence_turns: [1] },
        { criterion_id: "discovery", value: true, rationale: "Shown", evidence_turns: [1] },
        { criterion_id: "identification", value: true, rationale: "Shown", evidence_turns: [1] },
        { criterion_id: "consultation", value: 20, rationale: "Shown", evidence_turns: [1] },
        { criterion_id: "empathy", value: true, rationale: "Shown", evidence_turns: [1] },
        { criterion_id: "dialogue", value: 10, rationale: "Shown", evidence_turns: [1] },
        { criterion_id: "closure", value: true, rationale: "Shown", evidence_turns: [1] },
        { criterion_id: "critical", value: false, rationale: "Not shown", evidence_turns: [1] }
      ],
      score: { final_score: 100, critical_flag: false }
    },
    { conversation_id: "two", status: "error", criteria: [], score: null, error: "Model evaluation failed." }
  ]
};
const context = { datasetGroupId: "SMOKE", expectedConversationIds: ["one", "two"], messageCounts: new Map([["one", 1], ["two", 2]]), checklistCriteria: freedomDefaultConfiguration.criteria };

test("accepts organizer JSON with eight valid criteria and a represented failure", () => {
  assert.deepEqual(validateOrganizerResults(valid, context), { valid: true, errors: [] });
});

test("rejects invalid evidence positions and a wrong score", () => {
  const copy = structuredClone(valid);
  const first = copy.results[0];
  if (first?.status !== "ok") throw new Error("test fixture is invalid");
  first.criteria[0]!.evidence_turns = [0];
  first.score.final_score = 0;
  const result = validateOrganizerResults(copy, context);
  assert.equal(result.valid, false);
  assert(result.errors.some((error) => error.includes("invalid evidence_turns")));
  assert(result.errors.some((error) => error.includes("final_score is incorrect")));
});

test("enforces the exact 65-record DEV submission size", () => {
  const ids = Array.from({ length: 65 }, (_, index) => `dev-${index + 1}`);
  const document: OrganizerResults = {
    schema_version: "1.0", team_name: "team", model: { mode: "external_api", name: "model" },
    results: ids.map((conversation_id) => ({ conversation_id, status: "error", criteria: [], score: null, error: "Model evaluation failed." }))
  };
  const devContext = { ...context, datasetGroupId: "DEV", expectedConversationIds: ids, messageCounts: new Map(ids.map((id) => [id, 1])) };
  assert.equal(validateOrganizerResults(document, devContext).valid, true);
  document.results.pop();
  assert.equal(validateOrganizerResults(document, devContext).valid, false);
});
