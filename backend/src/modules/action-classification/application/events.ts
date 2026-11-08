import type { Producer } from "kafkajs";
import type { ClassificationEvent } from "./action.types.js";
import { ACTION_CLASSIFIED_TOPIC, CLASSIFICATION_REQUESTED_TOPIC } from "../adapters/events/topics.js";

export function publishClassificationRequested(producer: Producer, event: ClassificationEvent) { return producer.send({ topic: CLASSIFICATION_REQUESTED_TOPIC, messages: [{ key: `${event.dataset_group_id}:${event.conversation_id}`, value: JSON.stringify(event) }] }); }
export async function publishClassificationCompleted(producer: Producer, result: any) { await producer.send({ topic: ACTION_CLASSIFIED_TOPIC, messages: [{ key: `${result.dataset_group_id}:${result.conversation_id}`, value: JSON.stringify({ event_id: `classified:${result.source_event_id}`, correlation_id: result.correlation_id, event_type: "cqa.action.classified", event_version: 1, occurred_at: new Date().toISOString(), dataset_group_id: result.dataset_group_id, conversation_id: result.conversation_id, result_id: result.result_id, action: result.final_action, classification_source: result.classification_source }) }] }); }
