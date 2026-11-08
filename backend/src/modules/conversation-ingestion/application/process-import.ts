import type { Producer } from "kafkajs";
import type { ImportRepository } from "../../dataset-import/application/import-repository.js";
import { validateDataset } from "../schemas/dataset.js";
import { normalizeConversation } from "./normalize-conversation.js";
import type { ConversationRepository } from "../adapters/persistence/conversation-repository.js";
import { CONVERSATION_INGESTED_TOPIC } from "../adapters/events/topics.js";

export async function processImport(
  importId: string,
  imports: ImportRepository,
  conversations: ConversationRepository,
  producer: Producer
): Promise<void> {
  const claimed = await imports.collection().findOneAndUpdate(
    { import_id: importId, status: { $in: ["queued", "processing", "failed"] } },
    { $set: { status: "processing", last_error: null } },
    { returnDocument: "after" }
  );
  if (!claimed || claimed.status === "completed") return;

  try {
    const dataset = validateDataset(claimed.original_payload);
    for (let index = claimed.processed_count; index < dataset.data.records.length; index += 1) {
      const record = dataset.data.records[index];
      if (!record) throw new Error(`Record ${index} is missing`);
      const normalized = normalizeConversation(dataset.data.dataset_group_id, record);
      await conversations.upsertComplete(normalized);
      await producer.send({
        topic: CONVERSATION_INGESTED_TOPIC,
        messages: [{
          key: `${dataset.data.dataset_group_id}:${record.conversation_id}`,
          value: JSON.stringify({
            event_id: `${claimed.event_id}:${record.conversation_id}`,
            event_type: "cqa.conversation.ingested",
            event_version: 1,
            occurred_at: new Date().toISOString(),
            correlation_id: claimed.import_id,
            import_id: claimed.import_id,
            dataset_group_id: dataset.data.dataset_group_id,
            conversation_id: record.conversation_id
          })
        }]
      });
      await imports.collection().updateOne({ import_id: importId }, { $set: { processed_count: index + 1 } });
    }
    await imports.collection().updateOne({ import_id: importId }, {
      $set: { status: "completed", processed_at: new Date(), processed_count: dataset.data.records.length, last_error: null }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown processing error";
    await imports.collection().updateOne({ import_id: importId }, {
      $set: { status: "failed", processed_at: new Date(), last_error: message }
    });
    throw error;
  }
}
