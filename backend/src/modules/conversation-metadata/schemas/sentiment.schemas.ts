import { Type, type Static } from "@sinclair/typebox";

export const SentimentCategorySchema = Type.Union([
  Type.Literal("positive"), Type.Literal("negative"), Type.Literal("neutral"),
  Type.Literal("mixed"), Type.Literal("uncertain")
]);

export const MessageSentimentResultSchema = Type.Object({
  message_id: Type.String({ minLength: 1 }),
  speaker: Type.Union([Type.Literal("client"), Type.Literal("operator")]),
  timestamp: Type.String(),
  sentiment: SentimentCategorySchema,
  sentiment_score: Type.Number({ minimum: -1, maximum: 1 }),
  intensity: Type.Number({ minimum: 0, maximum: 1 }),
  confidence: Type.Number({ minimum: 0, maximum: 1 }),
  emotion_tags: Type.Array(Type.String({ minLength: 1 }), { maxItems: 8 }),
  evidence_text: Type.String(),
  context_message_ids: Type.Array(Type.String({ minLength: 1 })),
  explanation: Type.String({ minLength: 1 }),
  analyzer_version: Type.String({ minLength: 1 })
});

export const SentimentBatchResponseSchema = Type.Object({
  results: Type.Array(MessageSentimentResultSchema)
});

export type SentimentCategory = Static<typeof SentimentCategorySchema>;
export type MessageSentimentResult = Static<typeof MessageSentimentResultSchema>;

export interface SentimentTrajectory {
  status: "completed" | "partial" | "unavailable";
  initial_client_sentiment: SentimentCategory | null;
  final_client_sentiment: SentimentCategory | null;
  average_client_sentiment_score: number | null;
  minimum_client_sentiment_score: number | null;
  maximum_client_sentiment_score: number | null;
  maximum_negative_emotional_intensity: number | null;
  negative_client_message_count: number;
  positive_client_message_count: number;
  sentiment_transition_count: number;
  largest_negative_sentiment_change: number | null;
  largest_positive_sentiment_change: number | null;
  escalation_points: Array<{ message_id: string; previous_message_id: string; change: number; nearby_operator_message_ids: string[] }>;
  recovery_points: Array<{ message_id: string; previous_message_id: string; change: number; nearby_operator_message_ids: string[] }>;
  operator_summary: { message_count: number; average_score: number | null; category_counts: Record<SentimentCategory, number> };
}
