import assert from "node:assert/strict";
import test from "node:test";
import { FallbackGateway } from "../adapters/fallback-gateway.js";
import { LlmGatewayError, type LlmErrorCategory, type LlmGateway, type LlmResponse } from "../application/llm-gateway.js";
import { evaluateCriterion } from "../../criterion-evaluation/application/evaluate-criterion.js";
import { freedomDefaultConfiguration } from "../../checklist-management/seed/freedom-default-checklist.js";

const response: LlmResponse = { content: "{}", modelId: "backup-model", latencyMs: 1, usage: null };
const messages = [{ role: "user" as const, content: "Return JSON." }];

test("a healthy primary does not make a paid fallback request", async () => {
  let fallbackCalls = 0;
  const primary: LlmGateway = { complete: async () => ({ ...response, modelId: "primary-model" }) };
  const fallback: LlmGateway = { complete: async () => { fallbackCalls++; return response; } };
  const result = await new FallbackGateway(primary, fallback).complete(messages);
  assert.equal(result.modelId, "primary-model");
  assert.equal(fallbackCalls, 0);
});

test("provider errors switch to the backup and preserve request options and model attribution", async () => {
  for (const category of ["configuration", "authentication", "authorization", "quota_exhausted", "rate_limited", "provider_unavailable", "timeout", "network", "malformed_response"] satisfies LlmErrorCategory[]) {
    const primary: LlmGateway = { complete: async () => { throw new LlmGatewayError("Primary failed", category, false); } };
    let calls = 0;
    const fallback: LlmGateway = { complete: async (actualMessages, options) => {
      calls++;
      assert.equal(actualMessages, messages);
      assert.deepEqual(options, { workflow: "metadata", maxTokens: 2200 });
      return response;
    } };
    assert.equal((await new FallbackGateway(primary, fallback).complete(messages, { workflow: "metadata", maxTokens: 2200 })).modelId, "backup-model");
    assert.equal(calls, 1);
  }
});

test("both providers failing returns the backup error without a failover loop", async () => {
  let calls = 0;
  const primary: LlmGateway = { complete: async () => { throw new LlmGatewayError("Primary quota exhausted", "quota_exhausted", true, 429, 21_600_000); } };
  const error = new LlmGatewayError("Backup unavailable", "provider_unavailable", true, 503);
  const fallback: LlmGateway = { complete: async () => { calls++; throw error; } };
  await assert.rejects(() => new FallbackGateway(primary, fallback).complete(messages), (caught: unknown) => caught === error);
  assert.equal(calls, 1);
});

test("programming errors are surfaced without sending another request", async () => {
  const error = new TypeError("Programming error");
  const primary: LlmGateway = { complete: async () => { throw error; } };
  const fallback: LlmGateway = { complete: async () => { assert.fail("Fallback must not run"); } };
  await assert.rejects(() => new FallbackGateway(primary, fallback).complete(messages), (caught: unknown) => caught === error);
});

test("a criterion still invalid after repair switches providers and validates the backup evidence", async () => {
  let primaryCalls = 0, fallbackCalls = 0;
  const primary: LlmGateway = { complete: async () => { primaryCalls++; return { ...response, content: "not JSON", modelId: "primary-model" }; } };
  let evidenceId = "conversation:m0000";
  const fallback: LlmGateway = { complete: async () => {
    fallbackCalls++;
    return { ...response, content: JSON.stringify({ criterion_id: "critical", value: false, rationale: "No violations in the reply.", evidence_message_ids: [evidenceId], confidence: 0.9, model_id: "ignored" }) };
  } };
  const input = { gateway: new FallbackGateway(primary, fallback), criterion: freedomDefaultConfiguration.criteria[7]!, externalCode: "critical", maxRetries: 1, language: "en", messages: [{ message_id: "conversation:m0000", speaker: "operator" as const, text: "Hello, how can I help?", timestamp: "00:00" }] };
  const result = await evaluateCriterion(input);
  assert.equal(primaryCalls, 2);
  assert.equal(fallbackCalls, 1);
  assert.equal(result.value, false);
  assert.equal(result.model_id, "backup-model");
  assert.deepEqual(result.evidence_turns, [1]);
  evidenceId = "invented:m9999";
  await assert.rejects(() => evaluateCriterion(input), /not present/);
  assert.equal(primaryCalls, 4);
  assert.equal(fallbackCalls, 3);
});
