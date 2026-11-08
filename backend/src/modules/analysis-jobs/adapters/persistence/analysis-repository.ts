import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import { initialStages, type AnalysisJob } from "../../application/analysis.types.js";

export class AnalysisRepository {
  constructor(private readonly db: Db) {}
  collection() { return this.db.collection<AnalysisJob>("conversation_analysis_jobs"); }
  async ensureIndexes() {
    await Promise.all([
      this.collection().createIndex({ active_key: 1 }, { unique: true, sparse: true, name: "active_conversation_analysis" }),
      this.collection().createIndex({ dataset_group_id: 1, conversation_id: 1, requested_at: -1 }, { name: "conversation_analysis_history" })
    ]);
  }
  latest(groupId: string, conversationId: string) {
    return this.collection().findOne({ dataset_group_id: groupId, conversation_id: conversationId }, { sort: { requested_at: -1 } });
  }
  active(groupId: string, conversationId: string) { return this.collection().findOne({ active_key: `${groupId}:${conversationId}` }); }
  async create(groupId: string, conversationId: string, checklistVersionId?: string) {
    const id = randomUUID(), now = new Date();
    const job: AnalysisJob = {
      _id: id, job_id: id, dataset_group_id: groupId, conversation_id: conversationId,
      ...(checklistVersionId ? { checklist_version_id: checklistVersionId } : {}),
      status: "queued", stages: initialStages(id), requested_at: now, updated_at: now, completed_at: null,
      active_key: `${groupId}:${conversationId}`
    };
    await this.collection().insertOne(job);
    return job;
  }
  async claim(jobId: string) {
    const now = new Date();
    return this.collection().findOneAndUpdate({ job_id: jobId, active_key: { $exists: true },
      $or: [{ lease_until: { $lt: now } }, { lease_until: { $exists: false } }] },
    { $set: { lease_token: randomUUID(), lease_until: new Date(now.getTime() + 120_000) } }, { returnDocument: "after" });
  }
  async save(job: AnalysisJob, release = false) {
    const finished = ["completed", "completed_with_errors"].includes(job.status);
    const unset: Record<string, ""> = { ...(finished ? { active_key: "" as const } : {}), ...(release ? { lease_until: "" as const, lease_token: "" as const } : {}) };
    await this.collection().updateOne({ job_id: job.job_id, lease_token: job.lease_token! }, {
      $set: { stages: job.stages, status: job.status, updated_at: new Date(), completed_at: finished ? new Date() : null },
      ...(Object.keys(unset).length ? { $unset: unset } : {})
    });
  }
}
