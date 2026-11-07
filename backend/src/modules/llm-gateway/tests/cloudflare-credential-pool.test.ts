import assert from "node:assert/strict";
import test from "node:test";
import type { AppConfig, CloudflareProfileConfig } from "../../../config/config.js";
import { CloudflareCredentialPool, redactCloudflareSecrets, validateCloudflareProfiles } from "../adapters/cloudflare-credential-pool.js";

const base: AppConfig["llm"] = { provider: "workers_ai", endpoint: null, accountId: "legacy", apiToken: "legacy-token", model: "model", timeoutMs: 1000, maxConcurrency: 4, requestsPerMinute: 10000, tokensPerMinute: 0, maxRetries: 0, maxInlineRetryDelayMs: 0, minRequestIntervalMs: 0 };
const profile = (id: string, accountId: string, token: string): CloudflareProfileConfig => ({ id, accountId, apiToken: token, endpoint: null, model: "model", enabled: true, requestsPerMinute: 10000, maxConcurrency: 1 });

test("validates profile configuration and redacts tokens, accounts, endpoints and bearer headers", () => {
  assert.ok(validateCloudflareProfiles([profile("profile_a", "", "")]).length >= 2);
  const profiles = [profile("profile_a", "acct-secret", "token-secret")];
  assert.equal(validateCloudflareProfiles(profiles).length, 0);
  assert.doesNotMatch(redactCloudflareSecrets("Bearer token-secret acct-secret", profiles), /token-secret|acct-secret/);
});

test("fails over from a cooling rate-limited profile to an authorized healthy profile", async () => {
  const used: string[] = [];
  const fetcher = (async (_input: string | URL | Request, init?: RequestInit) => {
    const auth = String((init?.headers as Record<string, string>)?.Authorization); used.push(auth);
    if (auth === "Bearer token-a") return new Response("{}", { status: 429, headers: { "retry-after": "1" } });
    return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 });
  }) as typeof fetch;
  const pool = new CloudflareCredentialPool(base, fetcher, [profile("profile_a", "account-a", "token-a"), profile("profile_b", "account-b", "token-b")]);
  await pool.complete([{ role: "user", content: "test" }]);
  assert.deepEqual(used, ["Bearer token-a", "Bearer token-b"]); assert.equal(pool.metrics().active_profile_count, 1);
});

test("profiles sharing one account/model share the same concurrency budget", async () => {
  let active = 0; let maximum = 0;
  const fetcher = (async () => { active += 1; maximum = Math.max(maximum, active); await new Promise((resolve) => setTimeout(resolve, 15)); active -= 1; return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] })); }) as typeof fetch;
  const pool = new CloudflareCredentialPool(base, fetcher, [profile("profile_a", "shared-account-test", "token-a"), profile("profile_b", "shared-account-test", "token-b")]);
  await Promise.all([pool.complete([{ role: "user", content: "a" }]), pool.complete([{ role: "user", content: "b" }])]);
  assert.equal(maximum, 1);
});

test("daily exhaustion disables the account and fails over without retrying it", async () => {
  const used: string[] = [];
  const fetcher = (async (_input: string | URL | Request, init?: RequestInit) => {
    const auth = String((init?.headers as Record<string, string>)?.Authorization); used.push(auth);
    if (auth === "Bearer quota-token") return new Response(JSON.stringify({ errors: [{ code: 3036, message: "daily free allocation of 10,000 neurons" }] }), { status: 429 });
    return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }));
  }) as typeof fetch;
  const pool = new CloudflareCredentialPool({ ...base, quotaRecheckMs: 60_000 }, fetcher, [profile("primary", "quota-account", "quota-token"), profile("jubo", "healthy-account", "healthy-token")]);
  await pool.complete([{ role: "user", content: "test" }]);
  assert.deepEqual(used, ["Bearer quota-token", "Bearer healthy-token"]);
  assert.equal(pool.metrics().profiles.find((item) => item.profile_id === "primary")?.status, "quota_exhausted");
});

test("all exhausted accounts return a deferred-capacity error", async () => {
  let calls = 0;
  const fetcher = (async () => { calls += 1; return new Response(JSON.stringify({ errors: [{ code: 3036, message: "daily free allocation" }] }), { status: 429 }); }) as typeof fetch;
  const pool = new CloudflareCredentialPool(base, fetcher, [profile("primary", "exhausted-a", "token-a"), profile("jubo", "exhausted-b", "token-b")]);
  await assert.rejects(() => pool.complete([{ role: "user", content: "test" }]), (error: unknown) => error instanceof Error);
  assert.equal(calls, 2);
  assert.equal(pool.metrics().active_profile_count, 0);
});

test("non-inference diagnostics verify token and model permission without chat completion", async () => {
  const urls: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input); urls.push(url);
    if (url.endsWith("/user/tokens/verify")) return new Response(JSON.stringify({ success: true, result: { status: "active" } }));
    return new Response(JSON.stringify({ success: true, result: [{ name: "model" }] }));
  }) as typeof fetch;
  const pool = new CloudflareCredentialPool(base, fetcher, [profile("primary", "diagnostic-account", "diagnostic-token")]);
  const [result] = await pool.diagnostics();
  assert.equal(result?.token, "valid"); assert.equal(result?.permission, "available"); assert.equal(result?.model, "available");
  assert.equal(urls.some((url) => url.includes("chat/completions")), false);
});
