import { apiGet, apiPost } from "./client";

export interface AnalysisStage {
  key: "evaluation" | "followup" | "sentiment" | "metadata";
  label: string;
  status: "waiting" | "queued" | "processing" | "completed" | "partial" | "failed";
  reference_id?: string | null;
  error?: string | null;
}
export interface AnalysisJob {
  job_id: string;
  status: "queued" | "processing" | "completed" | "completed_with_errors";
  completed_stages: number;
  total_stages: number;
  requested_at: string;
  updated_at: string;
  stages: AnalysisStage[];
}
const path = (id: string, dataset: string) => `/v1/conversations/${encodeURIComponent(id)}/analyses?datasetGroupId=${encodeURIComponent(dataset)}`;
export const analysisKeys = { detail: (id: string, dataset: string) => ["analyses", dataset, id] as const };
export const getAnalyses = (id: string, dataset: string, signal?: AbortSignal) => apiGet<AnalysisJob | null>(path(id, dataset), signal);
export const runAnalyses = (id: string, dataset: string, retryFailed = false) => apiPost<AnalysisJob>(path(id, dataset), { retry_failed: retryFailed });
