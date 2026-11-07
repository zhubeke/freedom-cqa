import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import type { CriterionEvaluationDocument, EvaluationRunDocument } from "../../../evaluation-orchestration/application/evaluation.types.js";

export class EvaluationRepository {
  constructor(private readonly db: Db) {}
  runs() { return this.db.collection<EvaluationRunDocument>("evaluation_runs"); }
  criteria() { return this.db.collection<CriterionEvaluationDocument>("criterion_evaluations"); }
  async ensureIndexes() {
    await Promise.all([
      this.runs().createIndex({ run_id: 1 }, { unique: true, name: "evaluation_run_id_unique" }),
      this.runs().createIndex({ conversation_id: 1, requested_at: -1 }, { name: "conversation_evaluation_history" }),
      this.runs().createIndex(
        { conversation_id: 1, checklist_version_id: 1, model_id: 1, prompt_version: 1, input_fingerprint: 1, status: 1 },
        { name: "reusable_evaluation_lookup" }
      ),
      this.runs().createIndex({ publication_status: 1, status: 1 }, { name: "evaluation_publication_recovery" }),
      this.runs().createIndex({ active_key: 1 }, { unique: true, sparse: true, name: "active_evaluation_unique" }),
      this.criteria().createIndex({ evaluation_run_id: 1, criterion_id: 1 }, { unique: true, name: "run_criterion_unique" })
    ]);
  }
  findRun(runId: string) { return this.runs().findOne({ run_id: runId }); }
  async findFullRun(runId: string) {
    const run = await this.findRun(runId);
    if (!run) return null;
    const criteria = await this.criteria().find({ evaluation_run_id: runId }).toArray();
    criteria.sort((left, right) => (left.display_order ?? Number.MAX_SAFE_INTEGER) - (right.display_order ?? Number.MAX_SAFE_INTEGER));
    const { _id, event_id, correlation_id, publication_status, publication_attempts, criteria_dispatched, active_key, ...publicRun } = run;
    void _id; void event_id; void correlation_id; void publication_status; void publication_attempts; void criteria_dispatched; void active_key;
    const appeals = await this.db.collection("appeals").find({ evaluation_run_id: runId }, { projection: { _id: 0 } }).sort({ created_at: 1 }).toArray();
    return { ...publicRun, appeals, criteria: criteria.map(({ _id: criterionDocumentId, ...item }) => { void criterionDocumentId; return item; }) };
  }
  async history(conversationId: string) {
    const runs = await this.runs().find({ conversation_id: conversationId }).sort({ requested_at: -1 }).limit(25).toArray();
    return Promise.all(runs.map((run) => this.findFullRun(run.run_id)));
  }
  async activeDuplicate(conversationId: string, checklistVersionId: string, modelId?: string, promptVersion?: string) {
    return this.runs().findOne({
      conversation_id: conversationId, checklist_version_id: checklistVersionId,
      ...(modelId ? { model_id: modelId } : {}), ...(promptVersion ? { prompt_version: promptVersion } : {}),
      status: { $in: ["queued", "processing"] }
    });
  }
  reusable(conversationId: string, checklistVersionId: string, modelId: string, promptVersion: string, inputFingerprint: string) {
    return this.runs().findOne({ conversation_id: conversationId, checklist_version_id: checklistVersionId, model_id: modelId, prompt_version: promptVersion, input_fingerprint: inputFingerprint, status: "completed" }, { sort: { completed_at: -1 } });
  }
  async createRun(input: Omit<EvaluationRunDocument, "_id" | "run_id" | "event_id" | "correlation_id">) {
    const runId = randomUUID(); const eventId = randomUUID();
    const document: EvaluationRunDocument = { _id: runId, run_id: runId, event_id: eventId, correlation_id: runId, ...input };
    await this.runs().insertOne(document);
    return document;
  }
}
