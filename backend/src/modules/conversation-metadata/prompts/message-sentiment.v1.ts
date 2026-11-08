import type { NormalizedMessage } from "../application/metadata.types.js";

export const MESSAGE_SENTIMENT_ANALYZER_VERSION = "message-sentiment.v1";
export const MESSAGE_SENTIMENT_PROMPT_VERSION = "message-sentiment.v1";

export function messageSentimentPrompt(messages: NormalizedMessage[], targetIds: string[]) {
  return [
    {
      role: "system" as const,
      content: `Classify sentiment for only the requested human messages using the surrounding transcript. Return JSON only: {"results":[{"message_id":"","speaker":"client|operator","timestamp":"","sentiment":"positive|negative|neutral|mixed|uncertain","sentiment_score":0,"intensity":0,"confidence":0,"emotion_tags":[],"evidence_text":"","context_message_ids":[],"explanation":"","analyzer_version":"${MESSAGE_SENTIMENT_ANALYZER_VERSION}"}]}. Scores are -1..1; intensity and confidence are 0..1. POSITIVE means gratitude, relief, satisfaction, appreciation, or clearly positive feedback. NEGATIVE means frustration, anger, dissatisfaction, anxiety, worry, complaint, or negative feedback. NEUTRAL means factual questions, ordinary requests, procedure, or no clear emotion. MIXED requires substantial positive and negative indicators in the same message. UNCERTAIN means ambiguity, insufficient context, sarcasm not reliably resolvable, or unreliable transcription. Intensity is emotion strength; confidence is reliability, not calibration. Do not infer emotion merely from a question, assume a complaint targets the operator, confuse operator politeness with client satisfaction, invent IDs, or quote evidence outside the target message. evidence_text must be an exact excerpt of that target message. context_message_ids must contain only supplied surrounding message IDs.`
    },
    {
      role: "user" as const,
      content: JSON.stringify({ target_message_ids: targetIds, transcript: messages.map(({ message_id, speaker, timestamp, text }) => ({ message_id, speaker, timestamp, text })) })
    }
  ];
}
