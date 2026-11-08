import { Type } from "@sinclair/typebox";

const OrganizerCriterionSchema = Type.Object({
  criterion_id: Type.String({ minLength: 1 }),
  value: Type.Union([Type.Boolean(), Type.Number(), Type.Null()]),
  rationale: Type.String({ minLength: 1 }),
  evidence_turns: Type.Array(Type.Integer({ minimum: 1 }))
}, { additionalProperties: false });
const SuccessSchema = Type.Object({
  conversation_id: Type.String({ minLength: 1 }),
  status: Type.Literal("ok"),
  criteria: Type.Array(OrganizerCriterionSchema, { minItems: 8, maxItems: 8 }),
  score: Type.Object({ final_score: Type.Union([Type.Number(), Type.Null()]), critical_flag: Type.Boolean() }, { additionalProperties: false })
}, { additionalProperties: false });
const ErrorSchema = Type.Object({
  conversation_id: Type.String({ minLength: 1 }), status: Type.Literal("error"), criteria: Type.Tuple([]), score: Type.Null(), error: Type.String({ minLength: 1 })
}, { additionalProperties: false });
export const OrganizerResultsFileSchema = Type.Object({
  schema_version: Type.Literal("1.0"), team_name: Type.String({ minLength: 1 }),
  model: Type.Object({ mode: Type.Literal("external_api"), name: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
  results: Type.Array(Type.Union([SuccessSchema, ErrorSchema]))
}, { additionalProperties: false });
