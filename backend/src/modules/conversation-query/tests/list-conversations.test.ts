import assert from "node:assert/strict";
import test from "node:test";
import type { ConversationQueryRepository } from "../adapters/persistence/conversation-query-repository.js";
import { ConversationQueryRepository as MongoConversationQueryRepository } from "../adapters/persistence/conversation-query-repository.js";
import { listConversations } from "../application/list-conversations.js";

const actions = [
  "NO_ACTION", "CUSTOMER_CALLBACK", "ESCALATE_UNRESOLVED_CASE", "COMPLIANCE_REVIEW",
  "OPERATOR_COACHING", "SERVICE_RECOVERY_OFFER", "TECHNICAL_INVESTIGATION", "SUPERVISOR_REVIEW"
] as const;

test("all supported action filters are forwarded with pagination and combined filters", async () => {
  for (const action of actions) {
    let received: Record<string, unknown> | undefined;
    const repository = { list: async (options: Record<string, unknown>) => { received = options; return { items: [], pagination: { page: 2, pageSize: 10, total: 0, totalPages: 0 } }; } } as unknown as ConversationQueryRepository;
    await listConversations(repository, { page: "2", pageSize: "10", search: "case", language: "RU", channel: "call", datasetGroupId: "group", action });
    assert.deepEqual(received, { page: 2, pageSize: 10, search: "case", language: "RU", channel: "call", datasetGroupId: "group", action });
  }
});

test("unknown actions are rejected instead of reaching persistence", () => {
  const repository = { list: async () => ({ items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }) } as unknown as ConversationQueryRepository;
  assert.throws(() => listConversations(repository, { action: "NOT_REAL" }), /action is invalid/);
});

test("an action with no matches produces a valid empty MongoDB filter", async () => {
  let conversationFilter: Record<string, unknown> | undefined;
  const db = {
    collection(name: string) {
      if (name === "classification_results") return { aggregate: () => ({ toArray: async () => [] }) };
      if (name === "conversations") return {
        find: (filter: Record<string, unknown>) => {
          conversationFilter = filter;
          return { sort: () => ({ skip: () => ({ limit: () => ({ toArray: async () => [] }) }) }) };
        },
        countDocuments: async () => 0
      };
      throw new Error(`Unexpected collection ${name}`);
    }
  };
  const repository = new MongoConversationQueryRepository(db as never);
  const result = await repository.list({ page: 1, pageSize: 20, action: "NO_ACTION", search: "case" });
  assert.deepEqual(conversationFilter, { conversation_id: { $regex: "case", $options: "i" }, $and: [{ conversation_id: { $in: [] } }] });
  assert.deepEqual(result.pagination, { page: 1, pageSize: 20, total: 0, totalPages: 0 });
});
