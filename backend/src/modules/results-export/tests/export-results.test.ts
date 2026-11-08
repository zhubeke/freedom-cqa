import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { Db } from "mongodb";
import type { AppConfig } from "../../../config/config.js";
import { freedomDefaultConfiguration } from "../../checklist-management/seed/freedom-default-checklist.js";
import { calculateEvaluationScore } from "../../score-calculation/application/calculate-evaluation-score.js";
import { serializeEvaluation, type ExportCriterion, type ExportRun } from "../application/serialize-result.js";
import { buildSelectedOrganizerResults, previewConversationExport } from "../application/conversation-export.js";
import { buildOrganizerResults } from "../application/export-results.js";
import { registerResultsExportRoutes } from "../adapters/http/routes.js";

const checklist = freedomDefaultConfiguration.criteria;
const values = [true, null, null, 15, true, 7, true, false] as const;
const score = calculateEvaluationScore(checklist, new Map(checklist.map((c, index) => [c.id, values[index] ?? null])));
function fixture(id = "one", model = "actual-test-model") {
  const conversation = { conversation_id: id, dataset_group_id: "SMOKE", transcript: [
    { message_id: `${id}:m0000` }, { message_id: `${id}:m0009` }, { message_id: `${id}:m0001` }
  ] };
  const criteria: ExportCriterion[] = checklist.map((c, index) => ({ criterion_id: c.id, external_code: c.code,
    raw_value: values[index] ?? null, is_na: values[index] == null, explanation: "Оператор ответил на вопрос.",
    evidence_message_ids: index === 1 ? [] : [`${id}:m0009`], processing_state: "completed", model_id: model }));
  const run: ExportRun = { status: "completed", final_score: score.finalScore, critical_flag: false,
    finalized_at: null, finalized_score: null, finalized_critical_flag: null };
  return { conversation, criteria, run, checklist };
}

test("serializes raw Boolean, N/A and numerical values using original array positions including system/bot turns", () => {
  const input = fixture();
  const { result, modelName } = serializeEvaluation(input);
  assert.deepEqual(result.criteria.map(c => c.criterion_id), ["contact", "discovery", "identification", "consultation", "empathy", "dialogue", "closure", "critical"]);
  assert.equal(result.criteria[0]!.value, true);
  assert.equal(result.criteria[1]!.value, null);
  assert.equal(result.criteria[3]!.value, 15);
  assert.equal(result.criteria[5]!.value, 7); // Raw 7, rather than 10.5 weighted points.
  assert.equal(result.criteria[7]!.value, false);
  assert.deepEqual(result.criteria[0]!.evidence_turns, [2]); // m0009 is intentionally at source position 2.
  assert.deepEqual(result.criteria[1]!.evidence_turns, []);
  assert.equal(result.score.final_score, score.finalScore);
  assert.equal(modelName, "actual-test-model");
});

test("exports stored reviewer-finalized values, justification, score and separate severe flag", () => {
  const input = fixture();
  const revised = new Map(checklist.map((c, index) => [c.id, values[index] ?? null]));
  revised.set(checklist[0]!.id, false);
  revised.set(checklist[7]!.id, true);
  const finalized = calculateEvaluationScore(checklist, revised);
  input.run = { ...input.run, finalized_at: new Date(), finalized_score: finalized.finalScore, finalized_critical_flag: true };
  const { result } = serializeEvaluation({ ...input, appeals: [
    { criterion_id: checklist[0]!.id, status: "OVERRIDDEN", updated_at: new Date("2025-01-01"), decision: { reviewer: "reviewer", justification: "Final reviewer rationale", decided_at: new Date("2025-01-01"), effective_value: false } },
    { criterion_id: checklist[7]!.id, status: "OVERRIDDEN", updated_at: new Date("2025-01-01"), decision: { reviewer: "reviewer", justification: "Critical finding", decided_at: new Date("2025-01-01"), effective_value: true } }
  ] });
  assert.equal(result.criteria[0]!.value, false);
  assert.equal(result.criteria[0]!.rationale, "Final reviewer rationale");
  assert.equal(result.score.final_score, finalized.finalScore);
  assert.equal(result.score.critical_flag, true);
  assert.equal(input.criteria[0]!.raw_value, true); // Historical evaluation remains unchanged.
});

test("rejects incomplete results, unknown stable evidence IDs and mixed actual criterion models", () => {
  const input = fixture();
  assert.throws(() => serializeEvaluation({ ...input, run: { ...input.run, status: "processing" } }), /completed evaluation/);
  input.criteria[0]!.evidence_message_ids = ["different-conversation:m0009"];
  assert.throws(() => serializeEvaluation(input), /unknown transcript message/);
  input.criteria[0]!.evidence_message_ids = [];
  input.criteria[0]!.model_id = "different-model";
  assert.throws(() => serializeEvaluation(input), /incompatible/);
});

test("exports revised rationale and stable evidence without modifying the original evaluation", () => {
  const input = fixture();
  const original = structuredClone(input.criteria);
  input.run = { ...input.run, finalized_at: new Date(), finalized_score: score.finalScore, finalized_critical_flag: false };
  const { result } = serializeEvaluation({ ...input, appeals: [{ criterion_id: checklist[0]!.id, status: "OVERRIDDEN", updated_at: new Date(), decision: {
    reviewer: "reviewer", justification: "Evidence supports a reasoning revision", decided_at: new Date(), effective_value: true,
    outcome: "REASONING_CHANGED", effective_explanation: "Revised evaluation explanation", effective_evidence_message_ids: ["one:m0001"]
  } }] });
  assert.equal(result.criteria[0]!.rationale, "Revised evaluation explanation");
  assert.deepEqual(result.criteria[0]!.evidence_turns, [3]);
  assert.deepEqual(input.criteria, original);
});

// Small database adapter verifies selection/reviewer/HTTP behavior without requiring a live MongoDB server.
type Row = Record<string, any>;
function database(inputs = [fixture()]) {
  const records: Record<string, Row[]> = { conversations: [], evaluation_runs: [], criterion_evaluations: [], appeals: [],
    checklist_versions: [{ _id: "version", criteria: checklist }] };
  for (const input of inputs) {
    const id = input.conversation.conversation_id;
    records.conversations!.push({ ...input.conversation, message_count: input.conversation.transcript.length });
    records.evaluation_runs!.push({ ...input.run, _id: `run-${id}`, run_id: `run-${id}`, conversation_id: id,
      dataset_group_id: "SMOKE", completed_at: new Date("2025-01-01"), requested_at: new Date("2025-01-01"),
      checklist_version_id: "version", model_id: "requested-test-model", checklist_snapshot: { criteria: checklist } });
    records.criterion_evaluations!.push(...input.criteria.map(c => ({ ...c, evaluation_run_id: `run-${id}` })));
  }
  const matches = (row: Row, filter: Row) => Object.entries(filter).every(([key, value]) => value && typeof value === "object" && "$ne" in value
    ? row[key] != null && row[key] !== value.$ne : row[key] === value);
  const sorted = (items: Row[], sort: Row = {}) => [...items].sort((a, b) => {
    for (const [field, direction] of Object.entries(sort)) {
      if (a[field] > b[field]) return Number(direction);
      if (a[field] < b[field]) return -Number(direction);
    }
    return 0;
  });
  const db = { collection: (name: string) => ({
    findOne: async (filter: Row, options?: Row) => sorted((records[name] ?? []).filter(row => matches(row, filter)), options?.sort)[0] ?? null,
    find: (filter: Row) => {
      let items = (records[name] ?? []).filter(row => matches(row, filter));
      const cursor = { sort: (sort: Row) => { items = sorted(items, sort); return cursor; },
        limit: (count: number) => { items = items.slice(0, count); return cursor; }, toArray: async () => items };
      return cursor;
    }
  }) } as unknown as Db;
  return { db, records };
}
const config = { teamName: "Настоящая команда" } as AppConfig;

test("individual, selected bulk and organizer batch exports use the identical serializer", async () => {
  const { db } = database([fixture("one"), fixture("two")]);
  const one = await buildSelectedOrganizerResults(db, config, { conversations: [{ conversation_id: "one" }] });
  const bulk = await buildSelectedOrganizerResults(db, config, { conversations: [{ conversation_id: "one" }, { conversation_id: "two" }] });
  const batch = await buildOrganizerResults(db, config, { status: "completed", checklist_version_id: "version", dataset_group_id: "SMOKE", model_id: "requested-test-model",
    conversation_results: [{ conversation_id: "one", evaluation_run_id: "run-one", status: "completed" }, { conversation_id: "two", evaluation_run_id: "run-two", status: "completed" }] } as never);
  assert.deepEqual(one.results[0], bulk.results[0]);
  assert.deepEqual(bulk, batch.document);
  assert.equal(bulk.model.name, "actual-test-model");
});

test("prefers the latest finalized run over a newer original completed evaluation", async () => {
  const { db, records } = database();
  const original = records.evaluation_runs![0]!;
  records.evaluation_runs!.push({ ...original, run_id: "approved-run", completed_at: new Date("2024-01-01"),
    finalized_at: new Date("2025-02-01"), finalized_score: score.finalScore, finalized_critical_flag: false });
  records.evaluation_runs!.push({ ...original, run_id: "older-approved-run", completed_at: new Date("2023-01-01"),
    finalized_at: new Date("2024-02-01"), finalized_score: score.finalScore, finalized_critical_flag: false });
  records.criterion_evaluations!.push(...records.criterion_evaluations!.map(c => ({ ...c, evaluation_run_id: "approved-run", explanation: "Reviewer approved source" })));
  const result = await buildSelectedOrganizerResults(db, config, { conversations: [{ conversation_id: "one" }] });
  assert.equal(result.results[0]!.status, "ok");
  assert.equal(result.results[0]!.criteria[0]!.rationale, "Reviewer approved source");
});

test("preview reports incomplete selections and download requires an explicit eligible selection", async () => {
  const { db } = database();
  const selection = { conversations: [{ conversation_id: "one" }, { conversation_id: "missing" }] };
  const preview = await previewConversationExport(db, config, selection);
  assert.equal(preview.eligible.length, 1);
  assert.equal(preview.issues[0]!.conversation_id, "missing");
  await assert.rejects(buildSelectedOrganizerResults(db, config, selection), /explicitly choose eligible/);
  assert.equal((await buildSelectedOrganizerResults(db, config, { conversations: preview.eligible })).results.length, 1);
});

test("rejects incompatible models and unconfigured team rather than falsifying metadata", async () => {
  const { db } = database([fixture("one"), fixture("two", "other-model")]);
  const selection = { conversations: [{ conversation_id: "one" }, { conversation_id: "two" }] };
  const preview = await previewConversationExport(db, config, selection);
  assert.equal(preview.model_conflict, true);
  assert.equal(preview.models.length, 2);
  await assert.rejects(buildSelectedOrganizerResults(db, config, selection), /incompatible models/);
  await assert.rejects(buildSelectedOrganizerResults(db, { ...config, teamName: "" }, { conversations: [{ conversation_id: "one" }] }), /CQA_TEAM_NAME/);
});

test("an unavailable duplicate identity does not hide an otherwise eligible conversation", async () => {
  const { db } = database();
  const preview = await previewConversationExport(db, config, { conversations: [
    { dataset_group_id: "MISSING", conversation_id: "one" },
    { dataset_group_id: "SMOKE", conversation_id: "one" }
  ] });
  assert.deepEqual(preview.eligible, [{ dataset_group_id: "SMOKE", conversation_id: "one" }]);
  assert.equal(preview.issues.length, 1);
  assert.match(preview.issues[0]!.error, /not found/);
});

test("HTTP endpoints download UTF-8 JSON and reject unsuccessful selected records", async () => {
  const app = Fastify();
  const { db } = database();
  await registerResultsExportRoutes(app, db, config);
  try {
    const individual = await app.inject({ method: "GET", url: "/api/v1/conversations/one/export" });
    assert.equal(individual.statusCode, 200);
    assert.match(individual.headers["content-type"]!, /application\/json; charset=utf-8/);
    assert.match(individual.headers["content-disposition"]!, /cqa-one\.json/);
    assert.equal(individual.json().team_name, config.teamName);
    assert.equal(individual.json().results[0].criteria[0].rationale, "Оператор ответил на вопрос.");
    const bulk = await app.inject({ method: "POST", url: "/api/v1/results/export", payload: { conversations: [{ conversation_id: "one" }] } });
    assert.deepEqual(bulk.json(), individual.json());
    const unavailable = await app.inject({ method: "POST", url: "/api/v1/results/export", payload: { conversations: [{ conversation_id: "missing" }] } });
    assert.equal(unavailable.statusCode, 422);
    const preview = await app.inject({ method: "POST", url: "/api/v1/results/export/preview", payload: { conversations: [{ conversation_id: "missing" }] } });
    assert.equal(preview.json().issues.length, 1);
  } finally { await app.close(); }
});
