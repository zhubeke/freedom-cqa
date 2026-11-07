export const ACTION_CODES = [
  "NO_ACTION", "CUSTOMER_CALLBACK", "ESCALATE_UNRESOLVED_CASE", "COMPLIANCE_REVIEW",
  "OPERATOR_COACHING", "SERVICE_RECOVERY_OFFER", "TECHNICAL_INVESTIGATION", "SUPERVISOR_REVIEW"
] as const;
export type ActionCode = typeof ACTION_CODES[number];

export const ACTION_FEATURE_VERSION = "action-features.v1";
export const RULE_VERSION = "action-rules.v1";
export const LABEL_POLICY_VERSION = "action-label-policy.v1";

export const ACTION_DEFINITIONS: Array<{ code: ActionCode; label: string }> = [
  { code: "NO_ACTION", label: "No further action" },
  { code: "CUSTOMER_CALLBACK", label: "Call back or follow up with the client" },
  { code: "ESCALATE_UNRESOLVED_CASE", label: "Escalate an unresolved customer request" },
  { code: "COMPLIANCE_REVIEW", label: "Review potential compliance or severe misconduct" },
  { code: "OPERATOR_COACHING", label: "Provide targeted operator training" },
  { code: "SERVICE_RECOVERY_OFFER", label: "Consider an appropriate customer goodwill gesture" },
  { code: "TECHNICAL_INVESTIGATION", label: "Investigate technical or product problems" },
  { code: "SUPERVISOR_REVIEW", label: "Request supervisor assessment" }
];

export type FeatureValue = number | string | boolean | null;
export interface ActionFeatures {
  duration_seconds: number | null; client_turn_count: number | null; operator_turn_count: number | null;
  first_operator_response_seconds: number | null; average_operator_response_seconds: number | null;
  max_operator_response_seconds: number | null; handoff_count: number | null; long_wait_count: number | null;
  quality_score: number | null; greeting_score: number | null; needs_identification_score: number | null;
  identity_verification_score: number | null; consultation_score: number | null; empathy_score: number | null;
  dialogue_management_score: number | null; closing_score: number | null; severe_violation: boolean | null;
  greeting_applicable: boolean | null; needs_identification_applicable: boolean | null;
  identity_verification_applicable: boolean | null; consultation_applicable: boolean | null;
  empathy_applicable: boolean | null; dialogue_management_applicable: boolean | null; closing_applicable: boolean | null;
  primary_intent_category: string | null; unresolved_intent_count: number | null; resolution_status: string | null;
  followup_promised: boolean | null; escalation_required: boolean | null; verification_required: boolean | null;
  verification_completed: boolean | null; client_initial_sentiment: string | null; client_final_sentiment: string | null;
  client_average_sentiment: number | null; client_negative_message_count: number | null;
  sentiment_recovery_detected: boolean | null; silence_ratio: number | null; longest_silence_seconds: number | null;
  audio_loudness_variability: number | null;
}

export interface RulePrediction {
  action: ActionCode; priority: number; rule_id: string; explanation: string;
  supporting_features: Partial<ActionFeatures>; evidence_message_ids: string[]; rule_version: string;
}

export interface TabPfnPrediction { action: ActionCode; confidence: number; probabilities: Partial<Record<ActionCode, number>>; model_id: string }

export interface ClassificationEvent {
  event_id: string; correlation_id: string; event_type: "cqa.classification.requested"; event_version: 1;
  occurred_at: string; dataset_group_id: string; conversation_id: string; force?: boolean;
}
