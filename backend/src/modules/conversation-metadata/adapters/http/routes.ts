import { randomUUID } from "node:crypto";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { Producer } from "kafkajs";
import type { Db } from "mongodb";
import { makeMetadataEvent, publishAudioRequested, publishMetadataRequested } from "../../application/events.js";
import { METADATA_EXTRACTOR_VERSION } from "../../application/metadata.types.js";
import { MetadataRepository } from "../persistence/metadata-repository.js";
import { SentimentRepository } from "../persistence/sentiment-repository.js";
import { MESSAGE_SENTIMENT_ANALYZER_VERSION } from "../../application/analyze-message-sentiment.js";
import { makeSentimentEvent, publishSentimentRequested } from "../../application/sentiment-events.js";

const ParamsSchema = Type.Object({ id: Type.String({ minLength: 1 }) });
const GroupParamsSchema = Type.Object({ groupId: Type.String({ minLength: 1 }) });
const QuerySchema = Type.Object({ datasetGroupId: Type.Optional(Type.String({ minLength: 1 })) });

export async function registerMetadataRoutes(app: FastifyInstance, db: Db, producer: Producer): Promise<void> {
  const repository = new MetadataRepository(db);
  await repository.ensureIndexes();
  const sentiments = new SentimentRepository(db);
  await sentiments.ensureIndexes();

  app.get<{ Params: { id: string }; Querystring: { datasetGroupId?: string } }>("/api/v1/conversations/:id/metadata", { schema: { params: ParamsSchema, querystring: QuerySchema } }, async (request, reply) => {
    const item = await repository.latest(request.query.datasetGroupId, request.params.id);
    return item ?? reply.code(404).send({ error: "Conversation metadata is not available" });
  });

  app.get<{ Params: { id: string }; Querystring: { datasetGroupId?: string } }>("/api/v1/conversations/:id/audio-metrics", { schema: { params: ParamsSchema, querystring: QuerySchema } }, async (request, reply) => {
    const metrics = await repository.audioMetrics(request.query.datasetGroupId, request.params.id);
    if (metrics) return metrics;
    const metadata = await repository.latest(request.query.datasetGroupId, request.params.id);
    if (!metadata) return reply.code(404).send({ error: "Conversation metadata is not available" });
    return reply.code(202).send({ dataset_group_id: metadata.dataset_group_id, conversation_id: metadata.conversation_id, status: metadata.audio_status });
  });

  app.post<{ Params: { id: string }; Querystring: { datasetGroupId?: string } }>("/api/v1/conversations/:id/audio/retry", { schema: { params: ParamsSchema, querystring: QuerySchema } }, async (request, reply) => {
    const conversation = await db.collection("conversations").findOne({ conversation_id: request.params.id, ...(request.query.datasetGroupId ? { dataset_group_id: request.query.datasetGroupId } : {}) });
    if (!conversation) return reply.code(404).send({ error: "Conversation not found" });
    if (!conversation.has_audio || !conversation.audio_url) return reply.code(409).send({ error: "Conversation has no audio source" });
    const groupId = String(conversation.dataset_group_id);
    const event = makeMetadataEvent("cqa.audio.requested", groupId, request.params.id, `audio-retry:${randomUUID()}`);
    await db.collection("conversation_metadata").updateOne({ dataset_group_id: groupId, conversation_id: request.params.id }, { $set: { audio_status: "pending", updated_at: new Date() } });
    await publishAudioRequested(producer, event);
    return reply.code(202).send({ status: "queued", dataset_group_id: groupId, conversation_id: request.params.id, processor_version: "audio-v1" });
  });

  app.get<{ Params: { id: string }; Querystring: { datasetGroupId?: string } }>("/api/v1/conversations/:id/sentiment", { schema: { params: ParamsSchema, querystring: QuerySchema } }, async (request, reply) => {
    const result = await sentiments.detail(request.query.datasetGroupId, request.params.id, MESSAGE_SENTIMENT_ANALYZER_VERSION);
    return result ?? reply.code(404).send({ error: "Message sentiment analysis is not available" });
  });

  app.post<{ Params: { id: string }; Querystring: { datasetGroupId?: string } }>("/api/v1/conversations/:id/sentiment/analyze", { schema: { params: ParamsSchema, querystring: QuerySchema } }, async (request, reply) => {
    const conversation = await db.collection("conversations").findOne({ conversation_id: request.params.id, ...(request.query.datasetGroupId ? { dataset_group_id: request.query.datasetGroupId } : {}) });
    if (!conversation) return reply.code(404).send({ error: "Conversation not found" });
    const groupId = String(conversation.dataset_group_id);
    const event = makeSentimentEvent("cqa.sentiment.requested", groupId, request.params.id, `manual:${randomUUID()}`);
    if (!await sentiments.queue(groupId, request.params.id, event.analyzer_version, event.event_id)) return reply.code(202).send({ status: "already_active", dataset_group_id: groupId, conversation_id: request.params.id, analyzer_version: event.analyzer_version });
    await publishSentimentRequested(producer, event);
    return reply.code(202).send({ status: "queued", dataset_group_id: groupId, conversation_id: request.params.id, analyzer_version: event.analyzer_version });
  });

  app.post<{ Params: { id: string }; Querystring: { datasetGroupId?: string } }>("/api/v1/conversations/:id/metadata/extract", { schema: { params: ParamsSchema, querystring: QuerySchema } }, async (request, reply) => {
    const conversation = await db.collection("conversations").findOne({ conversation_id: request.params.id, ...(request.query.datasetGroupId ? { dataset_group_id: request.query.datasetGroupId } : {}) });
    if (!conversation) return reply.code(404).send({ error: "Conversation not found" });
    const groupId = String(conversation.dataset_group_id);
    const event = makeMetadataEvent("cqa.metadata.requested", groupId, request.params.id, `manual:${randomUUID()}`);
    await repository.queue(groupId, request.params.id, METADATA_EXTRACTOR_VERSION, event.event_id, Boolean(conversation.has_audio));
    await publishMetadataRequested(producer, event);
    if (conversation.has_audio) await publishAudioRequested(producer, { ...event, event_id: `audio:${event.event_id}` });
    return reply.code(202).send({ status: "queued", dataset_group_id: groupId, conversation_id: request.params.id, extractor_version: METADATA_EXTRACTOR_VERSION });
  });

  app.post<{ Params: { groupId: string } }>("/api/v1/datasets/:groupId/metadata/backfill", { schema: { params: GroupParamsSchema } }, async (request, reply) => {
    const conversations = await repository.listConversations(request.params.groupId, 10_000);
    const concurrency = 5;
    for (let index = 0; index < conversations.length; index += concurrency) {
      await Promise.all(conversations.slice(index, index + concurrency).map(async (conversation) => {
        const event = makeMetadataEvent("cqa.metadata.requested", request.params.groupId, conversation.conversation_id, `backfill:${METADATA_EXTRACTOR_VERSION}:${request.params.groupId}:${conversation.conversation_id}`);
        await repository.queue(request.params.groupId, conversation.conversation_id, METADATA_EXTRACTOR_VERSION, event.event_id, conversation.has_audio);
        await publishMetadataRequested(producer, event);
        if (conversation.has_audio) await publishAudioRequested(producer, { ...event, event_id: `audio:${event.event_id}` });
      }));
    }
    return reply.code(202).send({ status: "queued", dataset_group_id: request.params.groupId, queued_count: conversations.length, extractor_version: METADATA_EXTRACTOR_VERSION });
  });

  app.post<{ Params: { groupId: string } }>("/api/v1/datasets/:groupId/sentiment/backfill", { schema: { params: GroupParamsSchema } }, async (request, reply) => {
    const conversations = await repository.listConversations(request.params.groupId, 10_000);
    let queued = 0;
    for (const conversation of conversations) {
      const event = makeSentimentEvent("cqa.sentiment.requested", request.params.groupId, conversation.conversation_id, `backfill:${MESSAGE_SENTIMENT_ANALYZER_VERSION}:${request.params.groupId}:${conversation.conversation_id}:${randomUUID()}`);
      if (await sentiments.queue(request.params.groupId, conversation.conversation_id, event.analyzer_version, event.event_id)) {
        await publishSentimentRequested(producer, event); queued += 1;
      }
    }
    return reply.code(202).send({ status: "queued", dataset_group_id: request.params.groupId, queued_count: queued, skipped_active_count: conversations.length - queued, analyzer_version: MESSAGE_SENTIMENT_ANALYZER_VERSION });
  });
}
