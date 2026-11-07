import type { Db } from "mongodb";
import type { EvaluationBatchDocument } from "../../application/batch.types.js";

export class BatchRepository {
  constructor(private readonly db: Db) {}
  collection() { return this.db.collection<EvaluationBatchDocument>("evaluation_batches"); }

  async ensureIndexes() {
    await Promise.all([
      this.collection().createIndex({ batch_id: 1 }, { unique: true, name: "batch_id_unique" }),
      this.collection().createIndex({ active_key: 1 }, { unique: true, sparse: true, name: "active_batch_configuration_unique" }),
      this.collection().createIndex({ created_at: -1 }, { name: "batch_history" }),
      this.collection().createIndex({ publication_status: 1, status: 1 }, { name: "batch_publication_recovery" })
    ]);
  }

  find(batchId: string) { return this.collection().findOne({ batch_id: batchId }); }

  async publicBatch(batchId: string) {
    const batch = await this.find(batchId);
    if (!batch) return null;
    return this.toPublic(batch);
  }

  async list() {
    const batches = await this.collection().find().sort({ created_at: -1 }).limit(50).toArray();
    return batches.map((batch) => this.toPublic(batch));
  }

  toPublic(batch: EvaluationBatchDocument) {
    const { _id, event_id, correlation_id, publication_status, publication_attempts, completion_publication_status, active_key, ...result } = batch;
    void _id; void event_id; void correlation_id; void publication_status; void publication_attempts; void completion_publication_status; void active_key;
    return { ...result, remaining: Math.max(0, result.total - result.completed - result.failed) };
  }
}
