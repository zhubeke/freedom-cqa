import { apiGet, apiPost } from "./client";
import type { ConversationListResponse } from "../shared/types/conversation";

export type LifecycleAction = "archive" | "unarchive" | "delete" | "restore";
export interface ConversationIdentity { dataset_group_id?: string; conversation_id: string }
export interface LifecycleResult { requested: number; succeeded: number; failed: Array<ConversationIdentity & { error: string }> }
export interface ConversationSelection { conversations?: ConversationIdentity[]; matching?: Record<string, string> }
export const conversationKey = (item: ConversationIdentity) => JSON.stringify([item.dataset_group_id ?? "", item.conversation_id]);

export async function resolveConversationSelection(selection: ConversationSelection): Promise<ConversationIdentity[]> {
  if (selection.conversations) return [...new Map(selection.conversations.map((item) => [conversationKey(item), item])).values()];
  if (!selection.matching) throw new Error("Choose conversations first.");
  const items = new Map<string, ConversationIdentity>();
  let page = 1;
  while (true) {
    const query = new URLSearchParams({ ...selection.matching, page: String(page), pageSize: "100" });
    const result = await apiGet<ConversationListResponse>(`/v1/conversations?${query}`);
    if (result.pagination.total > 5000) throw new Error("Select at most 5,000 conversations per operation.");
    for (const item of result.items) { const identity = { dataset_group_id: item.dataset_group_id, conversation_id: item.conversation_id }; items.set(conversationKey(identity), identity); }
    if (page >= result.pagination.totalPages) break;
    page += 1;
  }
  return [...items.values()];
}

export function mutateConversationLifecycle(payload: {
  action: LifecycleAction;
  conversations?: ConversationIdentity[];
  matching?: Record<string, string>;
}): Promise<LifecycleResult> {
  return apiPost("/v1/conversations/lifecycle", payload);
}
