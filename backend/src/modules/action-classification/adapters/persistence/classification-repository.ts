import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import { ACTION_FEATURE_VERSION, LABEL_POLICY_VERSION, type ActionCode, type ActionFeatures, type ClassificationEvent } from "../../application/action.types.js";

export class ClassificationRepository {
  constructor(private readonly db: Db) {}
  results() { return this.db.collection<Record<string, any> & { _id: string }>("classification_results"); }
  labels() { return this.db.collection("classification_labels"); }
  models() { return this.db.collection("classification_models"); }

  async ensureIndexes() {
    await Promise.all([
      this.results().createIndex({ result_id: 1 }, { unique: true, name: "classification_result_id_unique" }),
      this.results().createIndex({ source_event_id: 1 }, { unique: true, name: "classification_event_idempotency" }),
      this.results().createIndex({ dataset_group_id: 1, conversation_id: 1, created_at: -1 }, { name: "classification_history" }),
      this.labels().createIndex({ dataset_group_id: 1, conversation_id: 1, feature_version: 1, label_policy_version: 1 }, { unique: true, name: "classification_label_policy_unique" }),
      this.labels().createIndex({ verification_status: 1, verified_action: 1 }, { name: "verified_training_labels" }),
      this.models().createIndex({ feature_version: 1, training_dataset_version: 1, provider_model_id: 1 }, { unique: true, name: "classification_model_version_unique" })
    ]);
  }

  async queue(datasetGroupId: string, conversationId: string, force = false, sourceEventId?: string): Promise<{ event: ClassificationEvent; result: any; duplicate: boolean }> {
    if (sourceEventId) {
      const exact = await this.results().findOne({ source_event_id: sourceEventId });
      if (exact) return { event: this.eventFrom(exact), result: exact, duplicate: true };
    }
    if (!force) {
      const active = await this.results().findOne({ dataset_group_id: datasetGroupId, conversation_id: conversationId, ...(!sourceEventId ? { status: { $in: ["queued", "processing", "completed", "fallback"] } } : { status: { $in: ["queued", "processing"] } }) }, { sort: { created_at: -1 } });
      if (active) return { event: this.eventFrom(active), result: active, duplicate: true };
    }
    const eventId = sourceEventId ?? randomUUID(); const resultId = randomUUID(); const now = new Date();
    const document = { _id: resultId, result_id: resultId, source_event_id: eventId, correlation_id: resultId, dataset_group_id: datasetGroupId, conversation_id: conversationId, status: "queued", feature_version: ACTION_FEATURE_VERSION, classification_source: null, final_action: null, error: null, created_at: now, updated_at: now };
    await this.results().insertOne(document);
    return { event: this.eventFrom(document), result: document, duplicate: false };
  }

  private eventFrom(result: any): ClassificationEvent { return { event_id: result.source_event_id, correlation_id: result.correlation_id, event_type: "cqa.classification.requested", event_version: 1, occurred_at: new Date(result.created_at).toISOString(), dataset_group_id: result.dataset_group_id, conversation_id: result.conversation_id }; }
  findByEvent(eventId: string) { return this.results().findOne({ source_event_id: eventId }); }
  start(eventId: string) { return this.results().updateOne({ source_event_id: eventId, status: "queued" }, { $set: { status: "processing", started_at: new Date(), updated_at: new Date() } }); }
  latest(groupId: string | undefined, conversationId: string) { return this.results().findOne({ conversation_id: conversationId, ...(groupId ? { dataset_group_id: groupId } : {}) }, { sort: { created_at: -1 }, projection: { _id: 0 } }); }

  async inputs(groupId: string, conversationId: string) {
    const metadata = await this.db.collection("conversation_metadata").findOne({ dataset_group_id: groupId, conversation_id: conversationId }, { sort: { created_at: -1 } });
    const evaluation = await this.db.collection("evaluation_runs").findOne({ dataset_group_id: groupId, conversation_id: conversationId, status: "completed" }, { sort: { completed_at: -1 } });
    const criteria = evaluation ? await this.db.collection("criterion_evaluations").find({ evaluation_run_id: evaluation.run_id }).toArray() : [];
    const overrides = evaluation ? await this.db.collection("appeals").find({ evaluation_run_id: evaluation.run_id, status: "OVERRIDDEN" }).sort({ updated_at: 1 }).toArray() : [];
    const effectiveCriteria = criteria.map((criterion) => { const appeal = [...overrides].reverse().find((item: any) => item.criterion_id === criterion.criterion_id); const rawValue = appeal?.decision?.effective_value; return appeal ? { ...criterion, raw_value: rawValue, is_na: rawValue === null } : criterion; });
    const audio = await this.db.collection("audio_metrics").findOne({ dataset_group_id: groupId, conversation_id: conversationId, status: { $in: ["completed", "partial"] } }, { sort: { processing_completed_at: -1 } });
    const effectiveEvaluation: any = evaluation ? { ...evaluation, final_score: evaluation.finalized_score ?? evaluation.final_score, critical_flag: evaluation.finalized_critical_flag ?? evaluation.critical_flag } : evaluation;
    return { metadata, evaluation: effectiveEvaluation, criteria: effectiveCriteria, audio };
  }

  history(groupId: string | undefined, conversationId: string) { return this.results().find({ conversation_id: conversationId, ...(groupId ? { dataset_group_id: groupId } : {}), status: { $in: ["completed", "fallback"] } }, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(10).toArray(); }

  async complete(eventId: string, document: Record<string, unknown>) {
    const now = new Date();
    await this.results().updateOne({ source_event_id: eventId }, { $set: { ...document, status: document.classification_source === "rules" && document.tabpfn_unavailable_reason ? "fallback" : "completed", completed_at: now, updated_at: now, completion_publication_status: "pending" } });
  }
  fail(eventId: string, error: string) { return this.results().updateOne({ source_event_id: eventId }, { $set: { status: "failed", error, completed_at: new Date(), updated_at: new Date() } }); }

  async proposeLabel(groupId: string, conversationId: string, action: ActionCode, features: ActionFeatures, resultId: string) {
    const now = new Date();
    await this.labels().updateOne({ dataset_group_id: groupId, conversation_id: conversationId, feature_version: ACTION_FEATURE_VERSION, label_policy_version: LABEL_POLICY_VERSION }, {
      $setOnInsert: { label_id: randomUUID(), proposed_action: action, verified_action: null, verification_status: "PROPOSED", label_source: "deterministic_rules", features, source_result_id: resultId, created_at: now }, $set: { updated_at: now }
    }, { upsert: true });
  }
  verifiedLabels() { return this.labels().find({ verification_status: "VERIFIED", verified_action: { $ne: null }, feature_version: ACTION_FEATURE_VERSION }).toArray(); }
  listLabels(filter: Record<string, unknown>, limit = 100) { return this.labels().find(filter, { projection: { _id: 0 } }).sort({ updated_at: -1 }).limit(limit).toArray(); }
  verifyLabel(labelId: string, action: ActionCode, reviewer: string) { return this.labels().findOneAndUpdate({ label_id: labelId }, { $set: { verified_action: action, verification_status: "VERIFIED", label_source: "human_review", verified_by: reviewer, verified_at: new Date(), updated_at: new Date() } }, { returnDocument: "after", projection: { _id: 0 } }); }
  readyModel(datasetVersion: string) { return this.models().findOne({ feature_version: ACTION_FEATURE_VERSION, training_dataset_version: datasetVersion, status: "completed" }, { sort: { created_at: -1 } }); }
  latestModel(datasetVersion: string) { return this.models().findOne({ feature_version: ACTION_FEATURE_VERSION, training_dataset_version: datasetVersion }, { sort: { created_at: -1 } }); }
  async saveModel(document: Record<string, unknown>) { await this.models().updateOne({ feature_version: ACTION_FEATURE_VERSION, training_dataset_version: document.training_dataset_version, provider_model_id: document.provider_model_id }, { $set: { ...document, updated_at: new Date() }, $setOnInsert: { created_at: new Date() } }, { upsert: true }); }
  async pendingPublications() { return this.results().find({ completion_publication_status: "pending", status: { $in: ["completed", "fallback"] } }).toArray(); }
  markPublished(resultId: string) { return this.results().updateOne({ result_id: resultId }, { $set: { completion_publication_status: "published", updated_at: new Date() } }); }
  datasetConversations(groupId: string) { return this.db.collection("conversations").find({ dataset_group_id: groupId }, { projection: { conversation_id: 1, dataset_group_id: 1 } }).toArray(); }
}
