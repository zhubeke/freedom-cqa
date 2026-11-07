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
  local_rule_prediction?: { explanation: string; rule_id: string; supporting_features: Record<string, unknown> };
}
export interface ClassificationLabel { label_id: string; proposed_action: ActionCode; verified_action: ActionCode | null; verification_status: "PROPOSED" | "VERIFIED" }
