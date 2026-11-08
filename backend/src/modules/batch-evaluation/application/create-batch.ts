import { createHash, randomUUID } from "node:crypto";
import { MongoServerError, type Db } from "mongodb";
import type { AppConfig } from "../../../config/config.js";
import type { EvaluationBatchDocument } from "./batch.types.js";
import type { BatchRepository } from "../adapters/persistence/batch-repository.js";

export const CRITERION_PROMPT_VERSION = "criterion-v1";

export class BatchRequestError extends Error {
  constructor(message: string, public readonly statusCode = 400) { super(message); }
}

function fingerprint(conversation: Record<string, unknown>, checklistVersionId: string, modelId: string, promptVersion: string) {
  return createHash("sha256").update(JSON.stringify({
    conversation_id: conversation.conversation_id,
    dataset_group_id: conversation.dataset_group_id,
    language: conversation.normalized_language,
    transcript: conversation.transcript,
    checklist_version_id: checklistVersionId,
    model_id: modelId,
    prompt_version: promptVersion
  })).digest("hex");
}

export async function createBatch(db: Db, repository: BatchRepository, config: AppConfig, datasetGroupId: string, checklistVersionId: string, maxConversations?: number) {
  const version = await db.collection<{ _id: string; checklist_id: string; criteria: Array<{ enabled: boolean }> }>("checklist_versions").findOne({ _id: checklistVersionId });
  if (!version) throw new BatchRequestError("Checklist version not found", 404);
  const parent = await db.collection("checklists").findOne({ _id: version.checklist_id } as never);
  if (!parent || parent.is_active === false) throw new BatchRequestError("This checklist is inactive or no longer available for new evaluations", 409);
  const allConversations = await db.collection<Record<string, unknown>>("conversations").find({ dataset_group_id: datasetGroupId }).sort({ conversation_id: 1 }).toArray();
  const conversations = maxConversations ? allConversations.slice(0, maxConversations) : allConversations;
  if (conversations.length === 0) throw new BatchRequestError("Dataset contains no conversations", 404);
  const batchId = randomUUID();
  const now = new Date();
  const activeKey = `${datasetGroupId}:${checklistVersionId}:${config.llm.model}:${CRITERION_PROMPT_VERSION}:${maxConversations ?? "full"}`;
  const document: EvaluationBatchDocument = {
    _id: batchId, batch_id: batchId, dataset_group_id: datasetGroupId, checklist_id: version.checklist_id,
    checklist_version_id: checklistVersionId, model_id: config.llm.model, prompt_version: CRITERION_PROMPT_VERSION,
    status: "queued", total: conversations.length, completed: 0, failed: 0,
    conversation_results: conversations.map((conversation) => ({
      conversation_id: String(conversation.conversation_id),
      input_fingerprint: fingerprint(conversation, checklistVersionId, config.llm.model, CRITERION_PROMPT_VERSION),
      evaluation_run_id: null, status: "pending", reused: false, error: null
    })),
    created_at: now, started_at: null, finished_at: null, last_error: null,
    event_id: randomUUID(), correlation_id: batchId, publication_status: "pending", publication_attempts: 0,
    completion_publication_status: null, active_key: activeKey,
    ...(maxConversations ? { max_conversations: maxConversations } : {})
  };
  try {
    await repository.collection().insertOne(document);
    return { batch: document, duplicate: false };
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      const existing = await repository.collection().findOne({ active_key: activeKey });
      if (existing) return { batch: existing, duplicate: true };
    }
    throw error;
  }
}
