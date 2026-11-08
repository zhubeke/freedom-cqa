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

export function normalizeModelVocabulary(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const root = value as Record<string, unknown>;
  const behavior = root.operator_behavior as Record<string, unknown> | undefined;
  const allowedRatings = new Set(["poor", "fair", "good", "excellent", "not_observable"]);
  for (const key of ["politeness", "empathy", "clarity", "responsiveness"]) {
    const item = behavior?.[key] as Record<string, unknown> | undefined;
    if (typeof item?.rating === "string") {
      const rating = item.rating.toLowerCase().replaceAll(" ", "_");
      if (allowedRatings.has(rating)) item.rating = rating;
    }
  }
  const sentiment = root.customer_sentiment as Record<string, unknown> | undefined;
  for (const key of ["overall", "initial", "final"]) {
    const item = sentiment?.[key];
    if (typeof item === "string") sentiment![key] = item.trim().toLowerCase().replaceAll(" ", "_");
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
  const primaryIntent = intent?.primary_intent as Record<string, unknown> | undefined;
  if (primaryIntent && (typeof primaryIntent.label !== "string" || primaryIntent.label.trim().length === 0)) {
    const fallback = [intent?.topic_category, intent?.requested_outcome]
      .find((item): item is string => typeof item === "string" && item.trim().length > 0);
    if (fallback) primaryIntent.label = fallback.trim();
  }
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
  const response = await gateway.complete(semanticMetadataPrompt(conversation), { maxTokens: 2200, workflow: "metadata" });
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

export interface PartialSemanticExtraction {
  semantic: Partial<SemanticMetadata>;
  validationErrors: Array<{ path: string; message: string }>;
}

function removeInvalidPath(root: unknown, path: string): void {
  const parts = path.split("/").filter(Boolean);
  if (!root || typeof root !== "object" || !parts.length) return;
  let parent = root as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) {
    const child = parent[part];
    if (!child || typeof child !== "object") return;
    parent = child as Record<string, unknown>;
  }
  delete parent[parts.at(-1)!];
}

export async function extractSemanticMetadataPartial(conversation: NormalizedConversation, gateway: LlmGateway): Promise<PartialSemanticExtraction> {
  const response = await gateway.complete(semanticMetadataPrompt(conversation), { maxTokens: 2200, workflow: "metadata" });
  const parsed = normalizeModelVocabulary(parseJson(response.content));
  const errors = [...Value.Errors(SemanticMetadataSchema, parsed)]
    .map((error) => ({ path: error.path, message: error.message }))
    .filter((error, index, all) => all.findIndex((candidate) => candidate.path === error.path) === index);
  const partial = structuredClone(parsed) as Partial<SemanticMetadata>;
  for (const error of errors) removeInvalidPath(partial, error.path);
  const validIds = new Set(conversation.transcript.map((message) => message.message_id));
  const invalid = [...new Set(evidenceIds(partial).filter((id) => !validIds.has(id)))];
  if (invalid.length) throw new Error(`Semantic metadata contains unknown evidence IDs: ${invalid.join(", ")}`);
  return { semantic: partial, validationErrors: errors };
}
