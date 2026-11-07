export type EvaluationStatus = "queued" | "processing" | "waiting" | "completed" | "failed";
export interface CriterionEvaluation {
  evaluation_run_id: string; criterion_id: string; external_code: string; criterion_name: string; display_order: number;
  raw_value: boolean | number | null; weight: number; weighted_contribution: number | null; is_na: boolean;
  na_rationale: string | null; explanation: string | null; evidence_message_ids: string[]; evidence_turns: number[];
  confidence: number | null; model_id: string; prompt_version: string; latency_ms: number | null;
  processing_state: "processing" | "retry_scheduled" | "completed" | "error"; error: string | null; error_category: string | null;
}
export interface EvaluationRun {
  run_id: string; conversation_id: string; dataset_group_id: string; checklist_id: string; checklist_version_id: string;
  model_id: string; status: EvaluationStatus; total_criteria: number; completed_criteria: number; requested_at: string;
  started_at: string | null; completed_at: string | null; error: string | null; error_category: string | null; final_score: number | null;
  critical_flag: boolean | null; criteria: CriterionEvaluation[];
}
export interface StartEvaluationResponse { evaluation_run_id: string; status: EvaluationStatus; duplicate: boolean }
