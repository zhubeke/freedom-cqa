import type { ActionFeatures } from "./action.types.js";
import { normalizeMissingFeatures } from "./missing-values.js";

type AnyDocument = Record<string, any>;
const CRITERION_MAPPING = {
  "freedom-criterion-01": "greeting", "freedom-criterion-02": "needs_identification",
  "freedom-criterion-03": "identity_verification", "freedom-criterion-04": "consultation",
  "freedom-criterion-05": "empathy", "freedom-criterion-06": "dialogue_management",
  "freedom-criterion-07": "closing", "freedom-criterion-08": "severe_violation"
} as const;

function value(metric: unknown): number | null {
  return typeof metric === "object" && metric !== null && typeof (metric as { value?: unknown }).value === "number" ? (metric as { value: number }).value : null;
}
function criterionScore(criteria: AnyDocument[], id: keyof typeof CRITERION_MAPPING): number | null {
  const item = criteria.find((candidate) => candidate.criterion_id === id);
  if (!item || item.is_na || item.processing_state !== "completed") return null;
  if (typeof item.raw_value === "boolean") return item.raw_value ? 1 : 0;
  return typeof item.raw_value === "number" ? item.raw_value : null;
}
function applicable(criteria: AnyDocument[], id: keyof typeof CRITERION_MAPPING): boolean | null {
  const item = criteria.find((candidate) => candidate.criterion_id === id);
  return item ? !Boolean(item.is_na) : null;
}
function signal(input: unknown): boolean | null {
  return typeof input === "object" && input !== null && typeof (input as { value?: unknown }).value === "boolean" ? (input as { value: boolean }).value : null;
}

export function extractActionFeatures(input: { metadata?: AnyDocument | null; evaluation?: AnyDocument | null; criteria?: AnyDocument[]; audio?: AnyDocument | null }): ActionFeatures {
  const deterministic = input.metadata?.deterministic; const semantic = input.metadata?.semantic;
  const sentiment = input.metadata?.sentiment_trajectory; const criteria = input.criteria ?? [];
  const unresolved = semantic?.customer_intent?.unresolved_questions;
  const severeCriterion = criteria.find((item) => item.criterion_id === "freedom-criterion-08");
  return normalizeMissingFeatures({
    duration_seconds: value(deterministic?.conversation?.duration_seconds),
    client_turn_count: deterministic?.messages_and_turns?.client_turn_count ?? null,
    operator_turn_count: deterministic?.messages_and_turns?.operator_turn_count ?? null,
    first_operator_response_seconds: value(deterministic?.response_timing?.first_operator_response_seconds),
    average_operator_response_seconds: value(deterministic?.response_timing?.average_operator_response_seconds),
    max_operator_response_seconds: value(deterministic?.response_timing?.maximum_operator_response_seconds),
    handoff_count: deterministic?.messages_and_turns?.human_handoff_count ?? null,
    long_wait_count: Array.isArray(deterministic?.response_timing?.long_waiting_periods) ? deterministic.response_timing.long_waiting_periods.length : null,
    quality_score: typeof input.evaluation?.final_score === "number" ? input.evaluation.final_score : null,
    greeting_score: criterionScore(criteria, "freedom-criterion-01"), needs_identification_score: criterionScore(criteria, "freedom-criterion-02"),
    identity_verification_score: criterionScore(criteria, "freedom-criterion-03"), consultation_score: criterionScore(criteria, "freedom-criterion-04"),
    empathy_score: criterionScore(criteria, "freedom-criterion-05"), dialogue_management_score: criterionScore(criteria, "freedom-criterion-06"),
    closing_score: criterionScore(criteria, "freedom-criterion-07"),
    severe_violation: severeCriterion?.processing_state === "completed" && !severeCriterion.is_na ? severeCriterion.raw_value === true : null,
    greeting_applicable: applicable(criteria, "freedom-criterion-01"), needs_identification_applicable: applicable(criteria, "freedom-criterion-02"),
    identity_verification_applicable: applicable(criteria, "freedom-criterion-03"), consultation_applicable: applicable(criteria, "freedom-criterion-04"),
    empathy_applicable: applicable(criteria, "freedom-criterion-05"), dialogue_management_applicable: applicable(criteria, "freedom-criterion-06"),
    closing_applicable: applicable(criteria, "freedom-criterion-07"),
    primary_intent_category: semantic?.customer_intent?.topic_category ?? semantic?.customer_intent?.primary_intent?.label ?? null,
    unresolved_intent_count: Array.isArray(unresolved) ? unresolved.length : null,
    resolution_status: semantic?.resolution_and_follow_up?.status ?? null,
    followup_promised: signal(semantic?.resolution_and_follow_up?.callback_promised) ?? signal(semantic?.resolution_and_follow_up?.future_action_committed),
    escalation_required: signal(semantic?.resolution_and_follow_up?.escalation_required),
    verification_required: signal(semantic?.compliance?.identity_verification_required), verification_completed: signal(semantic?.compliance?.identity_verification_confirmed),
    client_initial_sentiment: sentiment?.initial_client_sentiment ?? semantic?.customer_sentiment?.initial ?? null,
    client_final_sentiment: sentiment?.final_client_sentiment ?? semantic?.customer_sentiment?.final ?? null,
    client_average_sentiment: typeof sentiment?.average_client_sentiment_score === "number" ? sentiment.average_client_sentiment_score : (typeof semantic?.customer_sentiment?.score === "number" ? semantic.customer_sentiment.score : null),
    client_negative_message_count: typeof sentiment?.negative_client_message_count === "number" ? sentiment.negative_client_message_count : null,
    sentiment_recovery_detected: Array.isArray(sentiment?.recovery_points) ? sentiment.recovery_points.length > 0 : null,
    silence_ratio: typeof input.audio?.silence_ratio === "number" ? input.audio.silence_ratio : null,
    longest_silence_seconds: typeof input.audio?.longest_silence_seconds === "number" ? input.audio.longest_silence_seconds : null,
    audio_loudness_variability: typeof input.audio?.loudness_variability === "number" ? input.audio.loudness_variability : null
  });
}

export const COMPATIBLE_CRITERION_MAPPING = CRITERION_MAPPING;
