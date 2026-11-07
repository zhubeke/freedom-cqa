import { apiGet, apiPost } from "./client";
import type { ActionCode, ActionResult, ClassificationLabel } from "../shared/types/action";
export const actionKeys = { detail: (id: string) => ["recommended-action", id] as const, label: (id: string) => ["classification-label", id] as const };
export const getAction = (id: string, signal?: AbortSignal) => apiGet<ActionResult>(`/v1/conversations/${encodeURIComponent(id)}/action`, signal);
export const classify = (id: string, force = false) => apiPost<{ result_id: string; status: string }>(`/v1/conversations/${encodeURIComponent(id)}/classify?force=${force}`, {});
export const getLabels = (id: string, signal?: AbortSignal) => apiGet<ClassificationLabel[]>(`/v1/classification/labels?conversationId=${encodeURIComponent(id)}&limit=1`, signal);
export const verifyLabel = (id: string, action: ActionCode, reviewer: string) => apiPost<ClassificationLabel>(`/v1/classification/labels/${encodeURIComponent(id)}/verify`, { action, reviewer });
