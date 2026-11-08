import assert from "node:assert/strict";
import test from "node:test";
import type { ConversationQueryRepository } from "../adapters/persistence/conversation-query-repository.js";
import { ConversationQueryRepository as MongoConversationQueryRepository } from "../adapters/persistence/conversation-query-repository.js";
import { compareConversationRows } from "../adapters/persistence/conversation-query-repository.js";
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

test("sort keys and direction are validated and forwarded without changing default queries", async () => {
  let received: Record<string, unknown> | undefined;
  const repository = { list: async (options: Record<string, unknown>) => { received = options; return { items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }; } } as unknown as ConversationQueryRepository;
  for (const sortBy of ["conversation_id", "channel", "duration", "language", "score", "status", "action"]) {
    await listConversations(repository, { sortBy, sortDirection: "desc" });
    assert.equal(received?.sortBy, sortBy);
    assert.equal(received?.sortDirection, "desc");
  }
  assert.throws(() => listConversations(repository, { sortBy: "audio_url" }), /sortBy/);
  assert.throws(() => listConversations(repository, { sortDirection: "sideways" }), /sortDirection/);
});

test("unknown joined values remain last in both sort directions with deterministic identity ties", () => {
  const rows = [{ conversation_id: "c2", dataset_group_id: "A", quality_score: null },
    { conversation_id: "c1", dataset_group_id: "B", quality_score: 80 },
    { conversation_id: "c1", dataset_group_id: "A", quality_score: 80 }];
  for (const direction of ["asc", "desc"] as const) {
    assert.deepEqual([...rows].sort((a, b) => compareConversationRows(a, b, "score", direction)).map(row => `${row.dataset_group_id}/${row.conversation_id}`), ["A/c1", "B/c1", "A/c2"]);
  }
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
  assert.deepEqual(conversationFilter, { archived_at: null, deleted_at: null, conversation_id: { $regex: "case", $options: "i" }, $and: [{ conversation_id: { $in: [] } }] });
  assert.deepEqual(result.pagination, { page: 1, pageSize: 20, total: 0, totalPages: 0 });
});

type Row = Record<string, any>;
function queryFixture() {
  const conversations: Row[] = ["c1", "c2", "c3"].map(conversation_id => ({ conversation_id, dataset_group_id: "A", archived_at: null, deleted_at: null, normalized_language: "en", normalized_channel: "chat" }));
  conversations.push({ conversation_id: "c1", dataset_group_id: "B", archived_at: null, deleted_at: null });
  const runs: Row[] = [
    { conversation_id: "c1", dataset_group_id: "A", status: "completed", final_score: 99, critical_flag: false, requested_at: 5, completed_at: 5 },
    { conversation_id: "c1", dataset_group_id: "A", status: "completed", final_score: 70, finalized_score: 40, finalized_critical_flag: true, finalized_at: 4, requested_at: 1, completed_at: 1 },
    { conversation_id: "c1", dataset_group_id: "A", status: "processing", requested_at: 6 },
    { conversation_id: "c2", dataset_group_id: "A", status: "completed", final_score: 80, critical_flag: false, requested_at: 3, completed_at: 3 },
    { conversation_id: "c1", dataset_group_id: "B", status: "completed", final_score: 100, critical_flag: false, requested_at: 3, completed_at: 3 }
  ];
  const classifications: Row[] = [
    { conversation_id: "c1", dataset_group_id: "A", status: "completed", final_action: "CUSTOMER_CALLBACK", classification_source: "rules", created_at: 1 },
    { conversation_id: "c1", dataset_group_id: "A", status: "queued", created_at: 6 },
    { conversation_id: "c2", dataset_group_id: "A", status: "completed", final_action: "NO_ACTION", classification_source: "tabpfn", created_at: 3 },
    { conversation_id: "c1", dataset_group_id: "B", status: "completed", final_action: "COMPLIANCE_REVIEW", created_at: 3 }
  ];
  const matches = (row: Row, filter: Row): boolean => Object.entries(filter).every(([field, value]) => {
    if (field === "$or") return value.some((candidate: Row) => matches(row, candidate));
    if (field === "$and") return value.every((candidate: Row) => matches(row, candidate));
    if (value && typeof value === "object" && "$in" in value) return value.$in.includes(row[field]);
    if (value && typeof value === "object" && "$regex" in value) return new RegExp(value.$regex, value.$options).test(row[field]);
    return row[field] === value;
  });
  function sorted(rows: Row[], sort: Row) {
    return [...rows].sort((a, b) => {
      for (const [field, direction] of Object.entries(sort)) {
        if (a[field] == null && b[field] != null) return -Number(direction);
        if (a[field] != null && b[field] == null) return Number(direction);
        if (a[field] > b[field]) return Number(direction);
        if (a[field] < b[field]) return -Number(direction);
      }
      return 0;
    });
  }
  const db = { collection: (name: string) => {
    const rows = name === "conversations" ? conversations : name === "evaluation_runs" ? runs : classifications;
    return {
      countDocuments: async (filter: Row) => rows.filter(row => matches(row, filter)).length,
      find: (filter: Row) => {
        let items = rows.filter(row => matches(row, filter));
        const cursor = { sort: (sort: Row) => { items = sorted(items, sort); return cursor; },
          skip: (count: number) => { items = items.slice(count); return cursor; },
          limit: (count: number) => { items = items.slice(0, count); return cursor; }, toArray: async () => items };
        return cursor;
      },
      aggregate: (pipeline: Row[]) => ({ toArray: async () => {
        let items = [...rows];
        for (const stage of pipeline) {
          if (stage.$match) items = items.filter(row => matches(row, stage.$match));
          if (stage.$sort) items = sorted(items, stage.$sort);
          if (stage.$group) {
            const groups = new Map<string, Row>();
            for (const item of items) {
              const identity = { dataset_group_id: item.dataset_group_id, conversation_id: item.conversation_id };
              const key = JSON.stringify(identity);
              if (!groups.has(key)) groups.set(key, stage.$group.action ? { _id: identity, action: item.final_action } : { _id: identity, item });
            }
            items = [...groups.values()];
          }
        }
        return items;
      } })
    };
  } };
  return new MongoConversationQueryRepository(db as never);
}

test("globally sorts joined scores before pagination and retains reviewed score while rerun is processing", async () => {
  const repository = queryFixture();
  const first = await repository.list({ page: 1, pageSize: 1, datasetGroupId: "A", sortBy: "score", sortDirection: "desc" });
  const second = await repository.list({ page: 2, pageSize: 1, datasetGroupId: "A", sortBy: "score", sortDirection: "desc" });
  assert.equal(first.items[0]!.conversation_id, "c2");
  assert.equal(second.items[0]!.conversation_id, "c1");
  assert.equal(second.items[0]!.quality_score, 40);
  assert.equal(second.items[0]!.evaluation_status, "processing");
  assert.equal(second.items[0]!.score_reviewed, true);
  assert.equal(second.items[0]!.critical_flag, true);
  assert.equal(second.items[0]!.recommended_action, "CUSTOMER_CALLBACK");
  assert.equal(second.items[0]!.classification_status, "queued");
  assert.equal(second.pagination.total, 3);
});

test("joins evaluation and action by dataset identity and preserves action filters during queued reclassification", async () => {
  const repository = queryFixture();
  const acrossDatasets = await repository.list({ page: 1, pageSize: 10, sortBy: "score", sortDirection: "desc" });
  assert.equal(acrossDatasets.items[0]!.dataset_group_id, "B");
  assert.equal(acrossDatasets.items[0]!.quality_score, 100);
  const callback = await repository.list({ page: 1, pageSize: 10, datasetGroupId: "A", action: "CUSTOMER_CALLBACK" });
  assert.equal(callback.items.length, 1);
  assert.equal(callback.items[0]!.quality_score, 40);
  assert.equal(callback.items[0]!.recommended_action, "CUSTOMER_CALLBACK");
});

test("status and action sorting operate before pagination and pending data stays explicit", async () => {
  const repository = queryFixture();
  const status = await repository.list({ page: 2, pageSize: 1, datasetGroupId: "A", sortBy: "status", sortDirection: "asc" });
  assert.equal(status.items[0]!.conversation_id, "c3");
  assert.equal(status.items[0]!.evaluation_status, "pending");
  assert.equal(status.items[0]!.quality_score, null);
  const action = await repository.list({ page: 1, pageSize: 1, datasetGroupId: "A", sortBy: "action", sortDirection: "desc" });
  assert.equal(action.items[0]!.conversation_id, "c2");
});
