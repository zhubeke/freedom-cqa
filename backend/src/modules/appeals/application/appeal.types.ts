export const APPEAL_STATES = ["OPEN", "UNDER_REVIEW", "CONFIRMED", "OVERRIDDEN"] as const;
export type AppealState = typeof APPEAL_STATES[number];
export type DecisionOutcome = "UPHELD" | "SCORE_CHANGED" | "REASONING_CHANGED";

export interface AppealDocument {
  _id: string;
  appeal_id: string;
  evaluation_run_id: string;
  conversation_id: string;
  dataset_group_id: string;
  criterion_id: string;
  criterion_name: string;
  status: AppealState;
  comment: string;
  original_evaluation: {
    raw_value: boolean | number | null;
    explanation: string | null;
    evidence_message_ids: string[];
    evidence_turns: number[];
    weighted_contribution: number | null;
    answer_type: "boolean" | "numeric" | "flag";
    allowed_values: number[];
    na_enabled: boolean;
    criterion_weight?: number;
    scale_maximum?: number;
    numeric_scale?: Array<{ value: number; description: string }>;
  };
  decision: null | {
    reviewer: string;
    justification: string;
    decided_at: Date;
    effective_value: boolean | number | null;
    outcome?: DecisionOutcome;
    effective_explanation?: string | null;
    effective_evidence_message_ids?: string[];
  };
  created_at: Date;
  updated_at: Date;
}
