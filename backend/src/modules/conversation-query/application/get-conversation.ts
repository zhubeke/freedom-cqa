import type { ConversationQueryRepository } from "../adapters/persistence/conversation-query-repository.js";

export function getConversation(repository: ConversationQueryRepository, id: string, datasetGroupId?: string) {
  return repository.findById(id, datasetGroupId);
}
