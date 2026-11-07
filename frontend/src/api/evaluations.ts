import { apiGet, apiPost } from "./client";
import type { EvaluationRun, StartEvaluationResponse } from "../shared/types/evaluation";

export const evaluationKeys = { history: (conversationId: string) => ["evaluations", conversationId] as const };
export const startEvaluation = (conversationId: string, checklistVersionId: string) => apiPost<StartEvaluationResponse>(`/v1/conversations/${encodeURIComponent(conversationId)}/evaluations`, { checklist_version_id: checklistVersionId });
export const getEvaluation = (runId: string, signal?: AbortSignal) => apiGet<EvaluationRun>(`/v1/evaluations/${encodeURIComponent(runId)}`, signal);
export const getEvaluationHistory = (conversationId: string, signal?: AbortSignal) => apiGet<EvaluationRun[]>(`/v1/conversations/${encodeURIComponent(conversationId)}/evaluations`, signal);
export const retryEvaluation = (runId: string) => apiPost<{ evaluation_run_id: string; status: string; queued_criteria: number }>(`/v1/evaluations/${encodeURIComponent(runId)}/retry`, {});
