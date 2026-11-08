export const BATCH_STATUSES = ["queued", "processing", "completed", "completed_with_errors", "paused", "failed"] as const;
export type BatchStatus = typeof BATCH_STATUSES[number];
export type BatchConversationStatus = "pending" | "queued" | "processing" | "completed" | "failed";

export interface BatchConversationResult {
  conversation_id: string;
  input_fingerprint: string;
  evaluation_run_id: string | null;
  status: BatchConversationStatus;
  reused: boolean;
  error: string | null;
}

export interface EvaluationBatchDocument {
  _id: string;
  batch_id: string;
  dataset_group_id: string;
  checklist_id: string;
  checklist_version_id: string;
  model_id: string;
  prompt_version: string;
  status: BatchStatus;
  total: number;
  completed: number;
  failed: number;
  conversation_results: BatchConversationResult[];
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  last_error: string | null;
  event_id: string;
  correlation_id: string;
  publication_status: "pending" | "published";
  publication_attempts: number;
  completion_publication_status: "pending" | "published" | null;
  active_key?: string;
  max_conversations?: number;
}
