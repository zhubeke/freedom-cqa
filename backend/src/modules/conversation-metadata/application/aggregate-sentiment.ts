import type { NormalizedConversation } from "./metadata.types.js";
import type { MessageSentimentResult, SentimentCategory, SentimentTrajectory } from "../schemas/sentiment.schemas.js";

const categories: SentimentCategory[] = ["positive", "negative", "neutral", "mixed", "uncertain"];
const rounded = (value: number) => Math.round(value * 1000) / 1000;

export function aggregateSentiment(conversation: NormalizedConversation, results: MessageSentimentResult[], partial = false): SentimentTrajectory {
  const order = new Map(conversation.transcript.map((item, index) => [item.message_id, index]));
  const sorted = [...results].sort((a, b) => order.get(a.message_id)! - order.get(b.message_id)!);
  const reliableClients = sorted.filter((item) => item.speaker === "client" && item.sentiment !== "uncertain" && item.confidence >= 0.35);
  const operators = sorted.filter((item) => item.speaker === "operator");
  const changes = reliableClients.slice(1).map((item, index) => {
    const previous = reliableClients[index]!;
    return { item, previous, change: rounded(item.sentiment_score - previous.sentiment_score) };
  });
  const nearbyOperators = (from: string, to: string) => {
    const start = order.get(from)!; const end = order.get(to)!;
    return conversation.transcript.slice(start + 1, end).filter((item) => item.speaker === "operator").map((item) => item.message_id);
  };
  const count = Object.fromEntries(categories.map((category) => [category, operators.filter((item) => item.sentiment === category).length])) as Record<SentimentCategory, number>;
  const scores = reliableClients.map((item) => item.sentiment_score);
  return {
    status: reliableClients.length ? (partial ? "partial" : "completed") : "unavailable",
    initial_client_sentiment: reliableClients[0]?.sentiment ?? null,
    final_client_sentiment: reliableClients.at(-1)?.sentiment ?? null,
    average_client_sentiment_score: scores.length ? rounded(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null,
    minimum_client_sentiment_score: scores.length ? Math.min(...scores) : null,
    maximum_client_sentiment_score: scores.length ? Math.max(...scores) : null,
    maximum_negative_emotional_intensity: reliableClients.filter((item) => item.sentiment === "negative").reduce<number | null>((max, item) => max === null ? item.intensity : Math.max(max, item.intensity), null),
    negative_client_message_count: reliableClients.filter((item) => item.sentiment === "negative").length,
    positive_client_message_count: reliableClients.filter((item) => item.sentiment === "positive").length,
    sentiment_transition_count: reliableClients.slice(1).filter((item, index) => item.sentiment !== reliableClients[index]!.sentiment).length,
    largest_negative_sentiment_change: changes.length ? Math.min(0, ...changes.map((item) => item.change)) : null,
    largest_positive_sentiment_change: changes.length ? Math.max(0, ...changes.map((item) => item.change)) : null,
    escalation_points: changes.filter((item) => item.change <= -0.4 && item.item.intensity >= 0.45).map(({ item, previous, change }) => ({ message_id: item.message_id, previous_message_id: previous.message_id, change, nearby_operator_message_ids: nearbyOperators(previous.message_id, item.message_id) })),
    recovery_points: changes.filter((item) => previousNegative(item.previous) && item.change >= 0.5 && item.item.confidence >= 0.5).map(({ item, previous, change }) => ({ message_id: item.message_id, previous_message_id: previous.message_id, change, nearby_operator_message_ids: nearbyOperators(previous.message_id, item.message_id) })),
    operator_summary: { message_count: operators.length, average_score: operators.length ? rounded(operators.reduce((sum, item) => sum + item.sentiment_score, 0) / operators.length) : null, category_counts: count }
  };
}

function previousNegative(item: MessageSentimentResult): boolean {
  return item.sentiment === "negative" && item.confidence >= 0.5;
}
