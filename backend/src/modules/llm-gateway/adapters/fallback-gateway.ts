import { LlmGatewayError, type LlmCompletionOptions, type LlmGateway, type LlmMessage } from "../application/llm-gateway.js";

export class FallbackGateway implements LlmGateway {
  constructor(private readonly primary: LlmGateway, private readonly secondary: LlmGateway) {}

  async withFallback<T>(operation: (gateway: LlmGateway) => Promise<T>): Promise<T> {
    try { return await operation(this.primary); }
    catch (error) {
      // Only provider/validated-output errors trigger failover. Programming and
      // persistence failures must not cause extra paid requests or be concealed.
      if (!(error instanceof LlmGatewayError)) throw error;
      return operation(this.secondary);
    }
  }

  complete(messages: LlmMessage[], options?: LlmCompletionOptions) {
    return this.withFallback((gateway) => gateway.complete(messages, options));
  }
}
