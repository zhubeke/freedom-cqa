import { Type, type Static } from "@sinclair/typebox";

export const EvidenceSchema = Type.Object({
  value: Type.Unknown(),
  confidence: Type.Number({ minimum: 0, maximum: 1 }),
  evidence_message_ids: Type.Array(Type.String()),
  explanation: Type.Optional(Type.String())
}, { additionalProperties: false });

const IntentSchema = Type.Object({
  label: Type.String({ minLength: 1 }),
  resolved: Type.Boolean(),
  confidence: Type.Number({ minimum: 0, maximum: 1 }),
  evidence_message_ids: Type.Array(Type.String()),
  explanation: Type.Optional(Type.String())
}, { additionalProperties: false });

const SignalSchema = Type.Object({
  value: Type.Boolean(),
  confidence: Type.Number({ minimum: 0, maximum: 1 }),
  evidence_message_ids: Type.Array(Type.String()),
  explanation: Type.Optional(Type.String())
}, { additionalProperties: false });

const RatedBehaviorSchema = Type.Object({
  rating: Type.Union([Type.Literal("poor"), Type.Literal("fair"), Type.Literal("good"), Type.Literal("excellent"), Type.Literal("not_observable")]),
  confidence: Type.Number({ minimum: 0, maximum: 1 }),
  evidence_message_ids: Type.Array(Type.String()),
  explanation: Type.Optional(Type.String())
}, { additionalProperties: false });

export const SemanticMetadataSchema = Type.Object({
  customer_intent: Type.Object({
    primary_intent: IntentSchema,
    secondary_intents: Type.Array(IntentSchema),
    topic_category: Type.String(),
    requested_outcome: Type.String(),
    resolved: Type.Boolean(),
    unresolved_questions: Type.Array(Type.Object({
      question: Type.String(),
      confidence: Type.Number({ minimum: 0, maximum: 1 }),
      evidence_message_ids: Type.Array(Type.String())
    }, { additionalProperties: false }))
  }, { additionalProperties: false }),
  customer_sentiment: Type.Object({
    overall: Type.Union([Type.Literal("positive"), Type.Literal("neutral"), Type.Literal("negative"), Type.Literal("mixed")]),
    score: Type.Number({ minimum: -1, maximum: 1 }),
    initial: Type.Union([Type.Literal("positive"), Type.Literal("neutral"), Type.Literal("negative"), Type.Literal("mixed")]),
    final: Type.Union([Type.Literal("positive"), Type.Literal("neutral"), Type.Literal("negative"), Type.Literal("mixed")]),
    confidence: Type.Number({ minimum: 0, maximum: 1 }),
    evidence_message_ids: Type.Array(Type.String()),
    frustration_indicators: Type.Array(Type.String()),
    emotional_changes: Type.Array(Type.String())
  }, { additionalProperties: false }),
  operator_behavior: Type.Object({
    politeness: RatedBehaviorSchema,
    empathy: RatedBehaviorSchema,
    clarity: RatedBehaviorSchema,
    responsiveness: RatedBehaviorSchema,
    inappropriate_behavior: SignalSchema,
    acknowledges_dissatisfaction: SignalSchema
  }, { additionalProperties: false }),
  resolution_and_follow_up: Type.Object({
    status: Type.Union([Type.Literal("resolved"), Type.Literal("partially_resolved"), Type.Literal("unresolved"), Type.Literal("unknown")]),
    callback_promised: SignalSchema,
    future_action_committed: SignalSchema,
    further_investigation_needed: SignalSchema,
    issue_open: SignalSchema,
    escalation_required: SignalSchema
  }, { additionalProperties: false }),
  compliance: Type.Object({
    identity_verification_required: SignalSchema,
    identity_verification_confirmed: SignalSchema,
    sensitive_information_disclosure: SignalSchema,
    potential_severe_violation: SignalSchema
  }, { additionalProperties: false })
}, { additionalProperties: false });

export type SemanticMetadata = Static<typeof SemanticMetadataSchema>;

const NullableMetricSchema = Type.Object({
  value: Type.Union([Type.Number(), Type.Null()]),
  reason: Type.Union([Type.String(), Type.Null()])
}, { additionalProperties: false });

export const DeterministicMetadataSchema = Type.Object({
  conversation: Type.Object({
    language: Type.String(), channel: Type.String(), duration_seconds: NullableMetricSchema,
    total_message_count: Type.Integer(), first_timestamp: Type.Union([Type.String(), Type.Null()]),
    last_timestamp: Type.Union([Type.String(), Type.Null()]),
    operator_names: Type.Array(Type.Object({ name: Type.String(), evidence_message_id: Type.Union([Type.String(), Type.Null()]), source: Type.Union([Type.Literal("structured"), Type.Literal("transcript")]) }, { additionalProperties: false })),
    timestamp_quality: Type.Union([Type.Literal("valid"), Type.Literal("partial"), Type.Literal("invalid"), Type.Literal("insufficient")])
  }, { additionalProperties: false }),
  messages_and_turns: Type.Object({
    client_message_count: Type.Integer(), operator_message_count: Type.Integer(), bot_message_count: Type.Integer(), system_message_count: Type.Integer(),
    client_turn_count: Type.Integer(), operator_turn_count: Type.Integer(), human_handoff_count: Type.Integer(), operator_to_client_turn_ratio: NullableMetricSchema
  }, { additionalProperties: false }),
  response_timing: Type.Object({
    first_operator_response_seconds: NullableMetricSchema,
    first_operator_response_after_handoff_seconds: NullableMetricSchema,
    average_operator_response_seconds: NullableMetricSchema,
    median_operator_response_seconds: NullableMetricSchema,
    maximum_operator_response_seconds: NullableMetricSchema,
    minimum_operator_response_seconds: NullableMetricSchema,
    operator_responses_measured: Type.Integer(),
    long_waiting_periods: Type.Array(Type.Object({ client_message_id: Type.String(), operator_message_id: Type.String(), duration_seconds: Type.Number() }, { additionalProperties: false }))
  }, { additionalProperties: false })
}, { additionalProperties: false });

export type DeterministicMetadata = Static<typeof DeterministicMetadataSchema>;

