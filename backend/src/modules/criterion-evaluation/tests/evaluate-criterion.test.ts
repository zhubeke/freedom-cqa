import assert from "node:assert/strict";
import test from "node:test";
import { LlmGatewayError, type LlmGateway } from "../../llm-gateway/application/llm-gateway.js";
import { freedomDefaultConfiguration } from "../../checklist-management/seed/freedom-default-checklist.js";
import { evaluateCriterion, validateCriterionResult } from "../application/evaluate-criterion.js";
import { organizerCode } from "../application/external-code.js";

const messages = [{ message_id: "p1-ru-001:m0009", speaker: "operator" as const, text: "Здравствуйте", timestamp: "0:20" }];

test("makes one independent request for every enabled default criterion", async () => {
  let calls = 0;
  const gateway: LlmGateway = { complete: async (prompt) => {
    calls += 1;
    const id = /Criterion ID: (\w+)/.exec(prompt[1]!.content)?.[1] ?? "";
    const criterion = freedomDefaultConfiguration.criteria.find((item) => organizerCode(item) === id)!;
    const value = criterion.answer_type === "numeric" ? criterion.numeric_scale.at(-1)!.value : id === "critical" ? false : true;
    return { content: JSON.stringify({ criterion_id: id, value, rationale: "Supported by the operator message.", evidence_message_ids: [messages[0]!.message_id], confidence: 0.8, model_id: "ignored" }), modelId: "test-model", latencyMs: 3, usage: { total_tokens: 10 } };
  } };
  const results = await Promise.all(freedomDefaultConfiguration.criteria.map((criterion) => evaluateCriterion({ gateway, language: "ru", messages, criterion, externalCode: organizerCode(criterion), maxRetries: 0 })));
  assert.equal(calls, 8);
  assert.deepEqual(results.map((result) => result.criterion_id), ["contact", "discovery", "identification", "consultation", "empathy", "dialogue", "closure", "critical"]);
  assert.ok(results.every((result) => result.evidence_turns[0] === 10));
});

test("strictly rejects wrong IDs, unsupported scores, and nonexistent evidence", () => {
  const criterion = freedomDefaultConfiguration.criteria[3]!;
  const gatewayResult = { content: "", modelId: "test-model", latencyMs: 1, usage: null };
  assert.throws(() => validateCriterionResult({ criterion_id: "wrong", value: 20, rationale: "x", evidence_message_ids: [messages[0]!.message_id], confidence: 1, model_id: "x" }, "consultation", criterion, messages, gatewayResult), /mismatch/);
  assert.throws(() => validateCriterionResult({ criterion_id: "consultation", value: 17, rationale: "x", evidence_message_ids: [messages[0]!.message_id], confidence: 1, model_id: "x" }, "consultation", criterion, messages, gatewayResult), /numeric scale/);
  assert.throws(() => validateCriterionResult({ criterion_id: "consultation", value: 20, rationale: "x", evidence_message_ids: ["m9999"], confidence: 1, model_id: "x" }, "consultation", criterion, messages, gatewayResult), /not present/);
});

test("uses one structured repair attempt for malformed model output", async () => {
  const criterion = freedomDefaultConfiguration.criteria[0]!;
  let calls = 0;
  const prompts: string[][] = [];
  const gateway: LlmGateway = { complete: async (prompt) => {
    calls += 1;
    prompts.push(prompt.map((message) => message.content));
    return {
      content: calls === 1 ? "not json" : JSON.stringify({ criterion_id: "contact", value: true, rationale: "The operator greeted the client.", evidence_message_ids: [messages[0]!.message_id], confidence: 0.8, model_id: "ignored" }),
      modelId: "test-model", latencyMs: 1, usage: null
    };
  } };
  const result = await evaluateCriterion({ gateway, language: "ru", messages, criterion, externalCode: "contact", maxRetries: 1 });
  assert.equal(result.value, true);
  assert.equal(calls, 2);
  assert.match(prompts[1]!.at(-1)!, /Repair it/);
});

test("does not retry permanent gateway failures", async () => {
  const criterion = freedomDefaultConfiguration.criteria[0]!;
  let calls = 0;
  const gateway: LlmGateway = { complete: async () => {
    calls += 1;
    throw new LlmGatewayError("Cloudflare rejected the API token", "authentication", false, 401);
  } };
  await assert.rejects(() => evaluateCriterion({ gateway, language: "ru", messages, criterion, externalCode: "contact", maxRetries: 2 }), /rejected/);
  assert.equal(calls, 1);
});
