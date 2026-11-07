import type { AppConfig } from "../config/config.js";
import { MongoConnection } from "./mongodb/client.js";
import { RedisConnection } from "./redis/client.js";
import { RedpandaConnection } from "./redpanda/client.js";

export function createConnections(config: AppConfig) {
  return {
    mongodb: new MongoConnection(config.mongodb.uri, config.mongodb.database),
    redis: new RedisConnection(config.redis.url),
    redpanda: new RedpandaConnection(config.kafka.clientId, config.kafka.brokers)
  };
}

export type Connections = ReturnType<typeof createConnections>;
