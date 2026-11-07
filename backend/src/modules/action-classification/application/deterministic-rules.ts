import { ACTION_RULE_CONFIG_V1 } from "../config/rules.v1.js";
import type { ActionFeatures, RulePrediction } from "./action.types.js";
import { resolveRulePriority } from "./priority-resolution.js";

type Evidence = { semantic?: Record<string, any> | null; criteria?: Array<Record<string, any>> };
const result = (action: RulePrediction["action"], priority: number, rule_id: string, explanation: string, supporting_features: Partial<ActionFeatures>, evidence_message_ids: string[] = []): RulePrediction =>
  ({ action, priority, rule_id, explanation, supporting_features, evidence_message_ids: [...new Set(evidence_message_ids)], rule_version: ACTION_RULE_CONFIG_V1.version });
const ids = (input: unknown): string[] => Array.isArray(input) ? input.filter((item): item is string => typeof item === "string") : [];

export function complianceRule(features: ActionFeatures, evidence: Evidence): RulePrediction | null {
  if (features.severe_violation !== true) return null;
  const criterion = evidence.criteria?.find((item) => item.criterion_id === "freedom-criterion-08");
  return result("COMPLIANCE_REVIEW", 1, "compliance.confirmed-severe-violation", "A completed checklist evaluation confirmed a severe violation.", { severe_violation: true }, ids(criterion?.evidence_message_ids));
}

export function supervisorRule(features: ActionFeatures, evidence: Evidence): RulePrediction | null {
  const inappropriate = evidence.semantic?.operator_behavior?.inappropriate_behavior;
  const seriousFailure = features.quality_score !== null && features.quality_score < ACTION_RULE_CONFIG_V1.supervisorQualityThreshold
    && features.resolution_status === "unresolved" && (features.client_final_sentiment === "negative" || (features.client_average_sentiment ?? 0) < -0.5);
  if (inappropriate?.value !== true && !seriousFailure) return null;
  return result("SUPERVISOR_REVIEW", 2, inappropriate?.value === true ? "supervisor.inappropriate-conduct" : "supervisor.serious-service-failure",
    inappropriate?.value === true ? "Stored semantic evidence indicates substantial inappropriate operator conduct." : "A serious unresolved service failure and strong customer dissatisfaction require supervisor assessment.",
    { quality_score: features.quality_score, resolution_status: features.resolution_status, client_final_sentiment: features.client_final_sentiment }, ids(inappropriate?.evidence_message_ids));
}

export function unresolvedRule(features: ActionFeatures, evidence: Evidence): RulePrediction | null {
  const isTechnical = ACTION_RULE_CONFIG_V1.technicalIntentPattern.test(features.primary_intent_category ?? "");
  if (isTechnical || (features.resolution_status !== "unresolved" && (features.unresolved_intent_count ?? 0) < 1)) return null;
  return result("ESCALATE_UNRESOLVED_CASE", 3, "case.significant-request-unresolved", "A significant customer request remains unresolved.",
    { resolution_status: features.resolution_status, unresolved_intent_count: features.unresolved_intent_count, escalation_required: features.escalation_required },
    (evidence.semantic?.customer_intent?.unresolved_questions ?? []).flatMap((item: any) => ids(item?.evidence_message_ids)));
}

export function callbackRule(features: ActionFeatures, evidence: Evidence): RulePrediction | null {
  if (features.followup_promised !== true || features.resolution_status === "resolved") return null;
  const followup = evidence.semantic?.resolution_and_follow_up?.callback_promised?.value === true
    ? evidence.semantic.resolution_and_follow_up.callback_promised : evidence.semantic?.resolution_and_follow_up?.future_action_committed;
  return result("CUSTOMER_CALLBACK", 4, "followup.promised-and-pending", "The operator promised a follow-up and the case is not recorded as resolved.",
    { followup_promised: true, resolution_status: features.resolution_status }, ids(followup?.evidence_message_ids));
}

export function technicalRule(features: ActionFeatures, evidence: Evidence): RulePrediction | null {
  const technical = ACTION_RULE_CONFIG_V1.technicalIntentPattern.test(features.primary_intent_category ?? "");
  if (!technical || !["unresolved", "partially_resolved"].includes(features.resolution_status ?? "")) return null;
  return result("TECHNICAL_INVESTIGATION", 5, "technical.suspected-defect-unresolved", "A technical or product issue remains unresolved.",
    { primary_intent_category: features.primary_intent_category, resolution_status: features.resolution_status }, ids(evidence.semantic?.customer_intent?.primary_intent?.evidence_message_ids));
}

export function recoveryRule(features: ActionFeatures, evidence: Evidence): RulePrediction | null {
  const dissatisfied = features.client_final_sentiment === "negative" || (features.client_average_sentiment !== null && features.client_average_sentiment <= ACTION_RULE_CONFIG_V1.serviceRecoverySentimentThreshold);
  const serviceFailure = features.consultation_score !== null && features.consultation_score <= 5;
  if (!dissatisfied || !serviceFailure) return null;
  return result("SERVICE_RECOVERY_OFFER", 6, "recovery.dissatisfaction-after-service-failure", "Customer dissatisfaction and an established service failure warrant consideration of a goodwill gesture; no gesture is executed automatically.",
    { client_final_sentiment: features.client_final_sentiment, client_average_sentiment: features.client_average_sentiment, consultation_score: features.consultation_score }, ids(evidence.semantic?.customer_sentiment?.evidence_message_ids));
}

export function coachingRule(features: ActionFeatures, evidence: Evidence): RulePrediction | null {
  const weak = features.quality_score !== null && features.quality_score < ACTION_RULE_CONFIG_V1.coachingQualityThreshold
    || features.empathy_score === 0 || (features.dialogue_management_score !== null && features.dialogue_management_score < 10) || features.greeting_score === 0;
  if (!weak) return null;
  const criterionIds = ["freedom-criterion-01", "freedom-criterion-05", "freedom-criterion-06"];
  return result("OPERATOR_COACHING", 7, "coaching.non-severe-quality-gap", "The conversation contains a non-severe communication or consultation weakness suitable for targeted coaching.",
    { quality_score: features.quality_score, greeting_score: features.greeting_score, empathy_score: features.empathy_score, dialogue_management_score: features.dialogue_management_score },
    (evidence.criteria ?? []).filter((item) => criterionIds.includes(item.criterion_id)).flatMap((item) => ids(item.evidence_message_ids)));
}

export function noActionRule(features: ActionFeatures): RulePrediction | null {
  const adequateScore = features.quality_score === null || features.quality_score >= ACTION_RULE_CONFIG_V1.coachingQualityThreshold;
  if (features.resolution_status !== "resolved" || !adequateScore || features.severe_violation === true) return null;
  return result("NO_ACTION", 8, "resolution.successful-no-significant-issue", "Stored evidence indicates successful resolution without a significant quality, compliance, or follow-up issue.",
    { resolution_status: features.resolution_status, quality_score: features.quality_score, severe_violation: features.severe_violation });
}

export function fallbackRule(features: ActionFeatures): RulePrediction {
  return result("SUPERVISOR_REVIEW", 9, "review.insufficient-or-ambiguous-evidence", "Available metadata is insufficient or ambiguous, so a supervisor should assess the recommended next step.",
    { resolution_status: features.resolution_status, quality_score: features.quality_score });
}

export const ACTION_RULES = [complianceRule, supervisorRule, unresolvedRule, callbackRule, technicalRule, recoveryRule, coachingRule, noActionRule] as const;

export function classifyWithRules(features: ActionFeatures, evidence: Evidence = {}): RulePrediction {
  return resolveRulePriority(ACTION_RULES.map((rule) => rule(features, evidence)), fallbackRule(features));
}
