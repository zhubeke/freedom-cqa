import type { Db } from "mongodb";
import type { Producer } from "kafkajs";
import type { AppConfig } from "../../../config/config.js";
import { EvaluationRepository } from "../../criterion-evaluation/adapters/persistence/evaluation-repository.js";
import { publishPendingEvaluations } from "../../evaluation-orchestration/application/publish-pending-evaluations.js";
import { startEvaluation } from "../../evaluation-orchestration/application/start-evaluation.js";
import type { BatchRepository } from "../adapters/persistence/batch-repository.js";
import { finalizeBatch } from "./finalize-batch.js";

export async function processBatch(db: Db, repository: BatchRepository, producer: Producer, config: AppConfig, batchId: string) {
  let batch = await repository.find(batchId);
  if (!batch || ["completed", "completed_with_errors", "failed", "paused"].includes(batch.status)) return batch;
  if (batch.status === "queued") {
    await repository.collection().updateOne({ batch_id: batchId, status: "queued" }, { $set: { status: "processing", started_at: batch.started_at ?? new Date(), last_error: null } });
    batch = await repository.find(batchId);
    if (!batch) return null;
  }
  for (const item of batch.conversation_results.filter((value) => (value.status === "queued" || value.status === "processing") && value.evaluation_run_id)) {
    const run = await db.collection("evaluation_runs").findOne({ run_id: item.evaluation_run_id, status: { $in: ["completed", "failed"] } });
    if (!run) continue;
    const terminalStatus = run.status === "completed" ? "completed" : "failed";
    await repository.collection().updateOne(
      { batch_id: batchId, "conversation_results": { $elemMatch: { evaluation_run_id: item.evaluation_run_id, status: { $in: ["queued", "processing"] } } } },
      { $set: { "conversation_results.$.status": terminalStatus, "conversation_results.$.error": terminalStatus === "failed" ? String(run.error ?? "Model evaluation failed.") : null }, $inc: terminalStatus === "completed" ? { completed: 1 } : { failed: 1 } }
    );
  }
  batch = await repository.find(batchId);
  if (!batch) return null;
  const activeCount = batch.conversation_results.filter((item) => item.status === "queued" || item.status === "processing").length;
  const capacity = Math.max(0, config.batch.maxConversationConcurrency - activeCount);
  if (capacity === 0) return batch;
  const pending = batch.conversation_results.filter((item) => item.status === "pending").slice(0, capacity);
  const evaluations = new EvaluationRepository(db);
  for (const item of pending) {
    const reusable = await evaluations.runs().findOne({
      conversation_id: item.conversation_id,
      checklist_version_id: batch.checklist_version_id,
      model_id: batch.model_id,
      prompt_version: batch.prompt_version,
      input_fingerprint: item.input_fingerprint,
      status: "completed"
    });
    if (reusable) {
      await repository.collection().updateOne(
        { batch_id: batchId, "conversation_results.conversation_id": item.conversation_id, "conversation_results.status": "pending" },
        { $set: { "conversation_results.$.evaluation_run_id": reusable.run_id, "conversation_results.$.status": "completed", "conversation_results.$.reused": true, "conversation_results.$.error": null }, $inc: { completed: 1 } }
      );
      continue;
    }
    const result = await startEvaluation(db, evaluations, item.conversation_id, batch.checklist_version_id, {
      modelId: batch.model_id, promptVersion: batch.prompt_version, inputFingerprint: item.input_fingerprint, batchId
    });
    await repository.collection().updateOne(
      { batch_id: batchId, "conversation_results.conversation_id": item.conversation_id, "conversation_results.status": "pending" },
      { $set: { "conversation_results.$.evaluation_run_id": result.run.run_id, "conversation_results.$.status": result.run.status === "processing" ? "processing" : "queued", "conversation_results.$.reused": false } }
    );
    if (!result.duplicate) await publishPendingEvaluations(evaluations, producer, result.run.run_id);
  }
  const finalized = await finalizeBatch(repository, producer, batchId);
  if (finalized) return finalized;
  batch = await repository.find(batchId);
  if (batch?.conversation_results.some((item) => item.status === "pending") && batch.conversation_results.every((item) => !["queued", "processing"].includes(item.status))) {
    return processBatch(db, repository, producer, config, batchId);
  }
  return batch;
}

export async function recordEvaluationCompletion(db: Db, repository: BatchRepository, producer: Producer, config: AppConfig, runId: string) {
  const run = await db.collection("evaluation_runs").findOne({ run_id: runId });
  if (!run || !["completed", "failed"].includes(String(run.status))) return;
  const status = run.status === "completed" ? "completed" : "failed";
  const affected = await repository.collection().find({ "conversation_results": { $elemMatch: { evaluation_run_id: runId, status: { $in: ["queued", "processing"] } } } }).toArray();
  for (const batch of affected) {
    const update = await repository.collection().updateOne(
      { batch_id: batch.batch_id, "conversation_results": { $elemMatch: { evaluation_run_id: runId, status: { $in: ["queued", "processing"] } } } },
      { $set: { "conversation_results.$.status": status, "conversation_results.$.error": status === "failed" ? String(run.error ?? "Model evaluation failed.") : null }, $inc: status === "completed" ? { completed: 1 } : { failed: 1 } }
    );
    if (update.modifiedCount) await processBatch(db, repository, producer, config, batch.batch_id);
  }
}
