import type { Producer } from "kafkajs";
import type { LlmGateway } from "../../llm-gateway/application/llm-gateway.js";
import type { MetadataRepository } from "../adapters/persistence/metadata-repository.js";
import { extractDeterministicMetadata } from "./extract-deterministic.js";
import { extractSemanticMetadata } from "./extract-semantic.js";
import { makeMetadataEvent, publishMetadataCompleted } from "./events.js";
import type { MetadataEvent } from "./events.js";

export async function processMetadata(event: MetadataEvent, repository: MetadataRepository, gateway: LlmGateway, producer: Producer): Promise<void> {
  const conversation = await repository.findConversation(event.dataset_group_id, event.conversation_id);
  if (!conversation) throw new Error(`Conversation ${event.dataset_group_id}/${event.conversation_id} was not found`);
  await repository.queue(event.dataset_group_id, event.conversation_id, event.extractor_version, event.event_id, conversation.has_audio);
  await repository.start(event.dataset_group_id, event.conversation_id, event.extractor_version);
  const deterministic = extractDeterministicMetadata(conversation);
  await repository.saveDeterministic(event.dataset_group_id, event.conversation_id, event.extractor_version, deterministic);
  try {
    const semantic = await extractSemanticMetadata(conversation, gateway);
    await repository.saveSemantic(event.dataset_group_id, event.conversation_id, event.extractor_version, semantic);
  } catch (error) {
    await repository.failSemantic(event.dataset_group_id, event.conversation_id, event.extractor_version, error instanceof Error ? error.message : "Unknown semantic extraction failure");
  }
  await publishMetadataCompleted(producer, makeMetadataEvent("cqa.metadata.completed", event.dataset_group_id, event.conversation_id));
  await repository.collection().updateOne(
    { dataset_group_id: event.dataset_group_id, conversation_id: event.conversation_id, extractor_version: event.extractor_version },
    { $set: { completion_publication_status: "published", updated_at: new Date() } }
  );
}
