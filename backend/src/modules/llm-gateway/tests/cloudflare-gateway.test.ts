import assert from "node:assert/strict";
import test from "node:test";
import type { AppConfig } from "../../../config/config.js";
import { CloudflareGateway, createLlmLimiter } from "../adapters/cloudflare-gateway.js";
import { LlmGatewayError } from "../application/llm-gateway.js";

const base: AppConfig["llm"] = { provider: "workers_ai", endpoint: null, accountId: "account", apiToken: "secret", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", timeoutMs: 1000, maxConcurrency: 4, requestsPerMinute: 10_000, tokensPerMinute: 0, maxRetries: 2, maxInlineRetryDelayMs: 15_000, minRequestIntervalMs: 0 };
test("uses the OpenAI-compatible Workers AI chat-completions contract without exposing the token", async () => {
  let url = ""; let authorization = ""; let requestBody: Record<string, unknown> = {};
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    url = String(input); authorization = String((init?.headers as Record<string, string>).Authorization);
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ choices: [{ message: { content: "{\"ok\":true}" } }], usage: { total_tokens: 12 } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const result = await new CloudflareGateway(base, fetcher).complete([{ role: "user", content: "test" }]);
  assert.equal(url, "https://api.cloudflare.com/client/v4/accounts/account/ai/v1/chat/completions");
  assert.equal(authorization, "Bearer secret");
  assert.equal(requestBody.model, base.model);
  assert.equal(requestBody.stream, false);
  assert.equal(requestBody.max_tokens, 500);
  assert.equal(result.usage?.total_tokens, 12);
  assert.doesNotMatch(JSON.stringify(result), /secret/);
});

test("supports the documented normalized custom Worker contract", async () => {
  const fetcher = (async () => new Response(JSON.stringify({ response: "{}", model_id: "worker-model", usage: { prompt_tokens: 4 } }), { status: 200 })) as typeof fetch;
  const result = await new CloudflareGateway({ ...base, provider: "custom_worker", endpoint: "https://worker.example/evaluate" }, fetcher).complete([{ role: "user", content: "test" }]);
  assert.equal(result.modelId, "worker-model");
});

for (const [status, category, retryable] of [
  [401, "authentication", false],
  [403, "authorization", false],
  [404, "not_found", false],
  [429, "rate_limited", true],
  [503, "provider_unavailable", true]
] as const) {
  test(`classifies HTTP ${status} and reports sanitized provider details`, async () => {
    const fetcher = (async () => new Response(JSON.stringify({ errors: [{ message: "provider detail for secret in account" }] }), { status })) as typeof fetch;
    await assert.rejects(
      () => new CloudflareGateway(base, fetcher).complete([{ role: "user", content: "test" }]),
      (error: unknown) => error instanceof LlmGatewayError && error.category === category && error.retryable === retryable
        && error.message.includes("provider detail") && !error.message.includes("secret") && !error.message.includes("detail for secret in account")
    );
  });
}

test("rejects placeholder configuration before making a request", async () => {
  let calls = 0;
  const fetcher = (async () => { calls += 1; return new Response(); }) as typeof fetch;
  await assert.rejects(
    () => new CloudflareGateway({ ...base, accountId: "not_configured" }, fetcher).complete([{ role: "user", content: "test" }]),
    (error: unknown) => error instanceof LlmGatewayError && error.category === "configuration" && !error.retryable
  );
  assert.equal(calls, 0);
});

test("retries HTTP 429 and respects Retry-After", async () => {
  let calls = 0;
  const started = Date.now();
  const fetcher = (async () => {
    calls += 1;
    if (calls === 1) return new Response(JSON.stringify({ message: "slow down" }), { status: 429, headers: { "retry-after": "0.02" } });
    return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 });
  }) as typeof fetch;
  await new CloudflareGateway({ ...base, maxRetries: 1 }, fetcher).complete([{ role: "user", content: "test" }]);
  assert.equal(calls, 2);
  assert.ok(Date.now() - started >= 20);
});

test("bounds repeated 429 responses", async () => {
  let calls = 0;
  const fetcher = (async () => { calls += 1; return new Response("{}", { status: 429 }); }) as typeof fetch;
  await assert.rejects(() => new CloudflareGateway({ ...base, maxRetries: 2 }, fetcher).complete([{ role: "user", content: "test" }]), (error: unknown) => error instanceof LlmGatewayError && error.category === "rate_limited");
  assert.equal(calls, 3);
});

test("distinguishes daily neuron quota exhaustion from temporary HTTP 429", async () => {
  const fetcher = (async () => new Response(JSON.stringify({ errors: [{ code: 3036, message: "You have used up your daily free allocation of 10,000 neurons." }] }), { status: 429 })) as typeof fetch;
  await assert.rejects(() => new CloudflareGateway(base, fetcher).complete([{ role: "user", content: "test" }]), (error: unknown) => error instanceof LlmGatewayError && error.category === "quota_exhausted" && error.retryable);
});

test("shares concurrency across workflow gateway instances", async () => {
  let active = 0; let maximum = 0;
  const limiter = createLlmLimiter({ ...base, maxConcurrency: 1 });
  const fetcher = (async () => {
    active += 1; maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    active -= 1;
    return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 });
  }) as typeof fetch;
  const first = new CloudflareGateway(base, fetcher, limiter);
  const second = new CloudflareGateway(base, fetcher, limiter);
  await Promise.all([first.complete([{ role: "user", content: "a" }], { workflow: "evaluation" }), second.complete([{ role: "user", content: "b" }], { workflow: "sentiment" })]);
  assert.equal(maximum, 1);
});
