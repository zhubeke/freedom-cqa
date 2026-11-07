import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Value } from "@sinclair/typebox/value";
import { normalizeConversation } from "../../conversation-ingestion/application/normalize-conversation.js";
import type { DatasetEnvelope, SourceRecord } from "../../conversation-ingestion/schemas/dataset.js";
import { extractDeterministicMetadata } from "../application/extract-deterministic.js";
import { extractSemanticMetadata } from "../application/extract-semantic.js";
import { SemanticMetadataSchema } from "../schemas/metadata.schemas.js";
import type { NormalizedConversation } from "../application/metadata.types.js";

const dataset = JSON.parse(await readFile(new URL("../../../../../data/fixtures/invoke.json", import.meta.url), "utf8")) as DatasetEnvelope;
function source(id: string): SourceRecord { return dataset.data.records.find((record) => record.conversation_id === id)!; }
function normalized(id: string): NormalizedConversation { return normalizeConversation(dataset.data.dataset_group_id, source(id)) as NormalizedConversation; }

function semanticFixture(id: "p1-ru-003" | "p1-en-006") {
  const conversation = normalized(id);
  const evidence = (index: number) => conversation.transcript[index]!.message_id;
  const signal = (value = false, ids: string[] = []) => ({ value, confidence: 0.9, evidence_message_ids: ids });
  const rating = { rating: "good", confidence: 0.8, evidence_message_ids: [evidence(conversation.transcript.length - 1)] };
  const isEnglish = id === "p1-en-006";
  return {
    customer_intent: {
      primary_intent: { label: isEnglish ? "missing transfer" : "trading commission", resolved: false, confidence: 0.95, evidence_message_ids: [evidence(0)] },
      secondary_intents: [{ label: isEnglish ? "broker report" : "tariff location", resolved: true, confidence: 0.94, evidence_message_ids: [evidence(isEnglish ? 24 : 1), evidence(isEnglish ? 25 : 12)] }],
      topic_category: "brokerage support", requested_outcome: "information and assistance", resolved: false,
      unresolved_questions: [{ question: isEnglish ? "When will the transfer arrive?" : "What is the commission?", confidence: 0.95, evidence_message_ids: [evidence(isEnglish ? 0 : 13)] }]
    },
    customer_sentiment: { overall: "mixed", score: -0.2, initial: "negative", final: "neutral", confidence: 0.85, evidence_message_ids: [evidence(0)], frustration_indicators: [], emotional_changes: [] },
    operator_behavior: { politeness: rating, empathy: rating, clarity: rating, responsiveness: rating, inappropriate_behavior: signal(), acknowledges_dissatisfaction: signal(isEnglish, [evidence(10)]) },
    resolution_and_follow_up: { status: "partially_resolved", callback_promised: signal(), future_action_committed: signal(isEnglish, isEnglish ? [evidence(15)] : []), further_investigation_needed: signal(isEnglish, isEnglish ? [evidence(15)] : []), issue_open: signal(true, [evidence(isEnglish ? 29 : 14)]), escalation_required: signal() },
    compliance: { identity_verification_required: signal(isEnglish, isEnglish ? [evidence(10)] : []), identity_verification_confirmed: signal(isEnglish, isEnglish ? [evidence(12)] : []), sensitive_information_disclosure: signal(), potential_severe_violation: signal() }
  };
}

test("p1-ru-001 deterministic metadata matches the source acceptance fixture", () => {
  const result = extractDeterministicMetadata(normalized("p1-ru-001"));
  assert.equal(result.conversation.total_message_count, 12);
  assert.equal(result.messages_and_turns.client_message_count, 4);
  assert.equal(result.messages_and_turns.operator_message_count, 2);
  assert.equal(result.messages_and_turns.bot_message_count, 5);
  assert.equal(result.messages_and_turns.system_message_count, 1);
  assert.equal(result.conversation.duration_seconds.value, 124);
  assert.equal(result.response_timing.first_operator_response_after_handoff_seconds.value, 37);
});

test("p4-ru-001 preserves duplicate messages and parses timezone-aware ISO timestamps", () => {
  const conversation = normalized("p4-ru-001");
  const duplicates = conversation.transcript.filter((message) => message.text === "Я хотела вот я всегда работала в кустанае с брокером.");
  assert.equal(duplicates.length, 2);
  assert.notEqual(duplicates[0]!.message_id, duplicates[1]!.message_id);
  const result = extractDeterministicMetadata(conversation);
  assert.equal(result.conversation.timestamp_quality, "valid");
  assert.ok((result.conversation.duration_seconds.value ?? 0) > 300);
  assert.equal(conversation.has_audio, true);
});

test("semantic schema represents resolved and unresolved p1-ru-003 intents with evidence", () => {
  const value = semanticFixture("p1-ru-003");
  assert.equal(Value.Check(SemanticMetadataSchema, value), true);
  assert.equal(value.customer_intent.primary_intent.resolved, false);
  assert.equal(value.customer_intent.secondary_intents[0]!.resolved, true);
  assert.ok(value.customer_intent.unresolved_questions[0]!.evidence_message_ids.length > 0);
});

test("p1-en-006 supports multiple intents and a pending follow-up commitment", () => {
  const value = semanticFixture("p1-en-006");
  assert.equal(Value.Check(SemanticMetadataSchema, value), true);
  assert.equal(normalized("p1-en-006").normalized_language, "en");
  assert.equal(value.customer_intent.secondary_intents.length, 1);
  assert.equal(value.resolution_and_follow_up.future_action_committed.value, true);
  assert.equal(value.resolution_and_follow_up.issue_open.value, true);
});

test("semantic extraction rejects invented message evidence", async () => {
  const value = semanticFixture("p1-en-006");
  value.customer_intent.primary_intent.evidence_message_ids = ["invented:m9999"];
  const gateway = { complete: async () => ({ content: JSON.stringify(value), modelId: "test", latencyMs: 1, usage: null }) };
  await assert.rejects(() => extractSemanticMetadata(normalized("p1-en-006"), gateway), /unknown evidence IDs/);
});

test("Cloudflare failure does not prevent deterministic extraction", async () => {
  const conversation = normalized("p1-ru-001");
  const deterministic = extractDeterministicMetadata(conversation);
  const gateway = { complete: async () => { throw new Error("Cloudflare unavailable"); } };
  await assert.rejects(() => extractSemanticMetadata(conversation, gateway), /Cloudflare unavailable/);
  assert.equal(deterministic.conversation.duration_seconds.value, 124);
});
