import type { Producer } from "kafkajs";
import type { LlmGateway } from "../../llm-gateway/application/llm-gateway.js";
import type { SentimentRepository } from "../adapters/persistence/sentiment-repository.js";
import { aggregateSentiment } from "./aggregate-sentiment.js";
import { classifySentimentBatch, MESSAGE_SENTIMENT_PROMPT_VERSION, prepareSentimentBatches } from "./analyze-message-sentiment.js";
import { makeSentimentEvent, publishSentimentCompleted, type SentimentEvent } from "./sentiment-events.js";

export async function processSentiment(event: SentimentEvent, repository: SentimentRepository, gateway: LlmGateway, producer: Producer, batchSize = 20): Promise<void> {
  if (!await repository.start(event.dataset_group_id, event.conversation_id, event.analyzer_version, event.event_id)) return;
  const conversation = await repository.conversation(event.dataset_group_id, event.conversation_id);
  if (!conversation) throw new Error(`Conversation ${event.dataset_group_id}/${event.conversation_id} was not found`);
  const existing = await repository.results(event.dataset_group_id, event.conversation_id, event.analyzer_version);
  const existingIds = new Set(event.force_reanalysis
    ? await repository.processedMessageIds(event.dataset_group_id, event.conversation_id, event.analyzer_version, event.event_id)
    : existing.map((item) => item.message_id));
  const batches = prepareSentimentBatches(conversation, batchSize)
    .map((batch) => ({ ...batch, target_ids: batch.target_ids.filter((id) => !existingIds.has(id)) }))
    .filter((batch) => batch.target_ids.length > 0);
  let failures = 0;
  for (const batch of batches) {
    try {
      const results = await classifySentimentBatch(batch, conversation, gateway);
      await repository.saveBatch(event.dataset_group_id, event.conversation_id, event.analyzer_version, MESSAGE_SENTIMENT_PROMPT_VERSION, batch.batch_index, results, event.event_id);
    } catch (error) {
      failures += 1;
      await repository.failBatch(event.dataset_group_id, event.conversation_id, event.analyzer_version, { batch_index: batch.batch_index, target_message_ids: batch.target_ids, error: error instanceof Error ? error.message : "Unknown sentiment batch failure", occurred_at: new Date() });
    }
  }
  const results = await repository.results(event.dataset_group_id, event.conversation_id, event.analyzer_version);
  const trajectory = aggregateSentiment(conversation, results, failures > 0);
  await repository.complete(event.dataset_group_id, event.conversation_id, event.analyzer_version, trajectory, failures);
  await publishSentimentCompleted(producer, makeSentimentEvent("cqa.sentiment.completed", event.dataset_group_id, event.conversation_id, `completed:${event.event_id}`), failures ? (results.length ? "partial" : "failed") : "completed");
}
