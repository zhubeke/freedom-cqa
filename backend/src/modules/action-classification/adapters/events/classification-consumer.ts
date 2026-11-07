import type { Consumer, EachMessagePayload, Producer } from "kafkajs";
import type { AppConfig } from "../../../../config/config.js";
import type { TabPfnAdapter } from "../tabpfn/tabpfn-adapter.js";
import type { ClassificationEvent } from "../../application/action.types.js";
import { classifyConversation } from "../../application/classify-conversation.js";
import { publishClassificationCompleted } from "../../application/events.js";
import type { ClassificationRepository } from "../persistence/classification-repository.js";
import { CLASSIFICATION_REQUESTED_TOPIC } from "./topics.js";

export class ClassificationConsumer {
  constructor(private readonly consumer: Consumer, private readonly producer: Producer, private readonly repository: ClassificationRepository, private readonly adapter: TabPfnAdapter, private readonly config: AppConfig) {}
  async start() { await this.consumer.connect(); await this.consumer.subscribe({ topic: CLASSIFICATION_REQUESTED_TOPIC, fromBeginning: true }); await this.consumer.run({ eachMessage: (payload) => this.handle(payload) }); }
  private async handle({ message }: EachMessagePayload) {
    if (!message.value) return; const event = JSON.parse(message.value.toString()) as ClassificationEvent;
    if (!event.event_id || !event.dataset_group_id || !event.conversation_id) throw new Error("Invalid classification request event");
    const result = await classifyConversation(event, this.repository, this.adapter, this.config);
    if (result && result.completion_publication_status !== "published" && ["completed", "fallback"].includes(result.status)) { await publishClassificationCompleted(this.producer, result); await this.repository.markPublished(result.result_id); }
  }
  close() { return this.consumer.disconnect(); }
}
