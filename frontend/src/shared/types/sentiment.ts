export type SentimentCategory = "positive" | "negative" | "neutral" | "mixed" | "uncertain";
export interface MessageSentiment {
  message_id: string; speaker: "client" | "operator"; timestamp: string;
  sentiment: SentimentCategory; sentiment_score: number; intensity: number; confidence: number;
  emotion_tags: string[]; evidence_text: string; context_message_ids: string[]; explanation: string; analyzer_version: string;
}
export interface SentimentTrajectory {
  status: "completed" | "partial" | "unavailable";
  initial_client_sentiment: SentimentCategory | null; final_client_sentiment: SentimentCategory | null;
  average_client_sentiment_score: number | null; minimum_client_sentiment_score: number | null; maximum_client_sentiment_score: number | null;
  maximum_negative_emotional_intensity: number | null; negative_client_message_count: number; positive_client_message_count: number;
  sentiment_transition_count: number; largest_negative_sentiment_change: number | null; largest_positive_sentiment_change: number | null;
  escalation_points: Array<{ message_id: string; previous_message_id: string; change: number; nearby_operator_message_ids: string[] }>;
  recovery_points: Array<{ message_id: string; previous_message_id: string; change: number; nearby_operator_message_ids: string[] }>;
  operator_summary: { message_count: number; average_score: number | null; category_counts: Record<SentimentCategory, number> };
}
export interface SentimentAnalysis {
  dataset_group_id: string; conversation_id: string; analyzer_version: string;
  status: "queued" | "processing" | "completed" | "partial" | "failed";
  failed_batches: Array<{ batch_index: number; target_message_ids: string[]; error: string }>;
  summary: (SentimentTrajectory & { analyzer_version: string }) | null;
  message_sentiments: MessageSentiment[];
}
