import { MongoServerError, type Db } from "mongodb";
import { createHash } from "node:crypto";
import type { EvaluationRepository } from "../../criterion-evaluation/adapters/persistence/evaluation-repository.js";

export class EvaluationRequestError extends Error {
  constructor(message: string, public statusCode = 400) { super(message); }
}

export interface EvaluationConfiguration {
  modelId?: string;
  promptVersion?: string;
  inputFingerprint?: string;
  batchId?: string;
  force?: boolean;
  requestKey?: string;
  datasetGroupId?: string;
  /** Internal callers use pinned versions for work that was already accepted while active. */
  allowInactiveChecklist?: boolean;
}

export async function startEvaluation(db: Db, repository: EvaluationRepository, conversationId: string, checklistVersionId?: string, configuration: EvaluationConfiguration = {}) {
  const conversation = await db.collection("conversations").findOne({ conversation_id: conversationId, ...(configuration.datasetGroupId ? { dataset_group_id: configuration.datasetGroupId } : {}) }, { projection: { conversation_id: 1, dataset_group_id: 1, normalized_language: 1, transcript: 1 } });
  if (!conversation) throw new EvaluationRequestError("Conversation not found", 404);
  if (configuration.requestKey) {
    const requested = await repository.runs().findOne({ request_key: configuration.requestKey });
    if (requested) return { run: requested, duplicate: true };
  }
  const versions = db.collection<{ _id: string; checklist_id: string; sections?: unknown[]; criteria: Array<{ enabled: boolean }> }>("checklist_versions");
  let version = checklistVersionId ? await versions.findOne({ _id: checklistVersionId }) : null;
  if (!checklistVersionId) {
    const checklist = await db.collection<{ _id: string; active_version_id: string | null }>("checklists").findOne({ _id: "freedom-default-checklist", active_version_id: { $ne: null } });
    if (checklist?.active_version_id) version = await versions.findOne({ _id: String(checklist.active_version_id) });
  }
  if (!version) throw new EvaluationRequestError(checklistVersionId ? "Checklist version not found" : "No active checklist version found", 404);
  const modelId = configuration.modelId ?? "pending"; const promptVersion = configuration.promptVersion ?? "criterion-v1";
  const inputFingerprint = configuration.inputFingerprint ?? createHash("sha256").update(JSON.stringify({ transcript: conversation.transcript ?? null, language: conversation.normalized_language ?? null, checklist_version_id: String(version._id), criteria: version.criteria, model_id: modelId, prompt_version: promptVersion })).digest("hex");
  const groupId = String(conversation.dataset_group_id);
  const duplicate = await repository.activeDuplicate(conversationId, String(version._id), modelId, promptVersion, groupId);
  if (duplicate) return { run: duplicate, duplicate: true };
  const reusable = configuration.force ? null : await repository.reusable?.(conversationId, String(version._id), modelId, promptVersion, inputFingerprint, groupId);
  if (reusable) return { run: reusable, duplicate: true, reused: true };
  // Deactivation affects new evaluations, never historical reads, reusable reports or running jobs.
  if (checklistVersionId && !configuration.allowInactiveChecklist) {
    const parent = await db.collection("checklists").findOne({ _id: version.checklist_id } as never);
    if (!parent || parent.is_active === false) throw new EvaluationRequestError("This checklist is inactive or no longer available for new evaluations", 409);
  }
  const enabled = (version.criteria as Array<{ enabled: boolean }>).filter((criterion) => criterion.enabled);
  try {
    const run = await repository.createRun({
      conversation_id: conversationId, dataset_group_id: String(conversation.dataset_group_id), checklist_id: String(version.checklist_id), checklist_version_id: String(version._id),
      model_id: modelId, prompt_version: promptVersion, input_fingerprint: inputFingerprint,
      ...(configuration.batchId ? { batch_id: configuration.batchId } : {}),
      ...(configuration.requestKey ? { request_key: configuration.requestKey } : {}),
      status: "queued", total_criteria: enabled.length, completed_criteria: 0, requested_at: new Date(), started_at: null,
      completed_at: null, error: null, error_category: null, final_score: null, critical_flag: null, publication_status: "pending", publication_attempts: 0, criteria_dispatched: false,
      active_key: `${groupId}:${conversationId}:${String(version._id)}:${modelId}:${promptVersion}`,
      checklist_snapshot: { sections: version.sections ?? [], criteria: version.criteria }
    });
    return { run, duplicate: false };
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      if (configuration.requestKey) {
        const requested = await repository.runs().findOne({ request_key: configuration.requestKey });
        if (requested) return { run: requested, duplicate: true };
      }
      const active = await repository.activeDuplicate(conversationId, String(version._id), configuration.modelId, configuration.promptVersion, groupId);
      if (active) return { run: active, duplicate: true };
    }
    throw error;
  }
}
