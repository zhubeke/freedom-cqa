import type { Db } from "mongodb";

export interface RawImportDocument {
  import_id: string;
  dataset_group_id: string;
  content_hash: string;
  original_payload: unknown;
  status: "queued" | "processing" | "completed" | "failed";
  requested_at: Date;
  processed_at: Date | null;
  total_records: number;
  processed_count: number;
  last_error: string | null;
  publication_status: "pending" | "published";
  publication_attempts: number;
  event_id: string;
}

export class ImportRepository {
  constructor(private readonly db: Db) {}
  collection() { return this.db.collection<RawImportDocument>("raw_imports"); }
  async ensureIndexes(): Promise<void> {
    await this.collection().createIndex({ import_id: 1 }, { unique: true });
    await this.collection().createIndex({ publication_status: 1, status: 1 });
  }
  find(importId: string) { return this.collection().findOne({ import_id: importId }); }
}
