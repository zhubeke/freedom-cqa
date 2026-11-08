import { Type, type Static } from "@sinclair/typebox";

export const EvaluationParamsSchema = Type.Object({ id: Type.String({ minLength: 1 }) });
export const StartEvaluationBodySchema = Type.Object({
  checklist_version_id: Type.Optional(Type.String({ minLength: 1 })),
  dataset_group_id: Type.Optional(Type.String({ minLength: 1 }))
}, { additionalProperties: false });
export type StartEvaluationBody = Static<typeof StartEvaluationBodySchema>;
