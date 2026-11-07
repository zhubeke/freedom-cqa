import type { Producer } from "kafkajs";
import type { EvaluationRepository } from "../../criterion-evaluation/adapters/persistence/evaluation-repository.js";
import { EVALUATION_REQUESTED_TOPIC } from "../adapters/events/topics.js";
import { evaluationEvent } from "./events.js";

export async function publishPendingEvaluations(repository: EvaluationRepository, producer: Producer, runId?: string) {
  const runs = await repository.runs().find({ publication_status: "pending", status: "queued", ...(runId ? { run_id: runId } : {}) }).sort({ requested_at: 1 }).limit(100).toArray();
  for (const run of runs) {
    await repository.runs().updateOne({ run_id: run.run_id }, { $inc: { publication_attempts: 1 } });
    await producer.send({ topic: EVALUATION_REQUESTED_TOPIC, messages: [{ key: run.run_id, value: JSON.stringify(evaluationEvent(run)) }] });
    await repository.runs().updateOne({ run_id: run.run_id }, { $set: { publication_status: "published" } });
  }
  return runs.length;
}
