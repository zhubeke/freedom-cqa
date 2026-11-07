import type { FastifyInstance } from "fastify";
import type { Db } from "mongodb";
import type { Producer } from "kafkajs";
import { EvaluationRepository } from "../../../criterion-evaluation/adapters/persistence/evaluation-repository.js";
import { publishPendingEvaluations } from "../../application/publish-pending-evaluations.js";
import { EvaluationRequestError, startEvaluation } from "../../application/start-evaluation.js";
import { EvaluationParamsSchema, StartEvaluationBodySchema, type StartEvaluationBody } from "../../schemas/evaluation.schemas.js";

export async function registerEvaluationRoutes(app: FastifyInstance, db: Db, producer: Producer): Promise<void> {
  const repository = new EvaluationRepository(db);
  await repository.ensureIndexes();
  app.post<{ Params: { id: string }; Body: StartEvaluationBody }>("/api/v1/conversations/:id/evaluations", {
    schema: { params: EvaluationParamsSchema, body: StartEvaluationBodySchema }
  }, async (request, reply) => {
    try {
      const result = await startEvaluation(db, repository, request.params.id, request.body.checklist_version_id);
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
  app.get<{ Params: { id: string } }>("/api/v1/conversations/:id/evaluations", { schema: { params: EvaluationParamsSchema } }, async (request) => {
    return (await repository.history(request.params.id)).filter(Boolean);
  });
}
