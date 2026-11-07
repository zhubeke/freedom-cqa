import assert from "node:assert/strict";
import test from "node:test";
import type { AppConfig } from "../../../config/config.js";
import { CloudflareGateway } from "../adapters/cloudflare-gateway.js";
import { LlmGatewayError } from "../application/llm-gateway.js";

const base: AppConfig["llm"] = { provider: "workers_ai", endpoint: null, accountId: "account", apiToken: "secret", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", timeoutMs: 1000, maxConcurrency: 4, maxRetries: 2, minRequestIntervalMs: 0 };
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
