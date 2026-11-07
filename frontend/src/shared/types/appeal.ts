export type AppealStatus = "OPEN" | "UNDER_REVIEW" | "CONFIRMED" | "OVERRIDDEN";
export interface Appeal {
  appeal_id: string; evaluation_run_id: string; conversation_id: string; dataset_group_id: string; criterion_id: string; criterion_name: string;
  status: AppealStatus; comment: string; created_at: string; updated_at: string;
  original_evaluation: { raw_value: boolean | number | null; explanation: string | null; evidence_message_ids: string[]; evidence_turns: number[]; weighted_contribution: number | null; answer_type: "boolean" | "numeric" | "flag"; allowed_values: number[]; na_enabled: boolean };
  decision: null | { reviewer: string; justification: string; decided_at: string; effective_value: boolean | number | null };
}
