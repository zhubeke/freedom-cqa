import { Value } from "@sinclair/typebox/value";
import type { LlmGateway } from "../../llm-gateway/application/llm-gateway.js";
import { semanticMetadataPrompt } from "../prompts/semantic-metadata.v1.js";
import { SemanticMetadataSchema, type SemanticMetadata } from "../schemas/metadata.schemas.js";
import type { NormalizedConversation } from "./metadata.types.js";

function parseJson(content: string): unknown {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(cleaned); }
  catch { throw new Error("Semantic metadata response is not valid JSON"); }
}

function normalizeModelVocabulary(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const root = value as Record<string, unknown>;
  const behavior = root.operator_behavior as Record<string, unknown> | undefined;
  const ratingAliases: Record<string, string> = {
    high: "good", medium: "fair", low: "poor", positive: "good", neutral: "fair", negative: "poor",
    very_good: "excellent", very_poor: "poor", unknown: "not_observable", "n/a": "not_observable"
  };
  for (const key of ["politeness", "empathy", "clarity", "responsiveness"]) {
    const item = behavior?.[key] as Record<string, unknown> | undefined;
    if (typeof item?.rating === "string") {
      const rating = item.rating.toLowerCase().replaceAll(" ", "_");
      item.rating = ratingAliases[rating]
        ?? (/not_|unknown|unobservable|insufficient/.test(rating) ? "not_observable"
          : /poor|low|impolite|unclear|unresponsive|inappropriate|lack/.test(rating) ? "poor"
          : /fair|medium|moderate|partial/.test(rating) ? "fair"
          : /excellent|very_|exceptional/.test(rating) ? "excellent"
          : /good|high|polite|clear|responsive|empathetic|professional|adequate|effective/.test(rating) ? "good"
          : item.rating);
    }
  }
  const sentiment = root.customer_sentiment as Record<string, unknown> | undefined;
  for (const key of ["overall", "initial", "final"]) {
    const item = sentiment?.[key];
    if (typeof item === "string" && !["positive", "neutral", "negative", "mixed"].includes(item)) {
      const normalized = item.toLowerCase();
      sentiment![key] = normalized.includes("mixed") ? "mixed" : normalized.includes("negative") ? "negative" : normalized.includes("positive") ? "positive" : normalized.includes("neutral") ? "neutral" : item;
    }
  }
  for (const key of ["frustration_indicators", "emotional_changes"]) {
    const items = sentiment?.[key];
    if (Array.isArray(items)) {
      sentiment![key] = items.map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const object = item as Record<string, unknown>;
          const text = object.description ?? object.change ?? object.explanation ?? object.indicator;
          if (typeof text === "string") return text;
        }
        return JSON.stringify(item);
      });
    }
  }
  const intent = root.customer_intent as Record<string, unknown> | undefined;
  if (Array.isArray(intent?.unresolved_questions)) {
    intent.unresolved_questions = intent.unresolved_questions.map((item) => typeof item === "string"
      ? { question: item, confidence: 0, evidence_message_ids: [] }
      : item);
  }
  return value;
}

function evidenceIds(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const object = value as Record<string, unknown>;
  return Object.entries(object).flatMap(([key, child]) => {
    if (key === "evidence_message_ids" && Array.isArray(child)) return child.filter((item): item is string => typeof item === "string");
    if (Array.isArray(child)) return child.flatMap(evidenceIds);
    return evidenceIds(child);
  });
}

export async function extractSemanticMetadata(conversation: NormalizedConversation, gateway: LlmGateway): Promise<SemanticMetadata> {
  const response = await gateway.complete(semanticMetadataPrompt(conversation), { maxTokens: 2200 });
  const parsed = normalizeModelVocabulary(parseJson(response.content));
  if (!Value.Check(SemanticMetadataSchema, parsed)) {
    const detail = [...Value.Errors(SemanticMetadataSchema, parsed)].slice(0, 5).map((error) => `${error.path}: ${error.message}`).join("; ");
    throw new Error(`Semantic metadata response failed validation: ${detail}`);
  }
  const validIds = new Set(conversation.transcript.map((message) => message.message_id));
  const invalid = [...new Set(evidenceIds(parsed).filter((id) => !validIds.has(id)))];
  if (invalid.length) throw new Error(`Semantic metadata contains unknown evidence IDs: ${invalid.join(", ")}`);
  return parsed as SemanticMetadata;
}
