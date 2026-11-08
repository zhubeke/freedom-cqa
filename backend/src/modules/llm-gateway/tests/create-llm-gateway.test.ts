import assert from "node:assert/strict";
import test from "node:test";
import type { AppConfig } from "../../../config/config.js";
import { createLlmGateway } from "../adapters/create-llm-gateway.js";

const base: AppConfig["llm"] = { provider: "deepseek", endpoint: null, accountId: "cf-account", apiToken: "cf-test-secret", model: "deepseek-flash", cloudflareModel: "cf-test-model", timeoutMs: 1000, maxConcurrency: 1, requestsPerMinute: 10_000, tokensPerMinute: 0, maxRetries: 0, maxInlineRetryDelayMs: 0, minRequestIntervalMs: 0, credentialPoolEnabled: false,
  deepseek: { enabled: true, apiKey: "ds-test-secret", model: "deepseek-flash", timeoutMs: 1000, maxConcurrency: 1, requestsPerMinute: 10_000 }
};
const messages = [{ role: "user" as const, content: "Return JSON." }];
const ok = () => new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }));

test("DeepSeek first uses its own key/model and never calls a healthy Cloudflare backup", async () => {
  const calls: string[] = [];
  const gateway = createLlmGateway(base, undefined, (async (url, init) => {
    calls.push(String(url));
    assert.equal(url, "https://api.deepseek.com/chat/completions");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer ds-test-secret");
    assert.equal(JSON.parse(String(init?.body)).model, "deepseek-flash");
    return ok();
  }) as typeof fetch);
  assert.equal((await gateway.complete(messages)).modelId, "deepseek-flash");
  assert.equal(calls.length, 1);
});

test("DeepSeek failure uses Cloudflare's separate model and credentials", async () => {
  const calls: string[] = [];
  const gateway = createLlmGateway(base, undefined, (async (url, init) => {
    calls.push(String(url));
    if (String(url).includes("api.deepseek.com")) return new Response("{}", { status: 503 });
    assert.match(String(url), /api.cloudflare.com/);
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer cf-test-secret");
    assert.equal(JSON.parse(String(init?.body)).model, "cf-test-model");
    return ok();
  }) as typeof fetch);
  assert.equal((await gateway.complete(messages)).modelId, "cf-test-model");
  assert.equal(calls.length, 2);
  assert.match(calls[0]!, /api.deepseek.com/);
  assert.match(calls[1]!, /api.cloudflare.com/);
});

test("Cloudflare first still falls back to DeepSeek when configured in that order", async () => {
  const calls: string[] = [];
  const gateway = createLlmGateway({ ...base, provider: "workers_ai", model: "cf-test-model" }, undefined, (async (url) => {
    calls.push(String(url));
    return String(url).includes("api.cloudflare.com") ? new Response("{}", { status: 403 }) : ok();
  }) as typeof fetch);
  assert.equal((await gateway.complete(messages)).modelId, "deepseek-flash");
  assert.match(calls[0]!, /api.cloudflare.com/);
  assert.match(calls[1]!, /api.deepseek.com/);
});
