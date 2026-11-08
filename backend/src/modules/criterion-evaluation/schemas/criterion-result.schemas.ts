import { Type } from "@sinclair/typebox";

export const CriterionLlmResultSchema = Type.Object({
  criterion_id: Type.String({ minLength: 1 }),
  value: Type.Union([Type.Boolean(), Type.Number(), Type.Null()]),
  rationale: Type.String({ minLength: 1 }),
  evidence_message_ids: Type.Array(Type.String({ minLength: 1 })),
  confidence: Type.Number({ minimum: 0, maximum: 1 }),
  model_id: Type.String({ minLength: 1 })
}, { additionalProperties: false });
