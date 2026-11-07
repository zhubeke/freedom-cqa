import assert from "node:assert/strict";
import test from "node:test";
import type { AppConfig } from "../../../config/config.js";
import { ACTION_FEATURE_VERSION, type ActionFeatures } from "../application/action.types.js";
import { classifyWithRules } from "../application/deterministic-rules.js";
import { extractActionFeatures } from "../application/extract-features.js";
import { ACTION_FEATURE_ORDER, approvedFeatureRow, validateFeatureVector } from "../application/feature-schema.js";
import { trainingReadiness } from "../application/training-readiness.js";
import { TabPfnAdapter, TabPfnError } from "../adapters/tabpfn/tabpfn-adapter.js";
import { ClassificationRepository } from "../adapters/persistence/classification-repository.js";

const emptyFeatures = (): ActionFeatures => Object.fromEntries(ACTION_FEATURE_ORDER.map((key) => [key, null])) as unknown as ActionFeatures;
const resolved = (): ActionFeatures => ({ ...emptyFeatures(), quality_score: 92, resolution_status: "resolved", severe_violation: false });

test("extracts stable v1 features and preserves N/A separately from zero", () => {
  const features = extractActionFeatures({
    metadata: { deterministic: { conversation: { duration_seconds: { value: 90 } }, messages_and_turns: { client_turn_count: 2, operator_turn_count: 3, human_handoff_count: 1 }, response_timing: { first_operator_response_seconds: { value: 2 }, average_operator_response_seconds: { value: 4 }, maximum_operator_response_seconds: { value: 7 }, long_waiting_periods: [] } }, semantic: null },
    evaluation: { final_score: 80 }, criteria: [
      { criterion_id: "freedom-criterion-01", raw_value: false, is_na: false, processing_state: "completed" },
      { criterion_id: "freedom-criterion-02", raw_value: null, is_na: true, processing_state: "completed" }
    ], audio: null
  });
  assert.equal(features.greeting_score, 0); assert.equal(features.greeting_applicable, true);
  assert.equal(features.needs_identification_score, null); assert.equal(features.needs_identification_applicable, false);
  assert.equal(features.silence_ratio, null); assert.deepEqual(Object.keys(features), [...ACTION_FEATURE_ORDER]);
  assert.equal(validateFeatureVector(features).length, 0); assert.equal(approvedFeatureRow(features).length, ACTION_FEATURE_ORDER.length);
  assert.equal(ACTION_FEATURE_VERSION, "action-features.v1");
});

test("rule priority enforces severe-violation compliance override", () => {
  const features = { ...resolved(), severe_violation: true, resolution_status: "unresolved", followup_promised: true };
  assert.equal(classifyWithRules(features).action, "COMPLIANCE_REVIEW");
});
test("classifies p1-ru-001-shaped completed service request as no action", () => assert.equal(classifyWithRules(resolved()).action, "NO_ACTION"));
test("classifies p1-ru-003-shaped unanswered request as unresolved escalation", () => assert.equal(classifyWithRules({ ...emptyFeatures(), resolution_status: "unresolved", unresolved_intent_count: 1 }).action, "ESCALATE_UNRESOLVED_CASE"));
test("classifies p1-en-006-shaped pending commitment as callback", () => assert.equal(classifyWithRules({ ...emptyFeatures(), resolution_status: "partially_resolved", followup_promised: true }).action, "CUSTOMER_CALLBACK"));
test("substantial inappropriate conduct receives supervisor review", () => assert.equal(classifyWithRules(emptyFeatures(), { semantic: { operator_behavior: { inappropriate_behavior: { value: true, evidence_message_ids: ["m4"] } } } }).action, "SUPERVISOR_REVIEW"));
test("missing metadata never becomes successful resolution", () => assert.equal(classifyWithRules(emptyFeatures()).action, "SUPERVISOR_REVIEW"));

test("requires sufficient verified labels across at least two represented classes", () => {
  const labels = Array.from({ length: 6 }, (_, index) => ({ _id: index, verified_action: index < 3 ? "NO_ACTION" as const : "CUSTOMER_CALLBACK" as const, feature_version: ACTION_FEATURE_VERSION }));
  assert.equal(trainingReadiness(labels, 3, 12).ready, false);
  assert.equal(trainingReadiness([...labels, ...labels.map((item, index) => ({ ...item, _id: index + 6 }))], 3, 12).ready, true);
});

test("duplicate requests are idempotent while forced reclassification preserves history", async () => {
  const records: any[] = [];
  const collection = {
    findOne: async (filter: any) => records.slice().reverse().find((item) => Object.entries(filter).every(([key, expected]: [string, any]) => expected?.$in ? expected.$in.includes(item[key]) : item[key] === expected)) ?? null,
    insertOne: async (document: any) => { records.push(document); return { insertedId: document._id }; }
  };
  const repository = new ClassificationRepository({ collection: () => collection } as any);
  const first = await repository.queue("DEV", "p1-ru-001"); const duplicate = await repository.queue("DEV", "p1-ru-001");
  assert.equal(duplicate.duplicate, true); assert.equal(records.length, 1);
  const forced = await repository.queue("DEV", "p1-ru-001", true); assert.notEqual(first.result.result_id, forced.result.result_id); assert.equal(records.length, 2);
  const event = await repository.queue("DEV", "p1-ru-002", false, "classification:event-1"); const replay = await repository.queue("DEV", "p1-ru-002", false, "classification:event-1");
  assert.equal(event.duplicate, false); assert.equal(replay.duplicate, true); assert.equal(records.length, 3);
});

const tabConfig: AppConfig["tabpfn"] = { enabled: true, apiKey: "prior-secret", baseUrl: "https://api.priorlabs.ai", modelId: "v3.5_default", timeoutMs: 100, maxRetries: 0 };
test("TabPFN adapter uploads only allowlisted features and validates probabilities", async () => {
  const bodies: string[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    bodies.push(String(init?.body ?? "")); const url = String(input);
    if (url.endsWith("prepare_test_set_upload")) return new Response(JSON.stringify({ test_set_upload_id: "test", x_test_info: { signed_urls: ["https://upload.example/test"], required_headers: {} } }), { status: 200 });
    if (url === "https://upload.example/test") return new Response(null, { status: 200 });
    return new Response(JSON.stringify({ prediction: [[0.2, 0.8]], metadata: { classes: ["NO_ACTION", "CUSTOMER_CALLBACK"] } }), { status: 200 });
  }) as typeof fetch;
  const prediction = await new TabPfnAdapter(tabConfig, fetcher).predict("model", resolved(), ["NO_ACTION", "CUSTOMER_CALLBACK"]);
  assert.equal(prediction.action, "CUSTOMER_CALLBACK"); assert.equal(prediction.confidence, 0.8);
  assert.doesNotMatch(bodies.join("\n"), /conversation_id|transcript|phone|prior-secret/);
});
test("TabPFN adapter rejects authentication failure", async () => {
  const fetcher = (async () => new Response("{}", { status: 401 })) as typeof fetch;
  await assert.rejects(() => new TabPfnAdapter(tabConfig, fetcher).predict("model", resolved(), ["NO_ACTION", "CUSTOMER_CALLBACK"]), (error: unknown) => error instanceof TabPfnError && error.category === "authentication");
});
test("TabPFN adapter bounds provider timeouts", async () => {
  const fetcher = (async (_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true }))) as typeof fetch;
  await assert.rejects(() => new TabPfnAdapter({ ...tabConfig, timeoutMs: 5 }, fetcher).predict("model", resolved(), ["NO_ACTION"]), (error: unknown) => error instanceof TabPfnError && error.category === "timeout");
});
test("TabPFN adapter rejects malformed prediction response", async () => {
  const fetcher = (async (input: string | URL | Request) => String(input).includes("prepare_test") ? new Response(JSON.stringify({ test_set_upload_id: "test", x_test_info: { signed_urls: ["https://upload.example/test"] } })) : String(input).includes("upload.example") ? new Response() : new Response(JSON.stringify({ prediction: ["bad"] }))) as typeof fetch;
  await assert.rejects(() => new TabPfnAdapter(tabConfig, fetcher).predict("model", resolved(), ["NO_ACTION"]), (error: unknown) => error instanceof TabPfnError && error.category === "invalid_response");
});
