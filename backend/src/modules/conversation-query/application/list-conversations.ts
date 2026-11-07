import type { ConversationQueryRepository } from "../adapters/persistence/conversation-query-repository.js";

export function listConversations(repository: ConversationQueryRepository, query: {
  page?: string; pageSize?: string; search?: string; language?: string; channel?: string; datasetGroupId?: string; action?: string;
}) {
  const page = Number(query.page ?? 1);
  const pageSize = Number(query.pageSize ?? 20);
  if (!Number.isInteger(page) || page < 1) throw new Error("page must be a positive integer");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error("pageSize must be between 1 and 100");
  if (query.language && !["ru", "kk", "kz", "en"].includes(query.language.toLowerCase())) throw new Error("language must be RU, KZ/KK, or EN");
  if (query.channel && !["chat", "call"].includes(query.channel)) throw new Error("channel must be chat or call");
  if (query.action && !["NO_ACTION", "CUSTOMER_CALLBACK", "ESCALATE_UNRESOLVED_CASE", "COMPLIANCE_REVIEW", "OPERATOR_COACHING", "SERVICE_RECOVERY_OFFER", "TECHNICAL_INVESTIGATION", "SUPERVISOR_REVIEW"].includes(query.action)) throw new Error("action is invalid");
  return repository.list({
    page, pageSize,
    ...(query.search ? { search: query.search } : {}),
    ...(query.language ? { language: query.language } : {}),
    ...(query.channel ? { channel: query.channel } : {}),
    ...(query.datasetGroupId ? { datasetGroupId: query.datasetGroupId } : {}),
    ...(query.action ? { action: query.action } : {})
  });
}
