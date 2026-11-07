import type { Producer } from "kafkajs";
import type { MetadataRepository } from "../adapters/persistence/metadata-repository.js";
import { makeMetadataEvent, publishMetadataCompleted } from "./events.js";

export async function publishPendingMetadataCompletions(repository: MetadataRepository, producer: Producer): Promise<void> {
  const pending = await repository.collection().find({ completion_publication_status: "pending" }).limit(100).toArray();
  for (const item of pending) {
    await publishMetadataCompleted(producer, makeMetadataEvent("cqa.metadata.completed", item.dataset_group_id, item.conversation_id));
    await repository.collection().updateOne(
      { dataset_group_id: item.dataset_group_id, conversation_id: item.conversation_id, extractor_version: item.extractor_version },
      { $set: { completion_publication_status: "published", updated_at: new Date() } }
    );
  }
}
