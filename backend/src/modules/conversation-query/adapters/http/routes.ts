import type { FastifyInstance } from "fastify";
import type { Db } from "mongodb";
import { listConversations } from "../../application/list-conversations.js";
import { getConversation } from "../../application/get-conversation.js";
import { ConversationQueryRepository } from "../persistence/conversation-query-repository.js";

interface ListQuery { page?: string; pageSize?: string; search?: string; language?: string; channel?: string; datasetGroupId?: string }

export async function registerConversationQueryRoutes(app: FastifyInstance, db: Db): Promise<void> {
  const repository = new ConversationQueryRepository(db);
  app.get<{ Querystring: ListQuery }>("/api/v1/conversations", async (request, reply) => {
    try { return await listConversations(repository, request.query); }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Invalid query" }); }
  });
  app.get<{ Params: { id: string }; Querystring: { datasetGroupId?: string } }>("/api/v1/conversations/:id", async (request, reply) => {
    const item = await getConversation(repository, request.params.id, request.query.datasetGroupId);
    return item ?? reply.code(404).send({ error: "Conversation not found" });
  });
}
