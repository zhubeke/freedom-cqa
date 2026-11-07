import { Redis } from "ioredis";
import type { HealthCheck, HealthResult } from "../health.js";
import { measured } from "../health.js";

export class RedisConnection implements HealthCheck {
  private readonly client: Redis;

  constructor(url: string) {
    this.client = new Redis(url, {
      lazyConnect: true,
      connectTimeout: 3000,
      commandTimeout: 3000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false
    });
    this.client.on("error", () => undefined);
  }

  async connect(): Promise<void> {
    if (this.client.status === "wait" || this.client.status === "end") await this.client.connect();
  }

  check(): Promise<HealthResult> {
    return measured(async () => {
      await this.connect();
      const response = await this.client.ping();
      if (response !== "PONG") throw new Error(`Unexpected Redis PING response: ${response}`);
    });
  }

  async close(): Promise<void> {
    if (this.client.status !== "end") this.client.disconnect();
  }
}
