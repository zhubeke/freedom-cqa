import { Type } from "@sinclair/typebox";

const text = Type.String({ minLength: 1 });
export const AppealIdParamsSchema = Type.Object({ id: text }, { additionalProperties: false });
export const SubmitAppealBodySchema = Type.Object({
  evaluation_run_id: text, criterion_id: text, comment: text
}, { additionalProperties: false });
export const AppealDecisionBodySchema = Type.Object({
  status: Type.Union([Type.Literal("UNDER_REVIEW"), Type.Literal("CONFIRMED"), Type.Literal("OVERRIDDEN")]),
  reviewer: text, justification: text,
  // Domain validation checks the exact primitive against the saved criterion. An anyOf schema
  // would allow AJV to coerce numeric 0/1 into booleans before that check.
  override_value: Type.Optional(Type.Unknown()),
  revised_explanation: Type.Optional(text),
  revised_evidence_message_ids: Type.Optional(Type.Array(text))
}, { additionalProperties: false });
