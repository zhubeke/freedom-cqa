import { randomUUID } from "node:crypto";
import type { Producer } from "kafkajs";
import type { EvaluationRepository } from "../../criterion-evaluation/adapters/persistence/evaluation-repository.js";
import { EVALUATION_COMPLETED_TOPIC } from "../adapters/events/topics.js";
import type { EvaluationRunDocument } from "./evaluation.types.js";

export async function publishEvaluationCompletion(repository: EvaluationRepository, producer: Producer, run: EvaluationRunDocument) {
  if (run.completion_publication_status === "published") return;
  await producer.send({ topic: EVALUATION_COMPLETED_TOPIC, messages: [{ key: run.run_id, value: JSON.stringify({
    event_id: randomUUID(), correlation_id: run.correlation_id, conversation_id: run.conversation_id,
    evaluation_run_id: run.run_id, checklist_version_id: run.checklist_version_id, timestamp: new Date().toISOString(),
    payload_reference: `evaluation_runs/${run.run_id}`, status: run.status
  }) }] });
  await repository.runs().updateOne({ run_id: run.run_id }, { $set: { completion_publication_status: "published" } });
}

export async function publishPendingEvaluationCompletions(repository: EvaluationRepository, producer: Producer) {
  const runs = await repository.runs().find({ status: { $in: ["completed", "failed"] }, completion_publication_status: "pending" }).limit(100).toArray();
  for (const run of runs) await publishEvaluationCompletion(repository, producer, run);
  return runs.length;
}
