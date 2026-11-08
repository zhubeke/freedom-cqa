import type { FastifyInstance, FastifyReply } from "fastify";
import type { Db } from "mongodb";
import { Type } from "@sinclair/typebox";
import type { AppConfig } from "../../../../config/config.js";
import { buildSelectedOrganizerResults, previewConversationExport, type ExportSelection } from "../../application/conversation-export.js";
import { ResultsExportError } from "../../application/export-errors.js";
import type { OrganizerResults } from "../../application/results.types.js";

const SelectionSchema = Type.Object({
  conversations: Type.Optional(Type.Array(Type.Object({
    conversation_id: Type.String({ minLength: 1 }), dataset_group_id: Type.Optional(Type.String({ minLength: 1 }))
  }, { additionalProperties: false }), { minItems: 1, maxItems: 5000 })),
  matching: Type.Optional(Type.Record(Type.String(), Type.String()))
}, { additionalProperties: false });

function sendDocument(reply: FastifyReply, document: OrganizerResults, filename: string) {
  return reply.header("content-type", "application/json; charset=utf-8")
    .header("content-disposition", `attachment; filename="${filename}"`).send(`${JSON.stringify(document, null, 2)}\n`);
}
function handleError(error: unknown, reply: FastifyReply) {
  if (error instanceof ResultsExportError) return reply.code(error.statusCode).send({ error: error.message, details: error.details });
  throw error;
}

export async function registerResultsExportRoutes(app: FastifyInstance, db: Db, config: AppConfig): Promise<void> {
  app.post<{ Body: ExportSelection }>("/api/v1/results/export/preview", { schema: { body: SelectionSchema } }, async (request, reply) => {
    try { return await previewConversationExport(db, config, request.body); }
    catch (error) { return handleError(error, reply); }
  });
  app.post<{ Body: ExportSelection }>("/api/v1/results/export", { schema: { body: SelectionSchema } }, async (request, reply) => {
    try { return sendDocument(reply, await buildSelectedOrganizerResults(db, config, request.body), "cqa-conversations.json"); }
    catch (error) { return handleError(error, reply); }
  });
  app.get<{ Params: { id: string }; Querystring: { datasetGroupId?: string } }>("/api/v1/conversations/:id/export", async (request, reply) => {
    try {
      const document = await buildSelectedOrganizerResults(db, config, { conversations: [{
        conversation_id: request.params.id, ...(request.query.datasetGroupId ? { dataset_group_id: request.query.datasetGroupId } : {})
      }] });
      const safeId = request.params.id.replace(/[^a-zA-Z0-9._-]/g, "_");
      return sendDocument(reply, document, `cqa-${safeId}.json`);
    } catch (error) { return handleError(error, reply); }
  });
}
