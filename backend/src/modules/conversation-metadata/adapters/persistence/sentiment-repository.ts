import type { Db } from "mongodb";
import type { NormalizedConversation } from "../../application/metadata.types.js";
import type { MessageSentimentResult, SentimentTrajectory } from "../../schemas/sentiment.schemas.js";

export interface SentimentBatchFailure { batch_index: number; target_message_ids: string[]; error: string; occurred_at: Date }
interface SentimentJobDocument {
  dataset_group_id: string; conversation_id: string; analyzer_version: string; status: string;
  source_event_id: string; failed_batches: SentimentBatchFailure[]; completed_batch_count: number;
  created_at: Date; updated_at: Date; started_at?: Date; completed_at?: Date;
  summary?: SentimentTrajectory;
}

export class SentimentRepository {
  constructor(private readonly db: Db) {}

  async ensureIndexes(): Promise<void> {
    await this.db.collection("message_sentiments").createIndex(
      { dataset_group_id: 1, conversation_id: 1, message_id: 1, analyzer_version: 1 },
      { unique: true, name: "message_sentiment_version_unique" }
    );
    await this.db.collection<SentimentJobDocument>("sentiment_jobs").createIndex(
      { dataset_group_id: 1, conversation_id: 1, analyzer_version: 1 },
      { unique: true, name: "sentiment_job_version_unique" }
    );
  }

  conversation(groupId: string, conversationId: string) {
    return this.db.collection<NormalizedConversation>("conversations").findOne({ dataset_group_id: groupId, conversation_id: conversationId });
  }

  async queue(groupId: string, conversationId: string, version: string, eventId: string): Promise<boolean> {
    const existing = await this.db.collection<SentimentJobDocument>("sentiment_jobs").findOne({ dataset_group_id: groupId, conversation_id: conversationId, analyzer_version: version });
    if (existing?.status === "queued" || existing?.status === "processing") return false;
    if (existing?.source_event_id) {
      await this.db.collection<{ _id: string; state: SentimentJobDocument }>("sentiment_analysis_history").updateOne(
        { _id: existing.source_event_id }, { $setOnInsert: { state: existing } }, { upsert: true }
      );
    }
    const now = new Date();
    const queued = await this.db.collection<SentimentJobDocument>("sentiment_jobs").updateOne(
      { dataset_group_id: groupId, conversation_id: conversationId, analyzer_version: version,
        ...(existing ? { source_event_id: existing.source_event_id, status: existing.status } : {}) },
      { $set: { status: "queued", source_event_id: eventId, failed_batches: [], completed_batch_count: 0, updated_at: now }, $setOnInsert: { created_at: now } },
      { upsert: !existing }
    );
    if (queued.matchedCount !== 1 && queued.upsertedCount !== 1) return false;
    const metadata = await this.db.collection("conversation_metadata").findOne({ dataset_group_id: groupId, conversation_id: conversationId }, { sort: { created_at: -1 }, projection: { _id: 1 } });
    if (metadata) await this.db.collection("conversation_metadata").updateOne({ _id: metadata._id }, { $set: { sentiment_status: "pending", updated_at: now } });
    return true;
  }

  async start(groupId: string, conversationId: string, version: string, eventId: string): Promise<boolean> {
    const result = await this.db.collection<SentimentJobDocument>("sentiment_jobs").updateOne(
      { dataset_group_id: groupId, conversation_id: conversationId, analyzer_version: version, source_event_id: eventId, status: { $in: ["queued", "processing"] } },
      { $set: { status: "processing", started_at: new Date(), updated_at: new Date() } }
    );
    return result.modifiedCount === 1;
  }

  async saveBatch(groupId: string, conversationId: string, version: string, promptVersion: string, batchIndex: number, results: MessageSentimentResult[], eventId?: string): Promise<void> {
    if (results.length) await this.db.collection("message_sentiments").bulkWrite(results.map((result) => ({
      updateOne: {
        filter: { dataset_group_id: groupId, conversation_id: conversationId, message_id: result.message_id, analyzer_version: version },
        update: { $set: { ...result, dataset_group_id: groupId, conversation_id: conversationId, prompt_version: promptVersion, batch_index: batchIndex, ...(eventId ? { source_event_id: eventId } : {}), processed_at: new Date() } }, upsert: true
      }
    })));
    await this.db.collection<SentimentJobDocument>("sentiment_jobs").updateOne(
      { dataset_group_id: groupId, conversation_id: conversationId, analyzer_version: version },
      { $inc: { completed_batch_count: 1 }, $set: { updated_at: new Date() } }
    );
  }

  async processedMessageIds(groupId: string, conversationId: string, version: string, eventId: string): Promise<string[]> {
    const messages = await this.db.collection("message_sentiments").find({ dataset_group_id: groupId, conversation_id: conversationId,
      analyzer_version: version, source_event_id: eventId }, { projection: { message_id: 1 } }).toArray();
    return messages.map((message) => String(message.message_id));
  }

  failBatch(groupId: string, conversationId: string, version: string, failure: SentimentBatchFailure) {
    return this.db.collection<SentimentJobDocument>("sentiment_jobs").updateOne(
      { dataset_group_id: groupId, conversation_id: conversationId, analyzer_version: version },
      { $push: { failed_batches: failure }, $set: { updated_at: new Date() } }
    );
  }

  async results(groupId: string, conversationId: string, version: string): Promise<MessageSentimentResult[]> {
    return this.db.collection<MessageSentimentResult & { dataset_group_id: string; conversation_id: string }>("message_sentiments")
      .find({ dataset_group_id: groupId, conversation_id: conversationId, analyzer_version: version }, { projection: { _id: 0, dataset_group_id: 0, conversation_id: 0, prompt_version: 0, batch_index: 0, processed_at: 0 } }).toArray();
  }

  async complete(groupId: string, conversationId: string, version: string, trajectory: SentimentTrajectory, failedBatchCount: number): Promise<void> {
    const status = failedBatchCount ? (trajectory.status === "unavailable" ? "failed" : "partial") : "completed";
    const now = new Date();
    await this.db.collection<SentimentJobDocument>("sentiment_jobs").updateOne(
      { dataset_group_id: groupId, conversation_id: conversationId, analyzer_version: version },
      { $set: { status, summary: trajectory, completed_at: now, updated_at: now } }
    );
    const metadata = await this.db.collection("conversation_metadata").findOne({ dataset_group_id: groupId, conversation_id: conversationId }, { sort: { created_at: -1 }, projection: { _id: 1 } });
    if (metadata) await this.db.collection("conversation_metadata").updateOne({ _id: metadata._id }, { $set: { sentiment_status: status, sentiment_trajectory: { analyzer_version: version, ...trajectory }, updated_at: now } });
  }

  async detail(groupId: string | undefined, conversationId: string, version: string) {
    const filter = { conversation_id: conversationId, analyzer_version: version, ...(groupId ? { dataset_group_id: groupId } : {}) };
    const job = await this.db.collection<SentimentJobDocument>("sentiment_jobs").findOne(filter, { projection: { _id: 0 } });
    if (!job) return null;
    const results = await this.results(String(job.dataset_group_id), conversationId, version);
    const metadata = await this.db.collection("conversation_metadata").findOne({ dataset_group_id: job.dataset_group_id, conversation_id: conversationId }, { sort: { created_at: -1 }, projection: { _id: 0, sentiment_trajectory: 1 } });
    return { ...job, summary: job.summary ? { analyzer_version: version, ...job.summary } : metadata?.sentiment_trajectory ?? null, message_sentiments: results };
  }

  async generation(groupId: string, conversationId: string, version: string, eventId: string) {
    const current = await this.db.collection<SentimentJobDocument>("sentiment_jobs").findOne({
      dataset_group_id: groupId, conversation_id: conversationId, analyzer_version: version, source_event_id: eventId
    });
    if (current) return current;
    const historical = await this.db.collection<{ _id: string; state: SentimentJobDocument }>("sentiment_analysis_history").findOne({
      _id: eventId, "state.dataset_group_id": groupId, "state.conversation_id": conversationId
    });
    return historical?.state ?? null;
  }
}
