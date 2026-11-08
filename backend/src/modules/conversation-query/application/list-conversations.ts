import type { ConversationQueryRepository } from "../adapters/persistence/conversation-query-repository.js";

export const CONVERSATION_SORT_KEYS = ["conversation_id", "channel", "duration", "language", "score", "status", "action"] as const;
export type ConversationSortKey = typeof CONVERSATION_SORT_KEYS[number];
export interface ConversationListQuery {
  page?: string; pageSize?: string; search?: string; language?: string; channel?: string; datasetGroupId?: string; action?: string; lifecycle?: string;
  sortBy?: string; sortDirection?: string;
}

export function listConversations(repository: ConversationQueryRepository, query: ConversationListQuery) {
  const page = Number(query.page ?? 1);
  const pageSize = Number(query.pageSize ?? 20);
  if (!Number.isInteger(page) || page < 1) throw new Error("page must be a positive integer");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error("pageSize must be between 1 and 100");
  if (query.language && !["ru", "kk", "kz", "en"].includes(query.language.toLowerCase())) throw new Error("language must be RU, KZ/KK, or EN");
  if (query.channel && !["chat", "call"].includes(query.channel)) throw new Error("channel must be chat or call");
  if (query.action && !["NO_ACTION", "CUSTOMER_CALLBACK", "ESCALATE_UNRESOLVED_CASE", "COMPLIANCE_REVIEW", "OPERATOR_COACHING", "SERVICE_RECOVERY_OFFER", "TECHNICAL_INVESTIGATION", "SUPERVISOR_REVIEW"].includes(query.action)) throw new Error("action is invalid");
  if (query.lifecycle && !["active", "archived", "deleted", "all"].includes(query.lifecycle)) throw new Error("lifecycle is invalid");
  if (query.sortBy && !CONVERSATION_SORT_KEYS.includes(query.sortBy as ConversationSortKey)) throw new Error("sortBy is invalid");
  if (query.sortDirection && !["asc", "desc"].includes(query.sortDirection)) throw new Error("sortDirection must be asc or desc");
  return repository.list({
    page, pageSize,
    ...(query.search ? { search: query.search } : {}),
    ...(query.language ? { language: query.language } : {}),
    ...(query.channel ? { channel: query.channel } : {}),
    ...(query.datasetGroupId ? { datasetGroupId: query.datasetGroupId } : {}),
    ...(query.action ? { action: query.action } : {}),
    ...(query.lifecycle ? { lifecycle: query.lifecycle as "active" | "archived" | "deleted" | "all" } : {}),
    ...(query.sortBy ? { sortBy: query.sortBy as ConversationSortKey } : {}),
    ...(query.sortDirection ? { sortDirection: query.sortDirection as "asc" | "desc" } : {})
  });
}
