import type { Producer } from "kafkajs";
import { BATCH_COMPLETED_TOPIC } from "../adapters/events/topics.js";
import type { BatchRepository } from "../adapters/persistence/batch-repository.js";
import { batchCompletedEvent } from "./events.js";

export async function finalizeBatch(repository: BatchRepository, producer: Producer, batchId: string) {
  const batch = await repository.find(batchId);
  if (!batch) return null;
  const completed = batch.conversation_results.filter((item) => item.status === "completed").length;
  const failed = batch.conversation_results.filter((item) => item.status === "failed").length;
  const terminal = completed + failed;
  if (terminal < batch.total) {
    await repository.collection().updateOne({ batch_id: batchId }, { $set: { completed, failed } });
    return null;
  }
  const status = failed > 0 ? "completed_with_errors" as const : "completed" as const;
  const updated = await repository.collection().findOneAndUpdate(
    { batch_id: batchId, status: { $nin: ["completed", "completed_with_errors"] } },
    { $set: { status, completed, failed, finished_at: new Date(), completion_publication_status: "pending" }, $unset: { active_key: "" } },
    { returnDocument: "after" }
  );
  const finalBatch = updated ?? await repository.find(batchId);
  if (!finalBatch || finalBatch.completion_publication_status === "published") return finalBatch;
  await producer.send({ topic: BATCH_COMPLETED_TOPIC, messages: [{ key: batchId, value: JSON.stringify(batchCompletedEvent(finalBatch)) }] });
  await repository.collection().updateOne({ batch_id: batchId }, { $set: { completion_publication_status: "published" } });
  return finalBatch;
}
