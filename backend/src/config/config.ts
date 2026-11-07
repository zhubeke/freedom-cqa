import "dotenv/config";

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  logLevel: string;
  host: string;
  port: number;
  mongodb: { uri: string; database: string };
  redis: { url: string };
  kafka: { brokers: string[]; clientId: string; consumerGroupId: string };
  teamName: string;
  batch: { maxConversationConcurrency: number };
  sentiment: { batchSize: number };
  classification: { minPerClass: number; minTotal: number };
  tabpfn: { enabled: boolean; apiKey: string; baseUrl: string; modelId: string; timeoutMs: number; maxRetries: number };
  llm: {
    provider: "workers_ai" | "custom_worker";
    endpoint: string | null;
    accountId: string;
    apiToken: string;
    model: string;
    timeoutMs: number;
    maxConcurrency: number;
    requestsPerMinute: number;
    tokensPerMinute: number;
    maxRetries: number;
    maxInlineRetryDelayMs: number;
    minRequestIntervalMs: number;
    credentialPoolEnabled?: boolean;
    quotaRecheckMs?: number;
    profiles?: CloudflareProfileConfig[];
  };
}

export interface CloudflareProfileConfig {
  id: string; accountId: string; apiToken: string; endpoint: string | null; model: string; enabled: boolean;
  requestsPerMinute: number; maxConcurrency: number;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function loadConfig(): AppConfig {
  const nodeEnv = (process.env.NODE_ENV ?? "development") as AppConfig["nodeEnv"];
  if (!["development", "test", "production"].includes(nodeEnv)) {
    throw new Error("NODE_ENV must be development, test, or production");
  }

  const port = Number(process.env.FASTIFY_PORT ?? "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("FASTIFY_PORT must be an integer between 1 and 65535");
  }

  const brokers = required("REDPANDA_BROKERS").split(",").map((item) => item.trim()).filter(Boolean);
  if (brokers.length === 0) throw new Error("REDPANDA_BROKERS must contain at least one broker");

  const provider = (process.env.CQA_LLM_PROVIDER?.trim() || (process.env.CQA_LLM_ENDPOINT?.trim() ? "custom_worker" : "workers_ai")) as "workers_ai" | "custom_worker";
  if (provider !== "workers_ai" && provider !== "custom_worker") throw new Error("CQA_LLM_PROVIDER must be workers_ai or custom_worker");
  const endpoint = process.env.CQA_LLM_ENDPOINT?.trim() || null;
  if (provider === "custom_worker" && !endpoint) throw new Error("CQA_LLM_ENDPOINT is required in custom_worker mode");
  const integerInRange = (name: string, fallback: string, minimum: number, maximum = Number.MAX_SAFE_INTEGER) => {
    const value = Number(process.env[name] ?? fallback);
    if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
    return value;
  };
  const boolean = (name: string, fallback = false) => ["1", "true", "yes", "on"].includes((process.env[name] ?? String(fallback)).trim().toLowerCase());
  const legacyAccountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || "not_configured";
  const legacyApiToken = process.env.CLOUDFLARE_API_TOKEN?.trim() || "not_configured";
  const defaultModel = process.env.CLOUDFLARE_MODEL?.trim() || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  const poolEnabled = boolean("CQA_CF_CREDENTIAL_POOL_ENABLED", true);
  const sharedRpm = integerInRange("CQA_CF_REQUESTS_PER_MINUTE_PER_ACCOUNT", process.env.CQA_LLM_REQUESTS_PER_MINUTE ?? "20", 1, 10_000);
  const sharedConcurrency = integerInRange("CQA_CF_MAX_CONCURRENCY_PER_ACCOUNT", process.env.CQA_LLM_MAX_CONCURRENCY ?? "1", 1, 32);
  const profileEnv = (id: "primary" | "jubo" | "dauren"): CloudflareProfileConfig => {
    const prefix = `CQA_CF_${id.toUpperCase()}`;
    const accountId = process.env[`${prefix}_ACCOUNT_ID`]?.trim()
      || (id === "primary" ? legacyAccountId : "");
    const apiToken = process.env[`${prefix}_API_TOKEN`]?.trim()
      || (id === "primary" ? legacyApiToken : "");
    return {
      id, accountId, apiToken,
      endpoint: process.env[`${prefix}_ENDPOINT`]?.trim() || endpoint,
      model: process.env[`${prefix}_MODEL`]?.trim() || process.env.CQA_CF_MODEL_ID?.trim() || defaultModel,
      enabled: poolEnabled && boolean(`${prefix}_ENABLED`, true),
      requestsPerMinute: integerInRange(`${prefix}_REQUESTS_PER_MINUTE`, String(sharedRpm), 1, 10_000),
      maxConcurrency: integerInRange(`${prefix}_MAX_CONCURRENCY`, String(sharedConcurrency), 1, 32)
    };
  };
  const profiles: CloudflareProfileConfig[] = [profileEnv("primary"), profileEnv("jubo"), profileEnv("dauren")];

  return {
    nodeEnv,
    logLevel: process.env.LOG_LEVEL ?? "info",
    host: process.env.FASTIFY_HOST ?? "0.0.0.0",
    port,
    mongodb: { uri: required("MONGODB_URI"), database: required("MONGODB_DATABASE") },
    redis: { url: required("REDIS_URL") },
    kafka: {
      brokers,
      clientId: process.env.KAFKA_CLIENT_ID ?? "cqa-api",
      consumerGroupId: process.env.KAFKA_CONSUMER_GROUP_ID ?? "cqa-pipeline-worker-v1"
    },
    teamName: process.env.CQA_TEAM_NAME?.trim() ?? "",
    batch: {
      maxConversationConcurrency: integerInRange("CQA_BATCH_MAX_CONCURRENCY", "2", 1, 10)
    },
    sentiment: {
      batchSize: integerInRange("CQA_SENTIMENT_BATCH_SIZE", "20", 15, 25)
    },
    classification: {
      minPerClass: integerInRange("CQA_CLASSIFICATION_MIN_PER_CLASS", "3", 1, 1000),
      minTotal: integerInRange("CQA_CLASSIFICATION_MIN_TOTAL", "12", 2, 100_000)
    },
    tabpfn: {
      enabled: boolean("TABPFN_ENABLED"), apiKey: process.env.TABPFN_API_KEY?.trim() ?? "",
      baseUrl: (process.env.TABPFN_API_BASE_URL?.trim() || "https://api.priorlabs.ai").replace(/\/$/, ""),
      modelId: process.env.TABPFN_MODEL_ID?.trim() || "v3.5_default",
      timeoutMs: integerInRange("TABPFN_TIMEOUT_MS", "60000", 1000, 600_000),
      maxRetries: integerInRange("TABPFN_MAX_RETRIES", "2", 0, 10)
    },
    llm: {
      provider,
      endpoint,
      accountId: legacyAccountId,
      apiToken: legacyApiToken,
      model: defaultModel,
      timeoutMs: integerInRange("CQA_LLM_TIMEOUT_MS", "60000", 1),
      maxConcurrency: integerInRange("CQA_LLM_MAX_CONCURRENCY", "1", 1, 32),
      requestsPerMinute: integerInRange("CQA_LLM_REQUESTS_PER_MINUTE", "20", 1, 10_000),
      tokensPerMinute: integerInRange("CQA_LLM_TOKENS_PER_MINUTE", "0", 0, 10_000_000),
      maxRetries: integerInRange("CQA_LLM_MAX_RETRIES", "2", 0, 10),
      maxInlineRetryDelayMs: integerInRange("CQA_LLM_MAX_INLINE_RETRY_DELAY_MS", "15000", 0, 300_000),
      minRequestIntervalMs: integerInRange("CQA_LLM_MIN_REQUEST_INTERVAL_MS", "0", 0, 60_000),
      credentialPoolEnabled: poolEnabled,
      quotaRecheckMs: integerInRange("CQA_CF_QUOTA_RECHECK_MS", "21600000", 60_000, 86_400_000),
      profiles
    }
  };
}
