import { apiDownload, apiGet, apiPost } from "./client";
import type { BatchOptions, EvaluationBatch } from "../shared/types/batch";

export const batchKeys = { all: ["batches"] as const, detail: (id: string) => ["batches", id] as const, options: ["batches", "options"] as const };
export const listBatchOptions = (signal?: AbortSignal) => apiGet<BatchOptions>("/v1/batches/options", signal);
export const startBatch = (body: { dataset_group_id: string; checklist_version_id: string; max_conversations?: 2 | 3 }) => apiPost<EvaluationBatch & { duplicate: boolean; estimated_criterion_requests: number }>("/v1/batches", body);
export const getBatch = (id: string, signal?: AbortSignal) => apiGet<EvaluationBatch>(`/v1/batches/${id}`, signal);
export const resumeBatch = (id: string) => apiPost<EvaluationBatch>(`/v1/batches/${id}/resume`, {});
export const downloadBatch = (id: string) => apiDownload(`/v1/batches/${id}/export`, "results.json");
