export const METADATA_EXTRACTOR_VERSION = "deterministic-v1+semantic-v3";

export type MetadataStatus = "pending" | "processing" | "completed" | "partial" | "failed" | "not_applicable";

export interface NormalizedMessage {
  message_id: string;
  timestamp: string;
  elapsed_ms: number | null;
  speaker: "client" | "operator" | "bot" | "system";
  text: string;
}

export interface NormalizedConversation {
  dataset_group_id: string;
  conversation_id: string;
  original_channel: "agent chat" | "voice call";
  original_language: "RU" | "KZ" | "EN";
  normalized_channel: "chat" | "call";
  normalized_language: "ru" | "kk" | "en";
  transcript: NormalizedMessage[];
  has_audio: boolean;
  audio_url?: string | null;
}

export interface NullableMetric {
  value: number | null;
  reason: string | null;
}

