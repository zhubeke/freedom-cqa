import type { NormalizedConversation } from "../application/metadata.types.js";

export const SEMANTIC_PROMPT_VERSION = "semantic-metadata.v2";

export function semanticMetadataPrompt(conversation: NormalizedConversation) {
  const transcript = conversation.transcript.map(({ message_id, timestamp, speaker, text }) => ({ message_id, timestamp, speaker, text }));
  return [
    {
      role: "system" as const,
      content: `You extract conversation metadata for quality analytics. Contract version semantic-metadata.v2. Return JSON only, with no markdown and no additional properties. Never invent facts or evidence. Every evidence_message_ids item must be copied from the supplied transcript. Sentiment overall/initial/final MUST be exactly one of: positive, neutral, negative, mixed. Every operator rating MUST be exactly one of: poor, fair, good, excellent, not_observable. Resolution status MUST be exactly one of: resolved, partially_resolved, unresolved, unknown. Use not_observable when behavior cannot be evidenced. A flag is a potential signal, not a final compliance judgment. Use this exact shape:
{"customer_intent":{"primary_intent":{"label":"","resolved":false,"confidence":0,"evidence_message_ids":[],"explanation":""},"secondary_intents":[],"topic_category":"","requested_outcome":"","resolved":false,"unresolved_questions":[]},"customer_sentiment":{"overall":"neutral","score":0,"initial":"neutral","final":"neutral","confidence":0,"evidence_message_ids":[],"frustration_indicators":[],"emotional_changes":[]},"operator_behavior":{"politeness":{"rating":"not_observable","confidence":0,"evidence_message_ids":[]},"empathy":{"rating":"not_observable","confidence":0,"evidence_message_ids":[]},"clarity":{"rating":"not_observable","confidence":0,"evidence_message_ids":[]},"responsiveness":{"rating":"not_observable","confidence":0,"evidence_message_ids":[]},"inappropriate_behavior":{"value":false,"confidence":0,"evidence_message_ids":[]},"acknowledges_dissatisfaction":{"value":false,"confidence":0,"evidence_message_ids":[]}},"resolution_and_follow_up":{"status":"unknown","callback_promised":{"value":false,"confidence":0,"evidence_message_ids":[]},"future_action_committed":{"value":false,"confidence":0,"evidence_message_ids":[]},"further_investigation_needed":{"value":false,"confidence":0,"evidence_message_ids":[]},"issue_open":{"value":false,"confidence":0,"evidence_message_ids":[]},"escalation_required":{"value":false,"confidence":0,"evidence_message_ids":[]}},"compliance":{"identity_verification_required":{"value":false,"confidence":0,"evidence_message_ids":[]},"identity_verification_confirmed":{"value":false,"confidence":0,"evidence_message_ids":[]},"sensitive_information_disclosure":{"value":false,"confidence":0,"evidence_message_ids":[]},"potential_severe_violation":{"value":false,"confidence":0,"evidence_message_ids":[]}}}`
    },
    {
      role: "user" as const,
      content: JSON.stringify({ language: conversation.normalized_language, channel: conversation.normalized_channel, transcript })
    }
  ];
}

