import type { Db } from "mongodb";
import type { DeterministicMetadata, SemanticMetadata } from "../../schemas/metadata.schemas.js";
import type { MetadataStatus, NormalizedConversation } from "../../application/metadata.types.js";

export interface MetadataDocument {
  dataset_group_id: string;
  conversation_id: string;
  extractor_version: string;
  deterministic: DeterministicMetadata | null;
  semantic: Partial<SemanticMetadata> | null;
  deterministic_status: MetadataStatus;
  semantic_status: MetadataStatus;
  audio_status: MetadataStatus;
  source_event_ids: string[];
  current_event_id?: string;
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
  }

  async findConversation(datasetGroupId: string, conversationId: string): Promise<NormalizedConversation | null> {
    return this.db.collection<NormalizedConversation>("conversations").findOne(
      { dataset_group_id: datasetGroupId, conversation_id: conversationId }
    );
  }

  async alreadyProcessed(datasetGroupId: string, conversationId: string, version: string, eventId: string): Promise<boolean> {
    const item = await this.collection().findOne({ dataset_group_id: datasetGroupId, conversation_id: conversationId, extractor_version: version });
    // An older delivery must not overwrite a newer explicitly requested analysis.
    if (item?.current_event_id && item.current_event_id !== eventId) return true;
    return item?.deterministic_status === "completed" && ["completed", "partial"].includes(item.semantic_status);
  }

  async queue(datasetGroupId: string, conversationId: string, version: string, eventId: string, hasAudio: boolean, force = false): Promise<boolean> {
    const now = new Date();
    const identity = { dataset_group_id: datasetGroupId, conversation_id: conversationId, extractor_version: version };
    if (force) {
      const existing = await this.collection().findOne(identity);
      if (existing?.current_event_id === eventId) return true;
      if (existing && [existing.deterministic_status, existing.semantic_status].some((status) => status === "pending" || status === "processing")) return false;
      if (existing?.current_event_id) {
        await this.db.collection<{ _id: string; state: MetadataDocument }>("metadata_analysis_history").updateOne(
          { _id: existing.current_event_id }, { $setOnInsert: { state: existing } }, { upsert: true }
        );
      }
      // Retain previous results while the requested generation is being analyzed.
      const queued = await this.collection().updateOne({ ...identity, ...(existing ? { deterministic_status: existing.deterministic_status, semantic_status: existing.semantic_status } : {}) }, {
        $setOnInsert: { deterministic: null, semantic: null, audio_status: hasAudio ? "pending" : "not_applicable", created_at: now },
        $set: { deterministic_status: "pending", semantic_status: "pending", current_event_id: eventId, errors: [], completion_publication_status: "not_ready", updated_at: now },
        $addToSet: { source_event_ids: eventId }
      }, { upsert: !existing });
      return queued.matchedCount === 1 || queued.upsertedCount === 1;
    }
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
    return true;
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

  async saveSemantic(datasetGroupId: string, conversationId: string, version: string, semantic: Partial<SemanticMetadata>, validationErrors: Array<{ path: string; message: string }> = []): Promise<void> {
    await this.collection().updateOne(
      { dataset_group_id: datasetGroupId, conversation_id: conversationId, extractor_version: version },
      {
        $set: { semantic, semantic_status: validationErrors.length ? "partial" : "completed", completion_publication_status: "pending", updated_at: new Date() },
        ...(validationErrors.length ? { $push: { errors: { $each: validationErrors.map((error) => ({ stage: "semantic" as const, message: `${error.path}: ${error.message}`, occurred_at: new Date() })) } } } : {})
      }
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

  async generation(datasetGroupId: string, conversationId: string, eventId: string) {
    const current = await this.latest(datasetGroupId, conversationId);
    if (current?.current_event_id === eventId) return current;
    const historical = await this.db.collection<{ _id: string; state: MetadataDocument }>("metadata_analysis_history").findOne({
      _id: eventId, "state.dataset_group_id": datasetGroupId, "state.conversation_id": conversationId
    });
    return historical?.state ?? null;
  }

  async audioMetrics(datasetGroupId: string | undefined, conversationId: string) {
    return this.db.collection("audio_metrics").findOne(
      { conversation_id: conversationId, ...(datasetGroupId ? { dataset_group_id: datasetGroupId } : {}) },
      { sort: { processing_completed_at: -1 }, projection: { _id: 0 } }
    );
  }

  listConversations(datasetGroupId: string, limit: number) {
    return this.db.collection<NormalizedConversation>("conversations")
      .find({ dataset_group_id: datasetGroupId }, { projection: { dataset_group_id: 1, conversation_id: 1, has_audio: 1 } })
      .sort({ conversation_id: 1 }).limit(limit).toArray();
  }
}

