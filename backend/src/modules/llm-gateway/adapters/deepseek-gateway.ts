import Bottleneck from "bottleneck";
import type { DeepSeekConfig } from "../../../config/config.js";
import { LlmGatewayError, type LlmCompletionOptions, type LlmGateway, type LlmMessage, type LlmResponse, type LlmUsage } from "../application/llm-gateway.js";

export class DeepSeekGateway implements LlmGateway {
  private readonly limiter: Bottleneck;
  constructor(private readonly config: DeepSeekConfig, private readonly fetcher: typeof fetch = fetch) {
    this.limiter = new Bottleneck({ maxConcurrent: config.maxConcurrency, minTime: Math.ceil(60_000 / config.requestsPerMinute) });
  }

  async complete(messages: LlmMessage[], options: LlmCompletionOptions = {}): Promise<LlmResponse> {
    if (!this.config.apiKey.trim() || ["not_configured", "change_me"].includes(this.config.apiKey.trim().toLowerCase())) {
      throw new LlmGatewayError("DeepSeek fallback API key is not configured", "configuration", false);
    }
    return this.limiter.schedule(() => this.request(messages, options));
  }

  private async request(messages: LlmMessage[], options: LlmCompletionOptions): Promise<LlmResponse> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.fetcher("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ model: this.config.model, messages, thinking: { type: "disabled" }, temperature: 0, max_tokens: options.maxTokens ?? 1024, response_format: { type: "json_object" }, stream: false }),
        signal: controller.signal
      });
      if (!response.ok) {
        // Never include raw upstream bodies: providers can echo request secrets.
        const status = response.status;
        await response.body?.cancel().catch(() => undefined);
        if (status === 401) throw new LlmGatewayError("DeepSeek rejected the fallback API key", "authentication", false, status);
        if (status === 402) throw new LlmGatewayError("DeepSeek fallback account has insufficient balance", "billing", false, status);
        if (status === 403) throw new LlmGatewayError("DeepSeek denied access to the fallback model", "authorization", false, status);
        if (status === 404) throw new LlmGatewayError("DeepSeek fallback model was not found", "not_found", false, status);
        if (status === 429) {
          const header = response.headers.get("retry-after");
          const seconds = header === null ? NaN : Number(header);
          const until = header === null ? NaN : Date.parse(header);
          const retryAfterMs = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : Number.isNaN(until) ? undefined : Math.max(0, until - Date.now());
          throw new LlmGatewayError("DeepSeek fallback rate limit was reached", "rate_limited", true, status, retryAfterMs);
        }
        if (status >= 500) throw new LlmGatewayError("DeepSeek fallback service is unavailable", "provider_unavailable", true, status);
        throw new LlmGatewayError(`DeepSeek fallback request failed with HTTP ${status}`, "configuration", false, status);
      }
      const payload = await response.json().catch(() => null) as {
        model?: string; choices?: Array<{ finish_reason?: string; message?: { content?: string } }>; usage?: LlmUsage;
      } | null;
      const choice = payload?.choices?.[0];
      const content = choice?.message?.content;
      if (typeof content !== "string" || !content.trim() || choice?.finish_reason === "length") {
        throw new LlmGatewayError("DeepSeek fallback returned an empty or incomplete response", "malformed_response", true);
      }
      // Record the actual provider model on each result, including fallback runs.
      return { content, modelId: typeof payload?.model === "string" && payload.model.trim() ? payload.model : this.config.model, latencyMs: Date.now() - started, usage: payload?.usage ?? null };
    } catch (error) {
      if (error instanceof LlmGatewayError) throw error;
      if (controller.signal.aborted) throw new LlmGatewayError(`DeepSeek fallback timed out after ${this.config.timeoutMs}ms`, "timeout", true);
      throw new LlmGatewayError("Could not reach the DeepSeek fallback service", "network", true);
    } finally { clearTimeout(timer); }
  }
}
