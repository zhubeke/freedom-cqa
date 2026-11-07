import { Value } from "@sinclair/typebox/value";
import type { AppConfig } from "../../../config/config.js";
import { LlmGatewayError, type LlmCompletionOptions, type LlmGateway, type LlmMessage, type LlmResponse, type LlmUsage } from "../application/llm-gateway.js";
import { NormalizedCustomWorkerResponseSchema } from "../schemas/gateway.schemas.js";

interface ChatCompletionEnvelope {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: LlmUsage;
}

const PLACEHOLDERS = new Set(["not_configured", "replace_with_account_id", "replace_with_newly_rotated_token", "change_me"]);

function assertConfigured(config: AppConfig["llm"]): void {
  if (!config.accountId.trim() || PLACEHOLDERS.has(config.accountId.trim().toLowerCase())) {
    throw new LlmGatewayError("Cloudflare Account ID is not configured", "configuration", false);
  }
  if (!config.apiToken.trim() || PLACEHOLDERS.has(config.apiToken.trim().toLowerCase())) {
    throw new LlmGatewayError("Cloudflare API token is not configured", "configuration", false);
  }
  if (!config.model.trim()) throw new LlmGatewayError("Cloudflare model is not configured", "configuration", false);
  if (config.provider === "custom_worker" && !config.endpoint?.trim()) {
    throw new LlmGatewayError("Custom Worker endpoint is not configured", "configuration", false);
  }
}

function providerErrorMessage(payload: unknown, config: AppConfig["llm"]): string | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as { errors?: Array<{ message?: unknown }>; error?: { message?: unknown }; message?: unknown };
  const raw = value.errors?.find((item) => typeof item.message === "string")?.message
    ?? value.error?.message
    ?? value.message;
  if (typeof raw !== "string" || !raw.trim()) return null;
  return raw.trim()
    .replaceAll(config.apiToken, "[redacted]")
    .replaceAll(config.accountId, "[redacted]");
}

function retryAfterMilliseconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function httpError(status: number, payload: unknown, config: AppConfig["llm"], retryAfter: string | null): LlmGatewayError {
  const detail = providerErrorMessage(payload, config);
  const suffix = detail ? `: ${detail}` : "";
  if (status === 401) return new LlmGatewayError(`Cloudflare rejected the API token${suffix}`, "authentication", false, status);
  if (status === 403) return new LlmGatewayError(`Cloudflare token does not have inference permission${suffix}`, "authorization", false, status);
  if (status === 404) return new LlmGatewayError(`Cloudflare account, model, or inference endpoint was not found${suffix}`, "not_found", false, status);
  if (status === 429) return new LlmGatewayError(`Cloudflare inference rate limit was reached${suffix}`, "rate_limited", true, status, retryAfterMilliseconds(retryAfter));
  if (status >= 500) return new LlmGatewayError(`Cloudflare inference service is unavailable${suffix}`, "provider_unavailable", true, status);
  return new LlmGatewayError(`Cloudflare inference request failed with HTTP ${status}${suffix}`, "authorization", false, status);
}

export class CloudflareGateway implements LlmGateway {
  private rateTail: Promise<void> = Promise.resolve();
  private nextRequestAt = 0;
  constructor(private readonly config: AppConfig["llm"], private readonly fetcher: typeof fetch = fetch) {}

  private async waitForRateLimit() {
    const scheduled = this.rateTail.then(async () => {
      const delay = Math.max(0, this.nextRequestAt - Date.now());
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      this.nextRequestAt = Date.now() + this.config.minRequestIntervalMs;
    });
    this.rateTail = scheduled.catch(() => undefined);
    await scheduled;
  }

  async complete(messages: LlmMessage[], options: LlmCompletionOptions = {}): Promise<LlmResponse> {
    assertConfigured(this.config);
    await this.waitForRateLimit();
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const endpoint = this.config.provider === "custom_worker"
      ? this.config.endpoint!
      : `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(this.config.accountId)}/ai/v1/chat/completions`;
    try {
      const body = this.config.provider === "custom_worker"
        ? { model: this.config.model, messages }
        : { model: this.config.model, messages, temperature: 0, max_tokens: options.maxTokens ?? 500, stream: false };
      const response = await this.fetcher(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.config.apiToken}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw httpError(response.status, payload, this.config, response.headers.get("retry-after"));
      if (this.config.provider === "custom_worker") {
        if (!Value.Check(NormalizedCustomWorkerResponseSchema, payload)) throw new LlmGatewayError("Custom Worker returned an invalid normalized response", "malformed_response", true);
        const normalized = payload as { response: string; model_id: string; usage?: LlmUsage };
        return { content: normalized.response, modelId: normalized.model_id, latencyMs: Date.now() - started, usage: normalized.usage ?? null };
      }
      const envelope = payload as ChatCompletionEnvelope;
      const content = envelope.choices?.[0]?.message?.content;
      if (!content) throw new LlmGatewayError("Workers AI response did not contain choices[0].message.content", "malformed_response", true);
      return { content, modelId: this.config.model, latencyMs: Date.now() - started, usage: envelope.usage ?? null };
    } catch (error) {
      if (error instanceof LlmGatewayError) throw error;
      if (error instanceof Error && error.name === "AbortError") throw new LlmGatewayError(`Cloudflare inference timed out after ${this.config.timeoutMs}ms`, "timeout", true);
      throw new LlmGatewayError("Could not reach the Cloudflare inference endpoint", "network", true);
    } finally { clearTimeout(timer); }
  }
}
