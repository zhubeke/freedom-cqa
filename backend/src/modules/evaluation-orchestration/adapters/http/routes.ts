import type { FastifyInstance } from "fastify";
import type { Db } from "mongodb";
import type { Producer } from "kafkajs";
import { EvaluationRepository } from "../../../criterion-evaluation/adapters/persistence/evaluation-repository.js";
import { publishPendingEvaluations } from "../../application/publish-pending-evaluations.js";
import { EvaluationRequestError, startEvaluation } from "../../application/start-evaluation.js";
import { EvaluationParamsSchema, StartEvaluationBodySchema, type StartEvaluationBody } from "../../schemas/evaluation.schemas.js";
import { criterionEvent } from "../../application/events.js";
import { CRITERION_REQUESTED_TOPIC } from "../events/topics.js";
import type { AppConfig } from "../../../../config/config.js";

export async function registerEvaluationRoutes(app: FastifyInstance, db: Db, producer: Producer, config?: AppConfig): Promise<void> {
  const repository = new EvaluationRepository(db);
  await repository.ensureIndexes();
  app.post<{ Params: { id: string }; Body: StartEvaluationBody }>("/api/v1/conversations/:id/evaluations", {
    schema: { params: EvaluationParamsSchema, body: StartEvaluationBodySchema }
  }, async (request, reply) => {
    try {
      const result = await startEvaluation(db, repository, request.params.id, request.body.checklist_version_id, { ...(config ? { modelId: config.llm.model } : {}), ...(request.body.dataset_group_id ? { datasetGroupId: request.body.dataset_group_id } : {}), promptVersion: "criterion-v1" });
      if (!result.duplicate) {
        try { await publishPendingEvaluations(repository, producer, result.run.run_id); }
        catch (error) { request.log.warn({ runId: result.run.run_id, error }, "Evaluation publication deferred to recovery"); }
      }
      return reply.code(202).send({ evaluation_run_id: result.run.run_id, status: result.run.status, duplicate: result.duplicate });
    } catch (error) {
      if (error instanceof EvaluationRequestError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
  });
  app.get<{ Params: { id: string } }>("/api/v1/evaluations/:id", { schema: { params: EvaluationParamsSchema } }, async (request, reply) => {
    const run = await repository.findFullRun(request.params.id);
    return run ?? reply.code(404).send({ error: "Evaluation not found" });
  });
  app.post<{ Params: { id: string } }>("/api/v1/evaluations/:id/retry", { schema: { params: EvaluationParamsSchema } }, async (request, reply) => {
    const run = await repository.findRun(request.params.id);
    if (!run) return reply.code(404).send({ error: "Evaluation not found" });
    if (run.status !== "failed" && run.status !== "waiting") return reply.code(409).send({ error: "Evaluation has no retryable criterion work" });
    const retryable = await repository.criteria().find({ evaluation_run_id: run.run_id, processing_state: { $in: ["error", "retry_scheduled"] } }).toArray();
    if (!retryable.length) return reply.code(409).send({ error: "Evaluation has no retryable criterion work" });
    await repository.runs().updateOne({ run_id: run.run_id }, { $set: { status: "processing", error: null, error_category: null, completed_at: null, next_retry_at: null } });
    for (const criterion of retryable) {
      await repository.criteria().updateOne({ _id: criterion._id }, { $set: { processing_state: "processing", error: null, error_category: null, completed_at: null, next_retry_at: null, retry_count: 0 } });
      const event = criterionEvent(run, criterion.criterion_id);
      await producer.send({ topic: CRITERION_REQUESTED_TOPIC, messages: [{ key: `${run.run_id}:${criterion.criterion_id}`, value: JSON.stringify(event) }] });
    }
    return reply.code(202).send({ evaluation_run_id: run.run_id, status: "processing", queued_criteria: retryable.length });
  });
  app.get<{ Params: { id: string }; Querystring: { datasetGroupId?: string } }>("/api/v1/conversations/:id/evaluations", { schema: { params: EvaluationParamsSchema,
    querystring: { type: "object", properties: { datasetGroupId: { type: "string", minLength: 1 } }, additionalProperties: false }
  } }, async (request) => {
    return (await repository.history(request.params.id, request.query.datasetGroupId)).filter(Boolean);
  });
}
