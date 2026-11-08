import assert from "node:assert/strict";
import test from "node:test";
import type { DeepSeekConfig } from "../../../config/config.js";
import { DeepSeekGateway } from "../adapters/deepseek-gateway.js";
import { LlmGatewayError } from "../application/llm-gateway.js";

const config: DeepSeekConfig = { enabled: true, apiKey: "test-private-key", model: "deepseek-flash", timeoutMs: 1000, maxConcurrency: 1, requestsPerMinute: 10_000 };
const messages = [{ role: "user" as const, content: 'Return JSON: {"status":"ok"}' }];

test("sends the official DeepSeek JSON contract and records the actual model and token usage", async () => {
  const gateway = new DeepSeekGateway(config, (async (url, init) => {
    assert.equal(url, "https://api.deepseek.com/chat/completions");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer test-private-key");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "deepseek-flash");
    assert.deepEqual(body.thinking, { type: "disabled" });
    assert.deepEqual(body.response_format, { type: "json_object" });
    assert.equal(body.max_tokens, 2200);
    assert.equal(body.stream, false);
    assert.doesNotMatch(String(init?.body), /test-private-key/);
    return new Response(JSON.stringify({ model: "actual-deepseek-model", choices: [{ finish_reason: "stop", message: { content: '{"status":"ok"}' } }], usage: { total_tokens: 20 } }));
  }) as typeof fetch);
  const result = await gateway.complete(messages, { maxTokens: 2200, workflow: "metadata" });
  assert.equal(result.modelId, "actual-deepseek-model");
  assert.equal(result.content, '{"status":"ok"}');
  assert.deepEqual(result.usage, { total_tokens: 20 });
});

test("reports fallback authentication, balance, rate limits and outages without echoing provider secrets", async () => {
  for (const [status, category, retryable] of [[401, "authentication", false], [402, "billing", false], [403, "authorization", false], [404, "not_found", false], [429, "rate_limited", true], [503, "provider_unavailable", true]] as const) {
    const gateway = new DeepSeekGateway(config, (async () => new Response(JSON.stringify({ error: { message: config.apiKey } }), { status, headers: { "retry-after": "12" } })) as typeof fetch);
    await assert.rejects(() => gateway.complete(messages), (error: unknown) => {
      assert.ok(error instanceof LlmGatewayError);
      assert.equal(error.category, category);
      assert.equal(error.retryable, retryable);
      assert.doesNotMatch(error.message, /test-private-key/);
      if (status === 429) assert.equal(error.retryAfterMs, 12_000);
      return true;
    });
  }
});

test("does not accept blank, non-JSON envelopes or truncated fallback responses", async () => {
  for (const payload of [null, { choices: [{ message: { content: "   " } }] }, { choices: [{ finish_reason: "length", message: { content: '{"partial":' } }] }]) {
    const gateway = new DeepSeekGateway(config, (async () => new Response(JSON.stringify(payload))) as typeof fetch);
    await assert.rejects(() => gateway.complete(messages), (error: unknown) => error instanceof LlmGatewayError && error.category === "malformed_response");
  }
});

test("timeouts abort the fallback request and network errors never echo transport details", async () => {
  const gateway = new DeepSeekGateway({ ...config, timeoutMs: 5 }, ((_url, init) => new Promise((_resolve, reject) => {
    init!.signal!.addEventListener("abort", () => reject(new Error(config.apiKey)), { once: true });
  })) as typeof fetch);
  await assert.rejects(() => gateway.complete(messages), (error: unknown) => error instanceof LlmGatewayError && error.category === "timeout" && !error.message.includes(config.apiKey));
  const unreachable = new DeepSeekGateway(config, (async () => { throw new Error(config.apiKey); }) as typeof fetch);
  await assert.rejects(() => unreachable.complete(messages), (error: unknown) => error instanceof LlmGatewayError && error.category === "network" && !error.message.includes(config.apiKey));
});

test("missing keys are rejected before attempting a request", async () => {
  const gateway = new DeepSeekGateway({ ...config, apiKey: "" }, (async () => { assert.fail("No request without a key"); }) as typeof fetch);
  await assert.rejects(() => gateway.complete(messages), (error: unknown) => error instanceof LlmGatewayError && error.category === "configuration");
});
