import type { AppConfig } from "../../../config/config.js";
import { CloudflareCredentialPool } from "./cloudflare-credential-pool.js";
import { CloudflareGateway, createLlmLimiter } from "./cloudflare-gateway.js";
import { DeepSeekGateway } from "./deepseek-gateway.js";
import { FallbackGateway } from "./fallback-gateway.js";
import { LlmGatewayError, type LlmGateway } from "../application/llm-gateway.js";

export function createLlmGateway(config: AppConfig["llm"], redisUrl?: string, fetcher: typeof fetch = fetch): LlmGateway {
  const cloudflareConfig: AppConfig["llm"] = { ...config,
    provider: config.provider === "deepseek" ? (config.endpoint ? "custom_worker" : "workers_ai") : config.provider,
    model: config.cloudflareModel ?? (config.provider === "deepseek" ? "@cf/meta/llama-3.1-8b-instruct-fp8-fast" : config.model)
  };
  const cloudflare = config.credentialPoolEnabled && config.profiles?.some((profile) => profile.enabled)
    ? new CloudflareCredentialPool(cloudflareConfig, fetcher, config.profiles, redisUrl)
    : new CloudflareGateway(cloudflareConfig, fetcher, createLlmLimiter(cloudflareConfig));
  if (config.provider === "deepseek") {
    if (!config.deepseek?.apiKey.trim()) throw new LlmGatewayError("DeepSeek primary API key is not configured", "configuration", false);
    return new FallbackGateway(new DeepSeekGateway(config.deepseek, fetcher), cloudflare);
  }
  return config.deepseek?.enabled ? new FallbackGateway(cloudflare, new DeepSeekGateway(config.deepseek, fetcher)) : cloudflare;
}
