import assert from "node:assert/strict";
import test from "node:test";
import type { LlmGateway } from "../../llm-gateway/application/llm-gateway.js";
import { aggregateSentiment } from "../application/aggregate-sentiment.js";
import { classifySentimentBatch, prepareSentimentBatches } from "../application/analyze-message-sentiment.js";
import type { NormalizedConversation } from "../application/metadata.types.js";
import type { MessageSentimentResult } from "../schemas/sentiment.schemas.js";

const conversation: NormalizedConversation = {
  dataset_group_id: "DEV", conversation_id: "p1-ru-001", original_channel: "agent chat", original_language: "RU", normalized_channel: "chat", normalized_language: "ru", has_audio: false,
  transcript: [
    { message_id: "m1", timestamp: "00:00:01", elapsed_ms: 1000, speaker: "client", text: "Где найти мой тариф?" },
    { message_id: "m2", timestamp: "00:00:02", elapsed_ms: 2000, speaker: "bot", text: "Соединяю с оператором" },
    { message_id: "m3", timestamp: "00:00:03", elapsed_ms: 3000, speaker: "operator", text: "Откройте раздел Тариф" },
    { message_id: "m4", timestamp: "00:00:04", elapsed_ms: 4000, speaker: "client", text: "Нашёл, большое спасибо!" }
  ]
};

function result(message_id: string, speaker: "client" | "operator", sentiment: MessageSentimentResult["sentiment"], score: number, evidence: string, confidence = 0.9): MessageSentimentResult {
  const message = conversation.transcript.find((item) => item.message_id === message_id)!;
  return { message_id, speaker, timestamp: message.timestamp, sentiment, sentiment_score: score, intensity: sentiment === "neutral" ? 0.1 : 0.7, confidence, emotion_tags: [], evidence_text: evidence, context_message_ids: conversation.transcript.map((item) => item.message_id), explanation: "Supported by the message", analyzer_version: "message-sentiment.v1" };
}

const gateway = (payload: unknown): LlmGateway => ({ complete: async () => ({ content: JSON.stringify(payload), modelId: "test", latencyMs: 1, usage: null }) });

test("bounded batches retain bot context but target only human messages", () => {
  const batches = prepareSentimentBatches(conversation, 15, 2);
  assert.deepEqual(batches[0]?.target_ids, ["m1", "m3", "m4"]);
  assert.equal(batches[0]?.context.some((item) => item.speaker === "bot"), true);
});

test("neutral request and explicit gratitude validate with exact evidence", async () => {
  const batch = prepareSentimentBatches(conversation)[0]!;
  const results = await classifySentimentBatch(batch, conversation, gateway({ results: [result("m1", "client", "neutral", 0, "Где найти мой тариф?"), result("m3", "operator", "neutral", 0, "Откройте раздел Тариф"), result("m4", "client", "positive", 0.8, "большое спасибо") ] }));
  assert.equal(results[0]?.sentiment, "neutral");
  assert.equal(results[2]?.sentiment, "positive");
});

test("invented references and missing classifications are rejected", async () => {
  const batch = prepareSentimentBatches(conversation)[0]!;
  await assert.rejects(classifySentimentBatch(batch, conversation, gateway({ results: [result("m1", "client", "neutral", 0, "Где найти мой тариф?")] })), /missing target messages/);
  await assert.rejects(classifySentimentBatch(batch, conversation, gateway({ results: [{ ...result("m1", "client", "neutral", 0, "Где найти мой тариф?"), message_id: "invented" }] })), /non-target message ID/);
});

test("trajectory keeps client and operator separate and identifies recovery", () => {
  const values = [result("m1", "client", "negative", -0.8, "Где найти мой тариф?"), result("m3", "operator", "neutral", 0, "Откройте раздел Тариф"), result("m4", "client", "positive", 0.8, "большое спасибо")];
  const trajectory = aggregateSentiment(conversation, values);
  assert.equal(trajectory.initial_client_sentiment, "negative");
  assert.equal(trajectory.final_client_sentiment, "positive");
  assert.equal(trajectory.recovery_points[0]?.nearby_operator_message_ids[0], "m3");
  assert.equal(trajectory.operator_summary.message_count, 1);
});

test("uncertain noisy observations are excluded from reliable client summary", () => {
  const uncertain = result("m1", "client", "uncertain", -0.2, "Где найти", 0.4);
  const trajectory = aggregateSentiment(conversation, [uncertain], true);
  assert.equal(trajectory.status, "unavailable");
  assert.equal(trajectory.initial_client_sentiment, null);
});
