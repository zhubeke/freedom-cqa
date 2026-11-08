import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import type { AppealDocument } from "../../application/appeal.types.js";
import { decisionOutcome } from "../../application/review-decision.js";

export class AppealRepository {
  constructor(readonly db: Db) {}
  collection() { return this.db.collection<AppealDocument>("appeals"); }
  async ensureIndexes() {
    await Promise.all([
      this.collection().createIndex({ appeal_id: 1 }, { unique: true, name: "appeal_id_unique" }),
      this.collection().createIndex({ evaluation_run_id: 1, criterion_id: 1, created_at: -1 }, { name: "appeal_history" }),
      this.collection().createIndex({ status: 1, created_at: 1 }, { name: "appeal_review_queue" })
    ]);
  }
  create(input: Omit<AppealDocument, "_id" | "appeal_id" | "created_at" | "updated_at" | "decision" | "status">) {
    const appealId = randomUUID(); const now = new Date();
    const document: AppealDocument = { _id: appealId, appeal_id: appealId, status: "OPEN", decision: null, created_at: now, updated_at: now, ...input };
    return this.collection().insertOne(document).then(() => document);
  }
  find(appealId: string) { return this.collection().findOne({ appeal_id: appealId }); }
  async list(filter: Record<string, unknown>, limit = 100) {
    return (await this.collection().find(filter, { projection: { _id: 0 } }).sort({ created_at: 1 }).limit(limit).toArray()).map(appeal => ({
      ...appeal,
      decision: appeal.decision && ["CONFIRMED", "OVERRIDDEN"].includes(appeal.status) ? {
        ...appeal.decision, outcome: appeal.decision.outcome ?? decisionOutcome(appeal.original_evaluation, appeal.decision)
      } : appeal.decision
    }));
  }
}
