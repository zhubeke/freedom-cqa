import { randomUUID } from "node:crypto";
import type { Producer } from "kafkajs";
import { AUDIO_REQUESTED_TOPIC, METADATA_COMPLETED_TOPIC, METADATA_REQUESTED_TOPIC } from "../adapters/events/topics.js";
import { METADATA_EXTRACTOR_VERSION } from "./metadata.types.js";

export interface MetadataEvent {
  event_id: string;
  event_type: string;
  event_version: 1;
  occurred_at: string;
  dataset_group_id: string;
  conversation_id: string;
  extractor_version: string;
}

export function makeMetadataEvent(type: string, datasetGroupId: string, conversationId: string, eventId: string = randomUUID()): MetadataEvent {
  return { event_id: eventId, event_type: type, event_version: 1, occurred_at: new Date().toISOString(), dataset_group_id: datasetGroupId, conversation_id: conversationId, extractor_version: METADATA_EXTRACTOR_VERSION };
}

export async function publishMetadataRequested(producer: Producer, event: MetadataEvent): Promise<void> {
  await producer.send({ topic: METADATA_REQUESTED_TOPIC, messages: [{ key: `${event.dataset_group_id}:${event.conversation_id}`, value: JSON.stringify(event) }] });
}

export async function publishAudioRequested(producer: Producer, event: MetadataEvent): Promise<void> {
  await producer.send({ topic: AUDIO_REQUESTED_TOPIC, messages: [{ key: `${event.dataset_group_id}:${event.conversation_id}`, value: JSON.stringify({ ...event, event_type: "cqa.audio.requested", processor_version: "audio-v1" }) }] });
}

export async function publishMetadataCompleted(producer: Producer, event: MetadataEvent): Promise<void> {
  await producer.send({ topic: METADATA_COMPLETED_TOPIC, messages: [{ key: `${event.dataset_group_id}:${event.conversation_id}`, value: JSON.stringify({ ...event, event_type: "cqa.metadata.completed" }) }] });
}

