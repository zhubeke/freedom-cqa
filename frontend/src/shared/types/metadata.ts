export interface NullableMetric { value: number | null; reason: string | null }
export interface Signal { value: boolean; confidence: number; evidence_message_ids: string[]; explanation?: string }
export interface Intent { label: string; resolved: boolean; confidence: number; evidence_message_ids: string[]; explanation?: string }

export interface ConversationMetadata {
  dataset_group_id: string;
  conversation_id: string;
  extractor_version: string;
  deterministic_status: "pending" | "processing" | "completed" | "failed";
  semantic_status: "pending" | "processing" | "completed" | "partial" | "failed";
  audio_status: "pending" | "processing" | "completed" | "failed" | "not_applicable";
  deterministic: null | {
    conversation: { duration_seconds: NullableMetric; total_message_count: number };
    messages_and_turns: { client_message_count: number; operator_message_count: number; bot_message_count: number; system_message_count: number; client_turn_count: number; operator_turn_count: number; human_handoff_count: number };
    response_timing: { first_operator_response_seconds: NullableMetric; average_operator_response_seconds: NullableMetric; first_operator_response_after_handoff_seconds: NullableMetric };
  };
  semantic: null | {
    customer_intent?: { primary_intent: Intent; secondary_intents: Intent[]; resolved: boolean; unresolved_questions: Array<{ question: string }> };
    customer_sentiment?: { overall?: string; score?: number };
    resolution_and_follow_up?: { status: string; callback_promised: Signal; future_action_committed: Signal; further_investigation_needed: Signal; issue_open: Signal; escalation_required: Signal };
    compliance?: { identity_verification_required: Signal; identity_verification_confirmed: Signal; sensitive_information_disclosure: Signal; potential_severe_violation: Signal };
  };
  errors: Array<{ stage: string; message: string }>;
}

export interface AudioMetrics {
  status: "completed" | "failed";
  duration_seconds?: number;
  sample_rate?: number;
  channel_count?: number;
  speech_duration_seconds?: number;
  silence_duration_seconds?: number;
  silence_ratio?: number;
  speech_segment_count?: number;
  longest_silence_seconds?: number;
  rms_dbfs?: number | null;
  peak_dbfs?: number | null;
  loudness_variability?: number | null;
  speech_activity_ratio?: number;
  limitations?: string[];
  error?: string;
}

