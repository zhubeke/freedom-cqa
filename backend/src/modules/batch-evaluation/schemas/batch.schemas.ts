import { Type, type Static } from "@sinclair/typebox";

export const CreateBatchBodySchema = Type.Object({
  dataset_group_id: Type.String({ minLength: 1 }),
  checklist_version_id: Type.String({ minLength: 1 }),
  max_conversations: Type.Optional(Type.Union([Type.Literal(2), Type.Literal(3)]))
}, { additionalProperties: false });
export const BatchParamsSchema = Type.Object({ id: Type.String({ minLength: 1 }) }, { additionalProperties: false });
export type CreateBatchBody = Static<typeof CreateBatchBodySchema>;
