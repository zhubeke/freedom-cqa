import { apiGet, apiPost } from "./client";
import type { ActionCode, ActionResult, ClassificationLabel, ClassificationStatus } from "../shared/types/action";
export const actionKeys = { detail: (id: string, groupId?: string) => groupId ? ["recommended-action", id, groupId] as const : ["recommended-action", id] as const, label: (id: string, groupId?: string) => groupId ? ["classification-label", id, groupId] as const : ["classification-label", id] as const, status: ["classification-status"] as const };
export const getAction = (id: string, signal?: AbortSignal, groupId?: string) => apiGet<ActionResult>(`/v1/conversations/${encodeURIComponent(id)}/action${groupId ? `?datasetGroupId=${encodeURIComponent(groupId)}` : ''}`, signal);
export const classify = (id: string, force = false, groupId?: string) => apiPost<{ result_id: string; status: string }>(`/v1/conversations/${encodeURIComponent(id)}/classify?force=${force}${groupId ? `&datasetGroupId=${encodeURIComponent(groupId)}` : ''}`, {});
export const getLabels = (id: string, signal?: AbortSignal, groupId?: string) => apiGet<ClassificationLabel[]>(`/v1/classification/labels?conversationId=${encodeURIComponent(id)}&limit=1${groupId ? `&datasetGroupId=${encodeURIComponent(groupId)}` : ''}`, signal);
export const getClassificationStatus = (signal?: AbortSignal) => apiGet<ClassificationStatus>("/v1/classification/status", signal);
export const verifyLabel = (id: string, action: ActionCode, reviewer: string) => apiPost<ClassificationLabel>(`/v1/classification/labels/${encodeURIComponent(id)}/verify`, { action, reviewer });
