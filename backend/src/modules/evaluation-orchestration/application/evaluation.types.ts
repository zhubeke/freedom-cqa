import type { LlmUsage } from "../../llm-gateway/application/llm-gateway.js";

export type EvaluationStatus = "queued" | "processing" | "waiting" | "completed" | "failed";
export interface EvaluationRunDocument {
  _id: string; run_id: string; conversation_id: string; dataset_group_id: string; checklist_id: string; checklist_version_id: string;
  model_id: string; status: EvaluationStatus; total_criteria: number; completed_criteria: number; requested_at: Date;
  started_at: Date | null; completed_at: Date | null; error: string | null; final_score: number | null; critical_flag: boolean | null;
  error_category: string | null;
  event_id: string; correlation_id: string; publication_status: "pending" | "published"; publication_attempts: number;
  criteria_dispatched: boolean; active_key?: string;
  prompt_version?: string; input_fingerprint?: string; batch_id?: string;
  completion_publication_status?: "pending" | "published";
  next_retry_at?: Date | null;
  checklist_snapshot?: { sections: unknown[]; criteria: unknown[] };
  finalized_score?: number | null; finalized_critical_flag?: boolean | null; finalized_at?: Date | null;
}
export interface CriterionEvaluationDocument {
  _id: string; evaluation_run_id: string; criterion_id: string; external_code: string; criterion_name: string; display_order: number;
  raw_value: boolean | number | null; weight: number; weighted_contribution: number | null; is_na: boolean; na_rationale: string | null;
  explanation: string | null; evidence_message_ids: string[]; evidence_turns: number[]; confidence: number | null;
  model_id: string; prompt_version: string; latency_ms: number | null; token_usage: LlmUsage | null;
  processing_state: "processing" | "retry_scheduled" | "completed" | "error"; error: string | null; error_category: string | null; created_at: Date; completed_at: Date | null;
  retry_count?: number; next_retry_at?: Date | null;
}
