import type { FastifyInstance } from "fastify";
import type { Db } from "mongodb";
import { listConversations, type ConversationListQuery } from "../../application/list-conversations.js";
import { getConversation } from "../../application/get-conversation.js";
import { ConversationQueryRepository } from "../persistence/conversation-query-repository.js";

type ListQuery = ConversationListQuery;

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
  app.post<{ Body: { action: "archive" | "unarchive" | "delete" | "restore"; conversations?: Array<{ dataset_group_id?: string; conversation_id: string }>; matching?: ListQuery } }>("/api/v1/conversations/lifecycle", async (request, reply) => {
    const { action, matching } = request.body ?? {};
    let conversations = request.body?.conversations;
    if (matching && !conversations?.length) {
      conversations = [];
      let page = 1;
      while (true) {
        const result = await listConversations(repository, { ...matching, page: String(page), pageSize: "100" });
        conversations.push(...result.items.map((item) => {
          const record = item as unknown as { dataset_group_id: unknown; conversation_id: unknown };
          return { dataset_group_id: String(record.dataset_group_id), conversation_id: String(record.conversation_id) };
        }));
        if (page >= result.pagination.totalPages) break;
        page += 1;
      }
    }
    if (!["archive", "unarchive", "delete", "restore"].includes(action) || !Array.isArray(conversations) || conversations.length === 0 || conversations.length > 5000) {
      return reply.code(400).send({ error: "A valid action and selection of 1-5000 conversations are required" });
    }
    return repository.mutateLifecycle(conversations, action);
  });
}
