import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { Db } from "mongodb";
import type { Producer } from "kafkajs";
import type { AppConfig } from "../../../../config/config.js";
import { AnalysisCoordinator, AnalysisRequestError } from "../../application/analysis-coordinator.js";

export async function registerAnalysisRoutes(app: FastifyInstance, db: Db, producer: Producer, config: AppConfig) {
  const coordinator = new AnalysisCoordinator(db, producer, config);
  await coordinator.jobs.ensureIndexes();
  const params = Type.Object({ id: Type.String({ minLength: 1 }) });
  const querystring = Type.Object({ datasetGroupId: Type.Optional(Type.String({ minLength: 1 })) }, { additionalProperties: false });
  app.get<{ Params: { id: string }; Querystring: { datasetGroupId?: string } }>("/api/v1/conversations/:id/analyses", {
    schema: { params, querystring }
  }, async (request, reply) => {
    try { return await coordinator.latest(request.params.id, request.query.datasetGroupId); }
    catch (error) {
      if (error instanceof AnalysisRequestError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
  });
  app.post<{ Params: { id: string }; Querystring: { datasetGroupId?: string }; Body: { retry_failed?: boolean; checklist_version_id?: string } }>("/api/v1/conversations/:id/analyses", {
    schema: { params, querystring, body: Type.Object({ retry_failed: Type.Optional(Type.Boolean()), checklist_version_id: Type.Optional(Type.String({ minLength: 1 })) }, { additionalProperties: false }) }
  }, async (request, reply) => {
    try { return reply.code(202).send(await coordinator.start(request.params.id, request.query.datasetGroupId, request.body.retry_failed, request.body.checklist_version_id)); }
    catch (error) {
      if (error instanceof AnalysisRequestError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
  });
}
