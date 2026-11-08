import Bottleneck from "bottleneck";
import { createHash } from "node:crypto";
import { Redis } from "ioredis";
import type { AppConfig, CloudflareProfileConfig } from "../../../config/config.js";
import { LlmGatewayError, type LlmCompletionOptions, type LlmGateway, type LlmMessage, type LlmResponse } from "../application/llm-gateway.js";
import { CloudflareGateway } from "./cloudflare-gateway.js";

const PLACEHOLDERS = new Set(["", "not_configured", "replace_with_account_id", "replace_with_newly_rotated_token", "change_me"]);
const accountLimiters = new Map<string, Bottleneck>();
export type CloudflareProfileStatus = "available" | "rate_limited" | "quota_exhausted" | "invalid_credentials" | "permission_denied" | "misconfigured" | "temporarily_unavailable";
export interface PoolProfileState { config: CloudflareProfileConfig; status: CloudflareProfileStatus; statusChangedAt: number; cooldownUntil: number; successes: number; failures: number; rateLimited: number; requests: number; inFlight: number; waitMs: number; lastErrorCategory: string | null }
export interface CloudflareDiagnostic { profile: string; configured: boolean; token: "valid" | "invalid" | "missing" | "unknown"; permission: "available" | "denied" | "unknown"; model: "available" | "unavailable" | "unknown"; capacity: CloudflareProfileStatus | "unknown"; detail?: string }

const usable = (value: string) => !PLACEHOLDERS.has(value.trim().toLowerCase());
const accountKey = (profile: CloudflareProfileConfig) => createHash("sha256").update(`${profile.accountId}:${profile.model}`).digest("hex").slice(0, 32);

export function validateCloudflareProfiles(profiles: CloudflareProfileConfig[]): string[] {
  const errors: string[] = []; const ids = new Set<string>();
  for (const profile of profiles) {
    if (ids.has(profile.id)) errors.push(`Duplicate Cloudflare profile ID: ${profile.id}`); ids.add(profile.id);
    if (!profile.id || /token|secret|account/i.test(profile.id)) errors.push("Profile IDs must be non-sensitive stable identifiers");
    if (profile.enabled && !usable(profile.accountId)) errors.push(`${profile.id}: account ID is not configured`);
    if (profile.enabled && !usable(profile.apiToken)) errors.push(`${profile.id}: API token is not configured`);
    if (profile.endpoint) { try { if (new URL(profile.endpoint).protocol !== "https:") errors.push(`${profile.id}: endpoint must use HTTPS`); } catch { errors.push(`${profile.id}: endpoint is invalid`); } }
  }
  const operational = profiles.filter((item) => item.enabled && usable(item.accountId) && usable(item.apiToken));
  for (const profile of operational) {
    const sameBudget = operational.filter((item) => item.accountId === profile.accountId && item.model === profile.model);
    if (sameBudget.some((item) => item.requestsPerMinute !== profile.requestsPerMinute || item.maxConcurrency !== profile.maxConcurrency)) errors.push(`${profile.id}: profiles sharing an account/model must configure the same account budget`);
  }
  return [...new Set(errors)];
}

export function redactCloudflareSecrets(value: unknown, profiles: CloudflareProfileConfig[]): string {
  let output = typeof value === "string" ? value : JSON.stringify(value);
  for (const secret of profiles.flatMap((item) => [item.apiToken, item.accountId, item.endpoint ?? ""]).filter(Boolean)) output = output.replaceAll(secret, "[redacted]");
  return output.replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]");
}

export class CloudflareCredentialPool implements LlmGateway {
  private readonly states: PoolProfileState[]; private readonly redis: Redis | null;
  constructor(private readonly base: AppConfig["llm"], private readonly fetcher: typeof fetch = fetch, profiles = base.profiles ?? [], redisUrl?: string) {
    this.states = profiles.filter((profile) => profile.enabled).map((config) => ({ config, status: usable(config.accountId) && usable(config.apiToken) ? "available" : "misconfigured", statusChangedAt: Date.now(), cooldownUntil: 0, successes: 0, failures: 0, rateLimited: 0, requests: 0, inFlight: 0, waitMs: 0, lastErrorCategory: null }));
    this.redis = redisUrl ? new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false }) : null;
    this.redis?.on("error", () => undefined);
  }
  private redisKey(state: PoolProfileState) { return `cqa:cf:account:${accountKey(state.config)}:state`; }
  private async readSharedState(state: PoolProfileState) {
    if (!this.redis) return;
    try {
      if (this.redis.status === "wait") await this.redis.connect();
      const shared = await this.redis.hgetall(this.redisKey(state)); const until = Number(shared.cooldown_until || 0);
      if (shared.status && until > Date.now()) this.applyAccountState(state, shared.status as CloudflareProfileStatus, until, shared.last_error_category || null, false);
    } catch { /* Local state remains safe when Redis diagnostics are unavailable. */ }
  }
  private applyAccountState(source: PoolProfileState, status: CloudflareProfileStatus, cooldownUntil: number, category: string | null, persist = true) {
    for (const state of this.states.filter((item) => usable(item.config.accountId) && accountKey(item.config) === accountKey(source.config))) {
      if (state.status !== status) state.statusChangedAt = Date.now();
      state.status = status; state.cooldownUntil = cooldownUntil; state.lastErrorCategory = category;
    }
    if (persist && this.redis) {
      const ttl = Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 1000));
      void this.redis.hset(this.redisKey(source), { status, cooldown_until: String(cooldownUntil), last_error_category: category ?? "", changed_at: String(Date.now()) }).then(() => this.redis!.expire(this.redisKey(source), ttl)).catch(() => undefined);
    }
  }
  private limiter(state: PoolProfileState) {
    const key = accountKey(state.config); let limiter = accountLimiters.get(key);
    if (!limiter) {
      const options = this.redis?.options;
      limiter = new Bottleneck({ id: `cqa-cf-${key}`, maxConcurrent: state.config.maxConcurrency, minTime: Math.ceil(60_000 / state.config.requestsPerMinute), reservoir: state.config.requestsPerMinute, reservoirRefreshAmount: state.config.requestsPerMinute, reservoirRefreshInterval: 60_000,
        ...(options ? { datastore: "ioredis", clearDatastore: false, clientOptions: { host: options.host, port: options.port, ...(options.username ? { username: options.username } : {}), ...(options.password ? { password: options.password } : {}), db: options.db, lazyConnect: false } } : {}) });
      accountLimiters.set(key, limiter);
    }
    return limiter;
  }

  async complete(messages: LlmMessage[], options: LlmCompletionOptions = {}): Promise<LlmResponse> {
    const operational = this.states.filter((state) => state.status !== "misconfigured");
    if (!operational.length) throw new LlmGatewayError("No Cloudflare profile has both a rotated API token and account ID", "configuration", false);
    await Promise.all(operational.map((state) => this.readSharedState(state)));
    let lastError: unknown; const attempted = new Set<string>(); const accountCount = new Set(operational.map((state) => accountKey(state.config))).size;
    while (attempted.size < accountCount) {
      const now = Date.now();
      for (const state of operational) if (state.cooldownUntil && state.cooldownUntil <= now) this.applyAccountState(state, "available", 0, null, false);
      const state = operational.filter((item) => item.status === "available" && !attempted.has(accountKey(item.config))).sort((a, b) => (a.inFlight - b.inFlight) || (a.requests - b.requests) || (this.states.indexOf(a) - this.states.indexOf(b)))[0];
      if (!state) break;
      attempted.add(accountKey(state.config)); state.requests += 1; state.inFlight += 1; const queuedAt = Date.now();
      const config: AppConfig["llm"] = { ...this.base, provider: state.config.endpoint ? "custom_worker" : "workers_ai", endpoint: state.config.endpoint, accountId: state.config.accountId, apiToken: state.config.apiToken, model: state.config.model, maxRetries: 0, profiles: [] };
      try {
        const priority = ({ connectivity: 0, evaluation: 1, metadata: 3, sentiment: 4 } as const)[options.workflow ?? "evaluation"];
        const response = await this.limiter(state).schedule({ priority, id: `${options.workflow ?? "evaluation"}:${crypto.randomUUID()}` }, () => new CloudflareGateway(config, this.fetcher, new Bottleneck({ maxConcurrent: state.config.maxConcurrency })).complete(messages, options));
        state.successes += 1; state.lastErrorCategory = null; return response;
      } catch (error) {
        state.failures += 1; lastError = error;
        if (!(error instanceof LlmGatewayError)) throw error;
        if (error.category === "quota_exhausted") this.applyAccountState(state, "quota_exhausted", Date.now() + (this.base.quotaRecheckMs ?? 21_600_000), error.category);
        else if (error.category === "rate_limited") { state.rateLimited += 1; this.applyAccountState(state, "rate_limited", Date.now() + Math.max(error.retryAfterMs ?? 30_000, 1_000), error.category); }
        else if (error.category === "authentication") this.applyAccountState(state, "invalid_credentials", Date.now() + 300_000, error.category);
        else if (["authorization", "not_found"].includes(error.category)) this.applyAccountState(state, "permission_denied", Date.now() + 300_000, error.category);
        else if (error.retryable) this.applyAccountState(state, "temporarily_unavailable", Date.now() + 10_000, error.category);
        else throw error;
      } finally { state.inFlight -= 1; state.waitMs += Date.now() - queuedAt; }
    }
    // A cooldown is still an account error. Preserve its category on subsequent
    // requests instead of turning rejected credentials/models into endless retries.
    const cooling = operational.filter((state) => state.cooldownUntil > Date.now());
    const retryableStates = cooling.filter((state) => ["quota_exhausted", "rate_limited", "temporarily_unavailable"].includes(state.status));
    const next = (retryableStates.length ? retryableStates : cooling).sort((a, b) => a.cooldownUntil - b.cooldownUntil)[0];
    if (next) {
      const category = next.status === "quota_exhausted" ? "quota_exhausted"
        : next.status === "rate_limited" ? "rate_limited"
        : next.status === "invalid_credentials" ? "authentication"
        : next.status === "permission_denied" ? (next.lastErrorCategory === "not_found" ? "not_found" : "authorization")
        : "provider_unavailable";
      const retryable = retryableStates.length > 0;
      const detail = lastError instanceof LlmGatewayError && lastError.category === category ? lastError.message
        : category === "authentication" ? "Cloudflare rejected the configured API tokens"
        : category === "authorization" ? "Cloudflare denied access to the configured model; check account permissions and plan"
        : category === "not_found" ? "Cloudflare account, model, or inference endpoint was not found"
        : category === "quota_exhausted" ? "Cloudflare daily inference quota is exhausted"
        : "AI capacity temporarily unavailable. Your completed results are saved.";
      throw new LlmGatewayError(detail, category, retryable,
        lastError instanceof LlmGatewayError && lastError.category === category ? lastError.statusCode : undefined,
        retryable ? Math.max(0, next.cooldownUntil - Date.now()) : undefined);
    }
    throw lastError instanceof Error ? lastError : new LlmGatewayError("AI capacity temporarily unavailable. Your completed results are saved.", "provider_unavailable", true);
  }

  async diagnostics(): Promise<CloudflareDiagnostic[]> {
    return Promise.all(this.states.map(async (state) => {
      const configured = usable(state.config.accountId) && usable(state.config.apiToken);
      const result: CloudflareDiagnostic = { profile: state.config.id, configured, token: configured ? "unknown" : (usable(state.config.apiToken) ? "unknown" : "missing"), permission: "unknown", model: "unknown", capacity: configured ? (state.status === "available" ? "unknown" : state.status) : "misconfigured" };
      if (!configured) { result.detail = !usable(state.config.accountId) ? "account_id_missing" : "rotated_token_missing"; return result; }
      try {
        const headers = { Authorization: `Bearer ${state.config.apiToken}`, Accept: "application/json" };
        const verification = await this.fetcher("https://api.cloudflare.com/client/v4/user/tokens/verify", { headers });
        const body = await verification.json().catch(() => null) as { result?: { status?: string } } | null;
        if (!verification.ok || body?.result?.status !== "active") { result.token = "invalid"; result.capacity = "invalid_credentials"; return result; }
        result.token = "valid";
        if (state.config.endpoint) { result.detail = "custom_worker_permission_requires_opt_in_inference"; return result; }
        const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(state.config.accountId)}/ai/models/search?search=${encodeURIComponent(state.config.model)}&per_page=50`;
        const models = await this.fetcher(url, { headers });
        if (models.status === 401) { result.token = "invalid"; result.capacity = "invalid_credentials"; return result; }
        if (models.status === 403) { result.permission = "denied"; result.capacity = "permission_denied"; return result; }
        if (!models.ok) { result.detail = `model_catalog_http_${models.status}`; return result; }
        result.permission = "available"; result.model = (await models.text()).includes(state.config.model) ? "available" : "unavailable"; result.detail = "capacity_unverified_without_inference";
        return result;
      } catch { result.detail = "diagnostic_network_error"; return result; }
    }));
  }
  metrics() { return { active_profile_count: this.states.filter((state) => state.status === "available").length, profiles: this.states.map((state) => ({ profile_id: state.config.id, account_key: usable(state.config.accountId) ? accountKey(state.config) : "missing", status: state.status, status_changed_at: state.statusChangedAt, last_error_category: state.lastErrorCategory, requests: state.requests, successes: state.successes, failures: state.failures, http_429: state.rateLimited, cooldown_until: state.cooldownUntil || null, rate_limit_wait_ms: state.waitMs })) }; }
  async close() { if (!this.redis || this.redis.status === "end") return; if (this.redis.status === "wait") this.redis.disconnect(); else await this.redis.quit().catch(() => undefined); }
}
