import { MongoClient, type Db } from "mongodb";
import type { HealthCheck, HealthResult } from "../health.js";
import { measured } from "../health.js";

export class MongoConnection implements HealthCheck {
  private readonly client: MongoClient;
  private readonly database: Db;

  constructor(uri: string, databaseName: string) {
    this.client = new MongoClient(uri, { serverSelectionTimeoutMS: 3000, connectTimeoutMS: 3000 });
    this.database = this.client.db(databaseName);
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  get db(): Db {
    return this.database;
  }

  check(): Promise<HealthResult> {
    return measured(() => this.database.command({ ping: 1 }));
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
