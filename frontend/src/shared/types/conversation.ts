export type ConversationLanguage = "all" | "kk" | "ru" | "en";
export type ConversationChannel = "all" | "chat" | "call";
export type ConversationTab = "all" | "chat" | "call";

export interface Conversation {
  dataset_group_id: string;
  conversation_id: string;
  language: Exclude<ConversationLanguage, "all">;
  channel: Exclude<ConversationChannel, "all">;
  message_count: number;
  duration_ms: number | null;
  has_audio: boolean;
}

export interface ConversationListResponse {
  items: Array<{
    dataset_group_id: string; conversation_id: string;
    normalized_language: Conversation["language"];
    normalized_channel: Conversation["channel"];
    message_count: number; duration_ms: number | null; has_audio: boolean;
  }>;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export type ConversationSpeaker = "client" | "operator" | "bot" | "system";

export interface TranscriptEntry {
  message_id: string;
  timestamp: string;
  elapsed_ms: number | null;
  speaker: ConversationSpeaker;
  text: string;
}

export interface ConversationDetail {
  dataset_group_id: string;
  conversation_id: string;
  original_channel: "agent chat" | "voice call";
  original_language: "RU" | "KZ" | "EN";
  normalized_channel: Conversation["channel"];
  normalized_language: Conversation["language"];
  transcript: TranscriptEntry[];
  message_count: number;
  role_message_counts: Record<ConversationSpeaker, number>;
  has_audio: boolean;
  duration_ms: number | null;
}

export interface ImportStatus {
  import_id: string; dataset_group_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  total_records: number; processed_count: number; error: string | null;
}
