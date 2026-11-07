import type { Consumer, EachMessagePayload, Producer } from "kafkajs";
import { CONVERSATION_INGESTED_TOPIC } from "../../../conversation-ingestion/adapters/events/topics.js";
import { makeMetadataEvent, publishMetadataRequested } from "../../application/events.js";
import type { MetadataRepository } from "../persistence/metadata-repository.js";

interface IngestedEvent { event_id: string; dataset_group_id: string; conversation_id: string }

export class IngestionDispatchConsumer {
  constructor(private readonly consumer: Consumer, private readonly producer: Producer, private readonly repository: MetadataRepository) {}
  async start(): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: CONVERSATION_INGESTED_TOPIC, fromBeginning: true });
    await this.consumer.run({ eachMessage: (payload) => this.handle(payload) });
  }
  private async handle({ message }: EachMessagePayload): Promise<void> {
    if (!message.value) return;
    const ingested = JSON.parse(message.value.toString()) as IngestedEvent;
    if (!ingested.event_id || !ingested.dataset_group_id || !ingested.conversation_id) throw new Error("Invalid conversation ingested event");
    const conversation = await this.repository.findConversation(ingested.dataset_group_id, ingested.conversation_id);
    if (!conversation) throw new Error("Ingested conversation is not durable in MongoDB");
    const event = makeMetadataEvent("cqa.metadata.requested", ingested.dataset_group_id, ingested.conversation_id, `metadata:${ingested.event_id}`);
    await this.repository.queue(event.dataset_group_id, event.conversation_id, event.extractor_version, event.event_id, conversation.has_audio);
    await publishMetadataRequested(this.producer, event);
  }
  close() { return this.consumer.disconnect(); }
}

