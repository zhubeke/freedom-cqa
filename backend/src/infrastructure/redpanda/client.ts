import { Kafka, logLevel, type Admin } from "kafkajs";
import type { HealthCheck, HealthResult } from "../health.js";
import { measured } from "../health.js";

export class RedpandaConnection implements HealthCheck {
  private readonly admin: Admin;
  readonly kafka: Kafka;
  private connected = false;

  constructor(clientId: string, brokers: string[]) {
    this.kafka = new Kafka({ clientId, brokers, logLevel: logLevel.NOTHING, connectionTimeout: 3000, requestTimeout: 3000 });
    this.admin = this.kafka.admin();
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.admin.connect();
      this.connected = true;
    }
  }

  check(): Promise<HealthResult> {
    return measured(async () => {
      try {
        await this.connect();
        await this.admin.fetchTopicMetadata();
      } catch (error) {
        this.connected = false;
        await this.admin.disconnect().catch(() => undefined);
        throw error;
      }
    });
  }

  async close(): Promise<void> {
    if (this.connected) await this.admin.disconnect();
    this.connected = false;
  }
}
