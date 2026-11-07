import type { Db } from "mongodb";
import type { DeterministicMetadata, SemanticMetadata } from "../../schemas/metadata.schemas.js";
import type { MetadataStatus, NormalizedConversation } from "../../application/metadata.types.js";

export interface MetadataDocument {
  dataset_group_id: string;
  conversation_id: string;
  extractor_version: string;
  deterministic: DeterministicMetadata | null;
  semantic: SemanticMetadata | null;
  deterministic_status: MetadataStatus;
  semantic_status: MetadataStatus;
  audio_status: MetadataStatus;
  source_event_ids: string[];
  completion_publication_status: "not_ready" | "pending" | "published";
  errors: Array<{ stage: "deterministic" | "semantic" | "audio"; message: string; occurred_at: Date }>;
  created_at: Date;
  updated_at: Date;
}

export class MetadataRepository {
  constructor(private readonly db: Db) {}
  collection() { return this.db.collection<MetadataDocument>("conversation_metadata"); }

  async ensureIndexes(): Promise<void> {
    await this.collection().createIndex(
      { dataset_group_id: 1, conversation_id: 1, extractor_version: 1 },
      { unique: true, name: "metadata_version_unique" }
    );
    await this.collection().createIndex({ completion_publication_status: 1 });
    await this.db.collection("audio_metrics").createIndex(
      { dataset_group_id: 1, conversation_id: 1, processor_version: 1 },
      { unique: true, name: "audio_metrics_version_unique" }
    );
  }

  async findConversation(datasetGroupId: string, conversationId: string): Promise<NormalizedConversation | null> {
    return this.db.collection<NormalizedConversation>("conversations").findOne(
      { dataset_group_id: datasetGroupId, conversation_id: conversationId }
    );
  }

  async alreadyProcessed(datasetGroupId: string, conversationId: string, version: string, eventId: string): Promise<boolean> {
    return Boolean(await this.collection().findOne({
      dataset_group_id: datasetGroupId, conversation_id: conversationId, extractor_version: version,
      source_event_ids: eventId, deterministic_status: "completed", semantic_status: { $in: ["completed", "failed"] }
    }, { projection: { _id: 1 } }));
  }

  async queue(datasetGroupId: string, conversationId: string, version: string, eventId: string, hasAudio: boolean): Promise<void> {
    const now = new Date();
    await this.collection().updateOne(
      { dataset_group_id: datasetGroupId, conversation_id: conversationId, extractor_version: version },
      {
        $setOnInsert: {
          deterministic: null, semantic: null, deterministic_status: "pending", semantic_status: "pending",
          audio_status: hasAudio ? "pending" : "not_applicable", errors: [], created_at: now,
          completion_publication_status: "not_ready"
        },
        $set: { updated_at: now },
        $addToSet: { source_event_ids: eventId }
      },
      { upsert: true }
    );
  }

  async start(datasetGroupId: string, conversationId: string, version: string): Promise<void> {
    await this.collection().updateOne(
      { dataset_group_id: datasetGroupId, conversation_id: conversationId, extractor_version: version },
      { $set: { deterministic_status: "processing", semantic_status: "processing", updated_at: new Date() } }
    );
  }

  async saveDeterministic(datasetGroupId: string, conversationId: string, version: string, deterministic: DeterministicMetadata): Promise<void> {
    await this.collection().updateOne(
      { dataset_group_id: datasetGroupId, conversation_id: conversationId, extractor_version: version },
      { $set: { deterministic, deterministic_status: "completed", updated_at: new Date() } }
    );
  }

  async saveSemantic(datasetGroupId: string, conversationId: string, version: string, semantic: SemanticMetadata): Promise<void> {
    await this.collection().updateOne(
      { dataset_group_id: datasetGroupId, conversation_id: conversationId, extractor_version: version },
      { $set: { semantic, semantic_status: "completed", completion_publication_status: "pending", updated_at: new Date() } }
    );
  }

  async failSemantic(datasetGroupId: string, conversationId: string, version: string, message: string): Promise<void> {
    await this.collection().updateOne(
      { dataset_group_id: datasetGroupId, conversation_id: conversationId, extractor_version: version },
      {
        $set: { semantic_status: "failed", completion_publication_status: "pending", updated_at: new Date() },
        $push: { errors: { stage: "semantic", message, occurred_at: new Date() } }
      }
    );
  }

  async latest(datasetGroupId: string | undefined, conversationId: string) {
    return this.collection().findOne(
      { conversation_id: conversationId, ...(datasetGroupId ? { dataset_group_id: datasetGroupId } : {}) },
      { sort: { created_at: -1 }, projection: { _id: 0 } }
    );
  }

  async audioMetrics(datasetGroupId: string | undefined, conversationId: string) {
    return this.db.collection("audio_metrics").findOne(
      { conversation_id: conversationId, ...(datasetGroupId ? { dataset_group_id: datasetGroupId } : {}) },
      { sort: { processed_at: -1 }, projection: { _id: 0 } }
    );
  }

  listConversations(datasetGroupId: string, limit: number) {
    return this.db.collection<NormalizedConversation>("conversations")
      .find({ dataset_group_id: datasetGroupId }, { projection: { dataset_group_id: 1, conversation_id: 1, has_audio: 1 } })
      .sort({ conversation_id: 1 }).limit(limit).toArray();
  }
}

