import type { Producer } from "kafkajs";
import type { ImportRepository, RawImportDocument } from "./import-repository.js";
import { DATASET_IMPORT_REQUESTED_TOPIC } from "../../conversation-ingestion/adapters/events/topics.js";

function eventFor(item: RawImportDocument) {
  return {
    event_id: item.event_id,
    event_type: "cqa.dataset.import.requested",
    event_version: 1,
    occurred_at: item.requested_at.toISOString(),
    correlation_id: item.import_id,
    import_id: item.import_id,
    dataset_group_id: item.dataset_group_id
  };
}

export async function publishPendingImports(repository: ImportRepository, producer: Producer, importId?: string): Promise<number> {
  const query = { publication_status: "pending" as const, status: "queued" as const, ...(importId ? { import_id: importId } : {}) };
  const pending = await repository.collection().find(query).sort({ requested_at: 1 }).limit(100).toArray();
  for (const item of pending) {
    await repository.collection().updateOne({ import_id: item.import_id }, { $inc: { publication_attempts: 1 } });
    await producer.send({
      topic: DATASET_IMPORT_REQUESTED_TOPIC,
      messages: [{ key: item.import_id, value: JSON.stringify(eventFor(item)) }]
    });
    await repository.collection().updateOne({ import_id: item.import_id }, { $set: { publication_status: "published" } });
  }
  return pending.length;
}
