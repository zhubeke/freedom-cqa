import { randomUUID } from "node:crypto";
import type { Producer } from "kafkajs";
import { SENTIMENT_COMPLETED_TOPIC, SENTIMENT_REQUESTED_TOPIC } from "../adapters/events/topics.js";
import { MESSAGE_SENTIMENT_ANALYZER_VERSION } from "./analyze-message-sentiment.js";

export interface SentimentEvent { event_id: string; event_type: string; event_version: 1; occurred_at: string; dataset_group_id: string; conversation_id: string; analyzer_version: string; force_reanalysis?: boolean }
export function makeSentimentEvent(type: string, groupId: string, conversationId: string, eventId: string = randomUUID()): SentimentEvent {
  return { event_id: eventId, event_type: type, event_version: 1, occurred_at: new Date().toISOString(), dataset_group_id: groupId, conversation_id: conversationId, analyzer_version: MESSAGE_SENTIMENT_ANALYZER_VERSION };
}
export function publishSentimentRequested(producer: Producer, event: SentimentEvent) {
  return producer.send({ topic: SENTIMENT_REQUESTED_TOPIC, messages: [{ key: `${event.dataset_group_id}:${event.conversation_id}`, value: JSON.stringify(event) }] });
}
export function publishSentimentCompleted(producer: Producer, event: SentimentEvent, status: string) {
  return producer.send({ topic: SENTIMENT_COMPLETED_TOPIC, messages: [{ key: `${event.dataset_group_id}:${event.conversation_id}`, value: JSON.stringify({ ...event, event_type: "cqa.sentiment.completed", status }) }] });
}
