import assert from "node:assert/strict";
import test from "node:test";
import { Value } from "@sinclair/typebox/value";
import { OrganizerResultsFileSchema } from "../schemas/organizer-results.schema.js";

const criterion = (index: number) => ({ criterion_id: `c${index}`, value: true, rationale: "Evidence-backed result", evidence_turns: [index] });
test("accepts appendix-compatible successful and failed result entries", () => {
  const file = { schema_version: "1.0", team_name: "CQA", model: { mode: "external_api", name: "model" }, results: [
    { conversation_id: "ok", status: "ok", criteria: Array.from({ length: 8 }, (_, index) => criterion(index + 1)), score: { final_score: 90, critical_flag: false } },
    { conversation_id: "failed", status: "error", criteria: [], score: null, error: "Provider unavailable" }
  ] };
  assert.equal(Value.Check(OrganizerResultsFileSchema, file), true);
});

test("does not allow a successful entry with fewer than eight criteria", () => {
  const file = { schema_version: "1.0", team_name: "CQA", model: { mode: "external_api", name: "model" }, results: [{ conversation_id: "bad", status: "ok", criteria: [criterion(1)], score: { final_score: 0, critical_flag: false } }] };
  assert.equal(Value.Check(OrganizerResultsFileSchema, file), false);
});
