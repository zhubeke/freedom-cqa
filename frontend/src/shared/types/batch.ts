export type BatchStatus = "queued" | "processing" | "completed" | "completed_with_errors" | "paused" | "failed";
export interface BatchConversationResult {
  conversation_id: string; evaluation_run_id: string | null; status: "pending" | "queued" | "processing" | "completed" | "failed"; reused: boolean; error: string | null;
}
export interface EvaluationBatch {
  batch_id: string; dataset_group_id: string; checklist_id: string; checklist_version_id: string; model_id: string; prompt_version: string;
  status: BatchStatus; total: number; completed: number; failed: number; remaining: number; conversation_results: BatchConversationResult[];
  created_at: string; started_at: string | null; finished_at: string | null; last_error: string | null; max_conversations?: number;
}
export interface BatchOptions { datasets: Array<{ dataset_group_id: string; conversation_count: number }> }
