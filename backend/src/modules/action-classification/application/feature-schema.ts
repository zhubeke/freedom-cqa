import type { ActionFeatures, FeatureValue } from "./action.types.js";

export const ACTION_FEATURE_ORDER = [
  "duration_seconds", "client_turn_count", "operator_turn_count", "first_operator_response_seconds",
  "average_operator_response_seconds", "max_operator_response_seconds", "handoff_count", "long_wait_count",
  "quality_score", "greeting_score", "needs_identification_score", "identity_verification_score", "consultation_score",
  "empathy_score", "dialogue_management_score", "closing_score", "severe_violation", "greeting_applicable",
  "needs_identification_applicable", "identity_verification_applicable", "consultation_applicable", "empathy_applicable",
  "dialogue_management_applicable", "closing_applicable", "primary_intent_category", "unresolved_intent_count",
  "resolution_status", "followup_promised", "escalation_required", "verification_required", "verification_completed",
  "client_initial_sentiment", "client_final_sentiment", "client_average_sentiment", "client_negative_message_count",
  "sentiment_recovery_detected", "silence_ratio", "longest_silence_seconds", "audio_loudness_variability",
  "audio_speech_ratio", "audio_silence_ratio", "audio_overlap_ratio", "audio_detected_speaker_count",
  "audio_operator_speaking_ratio", "audio_client_speaking_ratio", "audio_interruption_count_estimate",
  "audio_operator_rms_dbfs", "audio_client_rms_dbfs", "audio_longest_silence_seconds",
  "audio_alignment_confidence", "audio_features_available"
] as const satisfies readonly (keyof ActionFeatures)[];

const forbidden = /(?:conversation|customer|phone|account|audio_url|signed|name|transcript|message_id)/i;

export function validateFeatureVector(features: ActionFeatures): string[] {
  const errors: string[] = [];
  const keys = Object.keys(features);
  for (const key of keys) if (!(ACTION_FEATURE_ORDER as readonly string[]).includes(key) || forbidden.test(key)) errors.push(`Unapproved feature field: ${key}`);
  for (const key of ACTION_FEATURE_ORDER) {
    if (!(key in features)) errors.push(`Missing feature field: ${key}`);
    const value = features[key];
    if (value !== null && !["number", "string", "boolean"].includes(typeof value)) errors.push(`Invalid feature value: ${key}`);
    if (typeof value === "number" && !Number.isFinite(value)) errors.push(`Non-finite feature value: ${key}`);
  }
  return errors;
}

export function approvedFeatureRow(features: ActionFeatures): FeatureValue[] {
  const errors = validateFeatureVector(features);
  if (errors.length) throw new Error(`Feature allowlist validation failed: ${errors.join("; ")}`);
  return ACTION_FEATURE_ORDER.map((key) => features[key]);
}
