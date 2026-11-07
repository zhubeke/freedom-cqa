import type { Consumer, EachMessagePayload, Producer } from "kafkajs";
import type { LlmGateway } from "../../../llm-gateway/application/llm-gateway.js";
import { processSentiment } from "../../application/process-sentiment.js";
import type { SentimentEvent } from "../../application/sentiment-events.js";
import type { SentimentRepository } from "../persistence/sentiment-repository.js";
import { SENTIMENT_REQUESTED_TOPIC } from "./topics.js";

export class SentimentConsumer {
  constructor(private readonly consumer: Consumer, private readonly producer: Producer, private readonly repository: SentimentRepository, private readonly gateway: LlmGateway, private readonly batchSize: number) {}
  async start(): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: SENTIMENT_REQUESTED_TOPIC, fromBeginning: true });
    await this.consumer.run({ partitionsConsumedConcurrently: 2, eachMessage: (payload) => this.handle(payload) });
  }
  private async handle({ message }: EachMessagePayload): Promise<void> {
    if (!message.value) return;
    const event = JSON.parse(message.value.toString()) as SentimentEvent;
    if (!event.event_id || !event.dataset_group_id || !event.conversation_id || !event.analyzer_version) throw new Error("Invalid sentiment request event");
    await processSentiment(event, this.repository, this.gateway, this.producer, this.batchSize);
  }
  close() { return this.consumer.disconnect(); }
}
