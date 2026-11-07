import type { FastifyInstance, FastifyReply } from "fastify";
import type { Db } from "mongodb";
import { activateChecklistVersion } from "../../application/activate-checklist-version.js";
import { createChecklist } from "../../application/create-checklist.js";
import { createChecklistVersion } from "../../application/create-checklist-version.js";
import { getChecklist, getChecklistVersion } from "../../application/get-checklist.js";
import { listChecklistVersions } from "../../application/list-checklist-versions.js";
import { listChecklists } from "../../application/list-checklists.js";
import { updateChecklist } from "../../application/update-checklist.js";
import { deleteChecklist } from "../../application/delete-checklist.js";
import { ChecklistError } from "../../domain/checklist.types.js";
import { MongoChecklistRepository } from "../persistence/checklist-repository.js";
import {
  ActivateVersionBodySchema, CreateChecklistBodySchema, CreateVersionBodySchema, IdParamsSchema, UpdateChecklistBodySchema, VersionParamsSchema,
  type ActivateVersionBody, type CreateChecklistBody, type CreateVersionBody, type UpdateChecklistBody
} from "../../schemas/checklist.schemas.js";

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof ChecklistError) return reply.code(error.statusCode).send({ error: error.message, code: error.code });
  throw error;
}

export async function registerChecklistManagementRoutes(app: FastifyInstance, db: Db): Promise<void> {
  const repository = new MongoChecklistRepository(db);

  app.get("/api/v1/checklists", async () => listChecklists(repository));

  app.post<{ Body: CreateChecklistBody }>("/api/v1/checklists", { schema: { body: CreateChecklistBodySchema } }, async (request, reply) => {
    try {
      const { name, description, sections, criteria } = request.body;
      return reply.code(201).send(await createChecklist(repository, { name, description, configuration: { sections, criteria } }));
    } catch (error) { return sendError(reply, error); }
  });

  app.get<{ Params: { id: string } }>("/api/v1/checklists/:id", { schema: { params: IdParamsSchema } }, async (request, reply) => {
    try { return await getChecklist(repository, request.params.id); }
    catch (error) { return sendError(reply, error); }
  });

  app.put<{ Params: { id: string }; Body: UpdateChecklistBody }>("/api/v1/checklists/:id", { schema: { params: IdParamsSchema, body: UpdateChecklistBodySchema } }, async (request, reply) => {
    try {
      const { name, description, expected_active_version_id, sections, criteria } = request.body;
      return await updateChecklist(repository, {
        checklistId: request.params.id, expectedActiveVersionId: expected_active_version_id,
        name, description, configuration: { sections, criteria }
      });
    } catch (error) { return sendError(reply, error); }
  });

  app.delete<{ Params: { id: string } }>("/api/v1/checklists/:id", { schema: { params: IdParamsSchema } }, async (request, reply) => {
    try { await deleteChecklist(repository, request.params.id); return reply.code(204).send(); }
    catch (error) { return sendError(reply, error); }
  });

  app.get<{ Params: { id: string } }>("/api/v1/checklists/:id/versions", { schema: { params: IdParamsSchema } }, async (request, reply) => {
    try { return await listChecklistVersions(repository, request.params.id); }
    catch (error) { return sendError(reply, error); }
  });

  app.get<{ Params: { id: string; versionId: string } }>("/api/v1/checklists/:id/versions/:versionId", { schema: { params: VersionParamsSchema } }, async (request, reply) => {
    try { return await getChecklistVersion(repository, request.params.id, request.params.versionId); }
    catch (error) { return sendError(reply, error); }
  });

  app.post<{ Params: { id: string }; Body: CreateVersionBody }>("/api/v1/checklists/:id/versions", { schema: { params: IdParamsSchema, body: CreateVersionBodySchema } }, async (request, reply) => {
    try {
      const { name, description, created_from_version_id, sections, criteria } = request.body;
      const version = await createChecklistVersion(repository, {
        checklistId: request.params.id, createdFromVersionId: created_from_version_id, name, description,
        configuration: { sections, criteria }
      });
      return reply.code(201).send(version);
    } catch (error) { return sendError(reply, error); }
  });

  app.post<{ Params: { id: string }; Body: ActivateVersionBody }>("/api/v1/checklists/:id/activate", { schema: { params: IdParamsSchema, body: ActivateVersionBodySchema } }, async (request, reply) => {
    try {
      return await activateChecklistVersion(repository, {
        checklistId: request.params.id, versionId: request.body.version_id,
        expectedActiveVersionId: request.body.expected_active_version_id
      });
    } catch (error) { return sendError(reply, error); }
  });
}
