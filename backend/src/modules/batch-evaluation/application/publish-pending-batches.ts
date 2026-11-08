import type { Producer } from "kafkajs";
import { BATCH_REQUESTED_TOPIC } from "../adapters/events/topics.js";
import type { BatchRepository } from "../adapters/persistence/batch-repository.js";
import { batchRequestedEvent } from "./events.js";
import { batchCompletedEvent } from "./events.js";
import { BATCH_COMPLETED_TOPIC } from "../adapters/events/topics.js";

export async function publishPendingBatches(repository: BatchRepository, producer: Producer, batchId?: string) {
  const batches = await repository.collection().find({ publication_status: "pending", status: "queued", ...(batchId ? { batch_id: batchId } : {}) }).sort({ created_at: 1 }).limit(100).toArray();
  for (const batch of batches) {
    await repository.collection().updateOne({ batch_id: batch.batch_id }, { $inc: { publication_attempts: 1 } });
    await producer.send({ topic: BATCH_REQUESTED_TOPIC, messages: [{ key: batch.batch_id, value: JSON.stringify(batchRequestedEvent(batch)) }] });
    await repository.collection().updateOne({ batch_id: batch.batch_id }, { $set: { publication_status: "published" } });
  }
  return batches.length;
}

export async function publishPendingBatchCompletions(repository: BatchRepository, producer: Producer) {
  const batches = await repository.collection().find({ status: { $in: ["completed", "completed_with_errors"] }, completion_publication_status: "pending" }).limit(100).toArray();
  for (const batch of batches) {
    await producer.send({ topic: BATCH_COMPLETED_TOPIC, messages: [{ key: batch.batch_id, value: JSON.stringify(batchCompletedEvent(batch)) }] });
    await repository.collection().updateOne({ batch_id: batch.batch_id }, { $set: { completion_publication_status: "published" } });
  }
  return batches.length;
}
