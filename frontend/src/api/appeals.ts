import { apiGet, apiPost } from "./client";
import type { Appeal, AppealStatus } from "../shared/types/appeal";
export const appealKeys = { conversation: (id: string) => ["appeals", "conversation", id] as const, queue: ["appeals", "queue"] as const };
export const submitAppeal = (conversationId: string, body: { evaluation_run_id: string; criterion_id: string; comment: string }) => apiPost<Appeal>(`/v1/conversations/${encodeURIComponent(conversationId)}/appeals`, body);
export const getConversationAppeals = (conversationId: string, signal?: AbortSignal) => apiGet<Appeal[]>(`/v1/conversations/${encodeURIComponent(conversationId)}/appeals`, signal);
export const listAppeals = (status = "", signal?: AbortSignal) => apiGet<Appeal[]>(`/v1/appeals${status ? `?status=${encodeURIComponent(status)}` : ""}`, signal);
export const decideAppeal = (id: string, body: { status: Exclude<AppealStatus, "OPEN">; reviewer: string; justification: string; override_value?: boolean | number | null }) => apiPost<Appeal>(`/v1/appeals/${encodeURIComponent(id)}/decision`, body);
