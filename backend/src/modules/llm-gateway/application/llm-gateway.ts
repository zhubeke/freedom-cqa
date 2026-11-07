export interface LlmMessage { role: "system" | "user"; content: string }
export interface LlmUsage { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
export interface LlmResponse { content: string; modelId: string; latencyMs: number; usage: LlmUsage | null }
export interface LlmCompletionOptions { maxTokens?: number }
export interface LlmGateway { complete(messages: LlmMessage[], options?: LlmCompletionOptions): Promise<LlmResponse> }

export type LlmErrorCategory =
  | "configuration"
  | "authentication"
  | "authorization"
  | "not_found"
  | "rate_limited"
  | "provider_unavailable"
  | "timeout"
  | "network"
  | "malformed_response";

export class LlmGatewayError extends Error {
  constructor(
    message: string,
    public readonly category: LlmErrorCategory,
    public readonly retryable: boolean,
    public readonly statusCode?: number,
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = "LlmGatewayError";
  }
}
