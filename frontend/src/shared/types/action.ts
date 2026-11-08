export const ACTION_CODES = ["NO_ACTION", "CUSTOMER_CALLBACK", "ESCALATE_UNRESOLVED_CASE", "COMPLIANCE_REVIEW", "OPERATOR_COACHING", "SERVICE_RECOVERY_OFFER", "TECHNICAL_INVESTIGATION", "SUPERVISOR_REVIEW"] as const;
export type ActionCode = typeof ACTION_CODES[number];
export const ACTION_LABELS: Record<ActionCode, string> = {
  NO_ACTION: "No further action", CUSTOMER_CALLBACK: "Customer callback", ESCALATE_UNRESOLVED_CASE: "Escalate unresolved case",
  COMPLIANCE_REVIEW: "Compliance review", OPERATOR_COACHING: "Operator coaching", SERVICE_RECOVERY_OFFER: "Service recovery offer",
  TECHNICAL_INVESTIGATION: "Technical investigation", SUPERVISOR_REVIEW: "Supervisor review"
};
export interface ActionResult {
  result_id: string; conversation_id: string; dataset_group_id: string; status: "queued" | "processing" | "completed" | "fallback" | "failed";
  final_action: ActionCode | null; classification_source: "rules" | "tabpfn" | null; model_confidence: number | null;
  override_reason: string | null; tabpfn_unavailable_reason: string | null; evidence_message_ids: string[];
  local_rule_prediction?: { action?: ActionCode; explanation: string; rule_id: string; supporting_features: Record<string, unknown> };
  previous_classification?: ActionResult | null;
  training_sample_source?: "classification_labels";
  training_sample_count?: number;
  training_dataset_version?: string;
}
export interface ClassificationLabel { label_id: string; proposed_action: ActionCode; verified_action: ActionCode | null; verification_status: "PROPOSED" | "VERIFIED" }
export interface ClassificationStatus {
  enabled: boolean;
  feature_version: string;
  training: { ready: boolean; reasons: string[]; sample_source: "classification_labels"; verified_total: number; rejected_total: number; minimum_per_class: number; minimum_total: number; class_counts: Partial<Record<ActionCode, number>>; represented_classes: ActionCode[]; eligible_total: number };
  model: { status: string; provider_model_id: string; fitted_train_set_id: string; training_dataset_version: string } | null;
}
