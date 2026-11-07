import "dotenv/config";

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  logLevel: string;
  host: string;
  port: number;
  mongodb: { uri: string; database: string };
  redis: { url: string };
  kafka: { brokers: string[]; clientId: string; consumerGroupId: string };
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
    }
  };
}
