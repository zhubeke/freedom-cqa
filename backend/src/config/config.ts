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
  llm: {
    provider: "workers_ai" | "custom_worker";
    endpoint: string | null;
    accountId: string;
    apiToken: string;
    model: string;
    timeoutMs: number;
    maxConcurrency: number;
    maxRetries: number;
    minRequestIntervalMs: number;
  };
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
    llm: {
      provider,
      endpoint,
      accountId: required("CLOUDFLARE_ACCOUNT_ID"),
      apiToken: required("CLOUDFLARE_API_TOKEN"),
      model: process.env.CLOUDFLARE_MODEL?.trim() || "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      timeoutMs: integerInRange("CQA_LLM_TIMEOUT_MS", "60000", 1),
      maxConcurrency: integerInRange("CQA_LLM_MAX_CONCURRENCY", "4", 1, 32),
      maxRetries: integerInRange("CQA_LLM_MAX_RETRIES", "2", 0, 10),
      minRequestIntervalMs: integerInRange("CQA_LLM_MIN_REQUEST_INTERVAL_MS", "0", 0, 60_000)
    }
  };
}
