import type { FastifyInstance } from "fastify";
import type { Producer } from "kafkajs";
import type { Db } from "mongodb";
import type { AppConfig } from "../../../../config/config.js";
import { ACTION_DEFINITIONS, ACTION_FEATURE_VERSION, type ActionCode } from "../../application/action.types.js";
import { publishClassificationRequested } from "../../application/events.js";
import { trainingReadiness } from "../../application/training-readiness.js";
import { ClassificationRepository } from "../persistence/classification-repository.js";
import { ClassificationParamsSchema, ClassificationQuerySchema, DatasetClassifyBodySchema, DatasetParamsSchema, VerifyLabelBodySchema, type DatasetClassifyBody, type VerifyLabelBody } from "../../schemas/classification.schemas.js";

export async function registerClassificationRoutes(app: FastifyInstance, db: Db, producer: Producer, config: AppConfig) {
  const repository = new ClassificationRepository(db); await repository.ensureIndexes();
  app.get("/api/v1/actions", async () => ACTION_DEFINITIONS);
  app.post<{ Params: { id: string }; Querystring: { datasetGroupId?: string; force?: boolean } }>("/api/v1/conversations/:id/classify", { schema: { params: ClassificationParamsSchema, querystring: ClassificationQuerySchema } }, async (request, reply) => {
    const conversation = await db.collection("conversations").findOne({ conversation_id: request.params.id, ...(request.query.datasetGroupId ? { dataset_group_id: request.query.datasetGroupId } : {}) }, { projection: { dataset_group_id: 1 } });
    if (!conversation) return reply.code(404).send({ error: "Conversation not found" });
    const queued = await repository.queue(String(conversation.dataset_group_id), request.params.id, request.query.force === true);
    if (!queued.duplicate) { try { await publishClassificationRequested(producer, queued.event); } catch (error) { request.log.warn({ resultId: queued.result.result_id, error }, "Classification publication deferred to recovery"); } }
    return reply.code(202).send({ result_id: queued.result.result_id, status: queued.result.status, duplicate: queued.duplicate });
  });
  app.get<{ Params: { id: string }; Querystring: { datasetGroupId?: string } }>("/api/v1/conversations/:id/action", { schema: { params: ClassificationParamsSchema, querystring: TypeOptionalGroup } }, async (request, reply) => {
    const result = await repository.latest(request.query.datasetGroupId, request.params.id); if (!result) return reply.code(404).send({ error: "Classification not found" });
    const history = await repository.history(request.query.datasetGroupId, request.params.id);
    return { ...result, previous_classification: history[1] ?? null };
  });
  app.get<{ Querystring: { status?: string; datasetGroupId?: string; conversationId?: string; limit?: string } }>("/api/v1/classification/labels", async (request) => {
    const filter: Record<string, unknown> = {}; if (request.query.status) filter.verification_status = request.query.status.toUpperCase(); if (request.query.datasetGroupId) filter.dataset_group_id = request.query.datasetGroupId; if (request.query.conversationId) filter.conversation_id = request.query.conversationId;
    return repository.listLabels(filter, Math.min(500, Math.max(1, Number(request.query.limit ?? 100))));
  });
  app.post<{ Params: { id: string }; Body: VerifyLabelBody }>("/api/v1/classification/labels/:id/verify", { schema: { params: ClassificationParamsSchema, body: VerifyLabelBodySchema } }, async (request, reply) => {
    const label = await repository.verifyLabel(request.params.id, request.body.action as ActionCode, request.body.reviewer); return label ?? reply.code(404).send({ error: "Classification label not found" });
  });
  app.get("/api/v1/classification/status", async () => {
    const labels = await repository.verifiedLabels(); const readiness = trainingReadiness(labels as any[], config.classification.minPerClass, config.classification.minTotal);
    const model = readiness.ready ? await repository.readyModel(readiness.dataset_version) : null;
    return { enabled: config.tabpfn.enabled, feature_version: ACTION_FEATURE_VERSION, training: { ready: readiness.ready, reasons: readiness.reasons, class_counts: readiness.counts, represented_classes: readiness.represented_classes, eligible_total: readiness.eligible_labels.length }, model: model ? { status: model.status, provider_model_id: model.provider_model_id, fitted_train_set_id: model.fitted_train_set_id, training_dataset_version: model.training_dataset_version } : null };
  });
  app.post<{ Params: { groupId: string }; Body: DatasetClassifyBody }>("/api/v1/datasets/:groupId/classify", { schema: { params: DatasetParamsSchema, body: DatasetClassifyBodySchema } }, async (request, reply) => {
    const conversations = (await repository.datasetConversations(request.params.groupId)).slice(0, request.body.limit ?? Number.MAX_SAFE_INTEGER); let queuedCount = 0; let duplicateCount = 0;
    for (const conversation of conversations) { const queued = await repository.queue(request.params.groupId, String(conversation.conversation_id), request.body.force === true); if (queued.duplicate) duplicateCount += 1; else { await publishClassificationRequested(producer, queued.event); queuedCount += 1; } }
    return reply.code(202).send({ status: "queued", dataset_group_id: request.params.groupId, queued: queuedCount, duplicates: duplicateCount, total: conversations.length });
  });
}

const TypeOptionalGroup = { type: "object", properties: { datasetGroupId: { type: "string" } }, additionalProperties: false } as const;
