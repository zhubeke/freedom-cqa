import type { Consumer, EachMessagePayload, Producer } from "kafkajs";
import type { LlmGateway } from "../../../llm-gateway/application/llm-gateway.js";
import { processMetadata } from "../../application/process-metadata.js";
import type { MetadataEvent } from "../../application/events.js";
import type { MetadataRepository } from "../persistence/metadata-repository.js";
import { METADATA_REQUESTED_TOPIC } from "./topics.js";

export class MetadataConsumer {
  constructor(private readonly consumer: Consumer, private readonly producer: Producer, private readonly repository: MetadataRepository, private readonly gateway: LlmGateway) {}
  async start(): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: METADATA_REQUESTED_TOPIC, fromBeginning: true });
    await this.consumer.run({ partitionsConsumedConcurrently: 4, eachMessage: (payload) => this.handle(payload) });
  }
  private async handle({ message }: EachMessagePayload): Promise<void> {
    if (!message.value) return;
    const event = JSON.parse(message.value.toString()) as MetadataEvent;
    if (!event.event_id || !event.dataset_group_id || !event.conversation_id || !event.extractor_version) throw new Error("Invalid metadata request event");
    if (await this.repository.alreadyProcessed(event.dataset_group_id, event.conversation_id, event.extractor_version, event.event_id)) return;
    await processMetadata(event, this.repository, this.gateway, this.producer);
  }
  close() { return this.consumer.disconnect(); }
}

