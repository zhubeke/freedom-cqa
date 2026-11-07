import type { FastifyInstance } from "fastify";
import type { Db } from "mongodb";
import type { Producer } from "kafkajs";
import type { AppConfig } from "../../../../config/config.js";
import { EvaluationRepository } from "../../../criterion-evaluation/adapters/persistence/evaluation-repository.js";
import { buildOrganizerResults, ResultsExportError, writeOrganizerResultsAtomically } from "../../../results-export/application/export-results.js";
import { createBatch, BatchRequestError } from "../../application/create-batch.js";
import { publishPendingBatches } from "../../application/publish-pending-batches.js";
import { resumeBatch } from "../../application/resume-batch.js";
import { CreateBatchBodySchema, BatchParamsSchema, type CreateBatchBody } from "../../schemas/batch.schemas.js";
import { BatchRepository } from "../persistence/batch-repository.js";

export async function registerBatchRoutes(app: FastifyInstance, db: Db, producer: Producer, config: AppConfig) {
  const repository = new BatchRepository(db);
  const evaluations = new EvaluationRepository(db);
  await repository.ensureIndexes();

  app.post<{ Body: CreateBatchBody }>("/api/v1/batches", { schema: { body: CreateBatchBodySchema } }, async (request, reply) => {
    try {
      const result = await createBatch(db, repository, config, request.body.dataset_group_id, request.body.checklist_version_id, request.body.max_conversations);
      if (!result.duplicate) {
        try { await publishPendingBatches(repository, producer, result.batch.batch_id); }
        catch (error) { request.log.warn({ batchId: result.batch.batch_id, error }, "Batch publication deferred to recovery"); }
      }
      return reply.code(result.duplicate ? 200 : 202).send({ ...repository.toPublic(result.batch), duplicate: result.duplicate, estimated_criterion_requests: result.batch.total * 8 });
    } catch (error) {
      if (error instanceof BatchRequestError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
  });

  app.get("/api/v1/batches", async () => repository.list());
  app.get<{ Params: { id: string } }>("/api/v1/batches/:id", { schema: { params: BatchParamsSchema } }, async (request, reply) => {
    const batch = await repository.publicBatch(request.params.id);
    return batch ?? reply.code(404).send({ error: "Batch not found" });
  });
  app.post<{ Params: { id: string } }>("/api/v1/batches/:id/resume", { schema: { params: BatchParamsSchema } }, async (request, reply) => {
    try {
      const batch = await resumeBatch(repository, request.params.id);
      try { await publishPendingBatches(repository, producer, batch.batch_id); }
      catch (error) { request.log.warn({ batchId: batch.batch_id, error }, "Batch resume publication deferred to recovery"); }
      return reply.code(202).send(repository.toPublic(batch));
    } catch (error) {
      if (error instanceof BatchRequestError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
  });
  app.get<{ Params: { id: string } }>("/api/v1/batches/:id/results", { schema: { params: BatchParamsSchema } }, async (request, reply) => {
    const batch = await repository.find(request.params.id);
    if (!batch) return reply.code(404).send({ error: "Batch not found" });
    return Promise.all(batch.conversation_results.map(async (item) => ({ ...item, evaluation: item.evaluation_run_id ? await evaluations.findFullRun(item.evaluation_run_id) : null })));
  });
  app.get<{ Params: { id: string } }>("/api/v1/batches/:id/export", { schema: { params: BatchParamsSchema } }, async (request, reply) => {
    const batch = await repository.find(request.params.id);
    if (!batch) return reply.code(404).send({ error: "Batch not found" });
    try {
      const { document } = await buildOrganizerResults(db, config, batch);
      await writeOrganizerResultsAtomically(document, batch.dataset_group_id);
      return reply.header("content-type", "application/json; charset=utf-8").header("content-disposition", 'attachment; filename="results.json"').send(JSON.stringify(document, null, 2));
    } catch (error) {
      if (error instanceof ResultsExportError) return reply.code(error.statusCode).send({ error: error.message, details: error.details });
      throw error;
    }
  });

  app.get("/api/v1/batches/options", async () => {
    const datasets = await db.collection("conversations").aggregate<{ dataset_group_id: string; conversation_count: number }>([
      { $group: { _id: "$dataset_group_id", conversation_count: { $sum: 1 } } },
      { $project: { _id: 0, dataset_group_id: "$_id", conversation_count: 1 } },
      { $sort: { dataset_group_id: 1 } }
    ]).toArray();
    return { datasets };
  });
}
