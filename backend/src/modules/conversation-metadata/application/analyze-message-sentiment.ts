import { Value } from "@sinclair/typebox/value";
import type { LlmGateway } from "../../llm-gateway/application/llm-gateway.js";
import { MESSAGE_SENTIMENT_ANALYZER_VERSION, MESSAGE_SENTIMENT_PROMPT_VERSION, messageSentimentPrompt } from "../prompts/message-sentiment.v1.js";
import { SentimentBatchResponseSchema, type MessageSentimentResult } from "../schemas/sentiment.schemas.js";
import type { NormalizedConversation, NormalizedMessage } from "./metadata.types.js";

export interface SentimentBatch { batch_index: number; target_ids: string[]; context: NormalizedMessage[] }

export function prepareSentimentBatches(conversation: NormalizedConversation, batchSize = 20, overlap = 2): SentimentBatch[] {
  const human = conversation.transcript.filter((item) => item.speaker === "client" || item.speaker === "operator");
  const order = new Map(conversation.transcript.map((item, index) => [item.message_id, index]));
  const batches: SentimentBatch[] = [];
  for (let offset = 0; offset < human.length; offset += batchSize) {
    const targets = human.slice(offset, offset + batchSize);
    const positions = targets.map((item) => order.get(item.message_id)!).filter(Number.isInteger);
    const first = Math.max(0, Math.min(...positions) - overlap);
    const last = Math.min(conversation.transcript.length, Math.max(...positions) + overlap + 1);
    batches.push({ batch_index: batches.length, target_ids: targets.map((item) => item.message_id), context: conversation.transcript.slice(first, last) });
  }
  return batches;
}

function parseJson(content: string): unknown {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(trimmed); } catch { throw new Error("Message sentiment response is not valid JSON"); }
}

export async function classifySentimentBatch(batch: SentimentBatch, conversation: NormalizedConversation, gateway: LlmGateway): Promise<MessageSentimentResult[]> {
  const response = await gateway.complete(messageSentimentPrompt(batch.context, batch.target_ids), { maxTokens: Math.max(1200, batch.target_ids.length * 180), workflow: "sentiment" });
  const parsed = parseJson(response.content);
  if (!Value.Check(SentimentBatchResponseSchema, parsed)) {
    const errors = [...Value.Errors(SentimentBatchResponseSchema, parsed)].slice(0, 4).map((item) => `${item.path}: ${item.message}`).join("; ");
    throw new Error(`Message sentiment response failed validation: ${errors}`);
  }
  const results = (parsed as { results: MessageSentimentResult[] }).results;
  const targets = new Set(batch.target_ids);
  const messages = new Map(conversation.transcript.map((item) => [item.message_id, item]));
  const seen = new Set<string>();
  for (const result of results) {
    if (!targets.has(result.message_id)) throw new Error(`Sentiment response contains non-target message ID: ${result.message_id}`);
    if (seen.has(result.message_id)) throw new Error(`Sentiment response contains duplicate message ID: ${result.message_id}`);
    seen.add(result.message_id);
    const message = messages.get(result.message_id)!;
    if (message.speaker !== result.speaker) throw new Error(`Sentiment response has incompatible speaker for ${result.message_id}`);
    if (result.timestamp !== message.timestamp) throw new Error(`Sentiment response has incompatible timestamp for ${result.message_id}`);
    if (result.evidence_text && !message.text.includes(result.evidence_text)) throw new Error(`Sentiment evidence is not an exact excerpt of ${result.message_id}`);
    if (result.context_message_ids.some((id) => !batch.context.some((item) => item.message_id === id))) throw new Error(`Sentiment response contains an unknown context message ID for ${result.message_id}`);
    result.analyzer_version = MESSAGE_SENTIMENT_ANALYZER_VERSION;
    if (result.sentiment === "uncertain") result.confidence = Math.min(result.confidence, 0.65);
    if (result.sentiment === "neutral") result.intensity = Math.min(result.intensity, 0.3);
  }
  const missing = batch.target_ids.filter((id) => !seen.has(id));
  if (missing.length) throw new Error(`Sentiment response is missing target messages: ${missing.join(", ")}`);
  return results;
}

export { MESSAGE_SENTIMENT_ANALYZER_VERSION, MESSAGE_SENTIMENT_PROMPT_VERSION };
