import { Type, type Static } from "@sinclair/typebox";

const NonEmptyString = Type.String({ minLength: 1 });
export const NumericScaleOptionSchema = Type.Object({ value: Type.Number(), description: NonEmptyString }, { additionalProperties: false });
export const ChecklistSectionSchema = Type.Object({
  id: NonEmptyString, display_order: Type.Integer({ minimum: 0 }), name: NonEmptyString
}, { additionalProperties: false });
export const ChecklistCriterionSchema = Type.Object({
  id: NonEmptyString,
  code: NonEmptyString,
  display_order: Type.Integer({ minimum: 0 }),
  section_id: NonEmptyString,
  source_name: Type.String(),
  display_name: NonEmptyString,
  description: Type.String(),
  evaluation_instructions: Type.String(),
  answer_type: Type.Union([Type.Literal("boolean"), Type.Literal("numeric"), Type.Literal("flag")]),
  weight: Type.Number({ minimum: 0 }),
  numeric_scale: Type.Array(NumericScaleOptionSchema),
  na_enabled: Type.Boolean(),
  na_rule: Type.String(),
  enabled: Type.Boolean()
}, { additionalProperties: false });
export const ConfigurationSchema = Type.Object({
  sections: Type.Array(ChecklistSectionSchema, { minItems: 1 }),
  criteria: Type.Array(ChecklistCriterionSchema, { minItems: 1 })
}, { additionalProperties: false });

export const CreateChecklistBodySchema = Type.Object({
  name: NonEmptyString,
  description: Type.String(),
  sections: Type.Array(ChecklistSectionSchema, { minItems: 1 }),
  criteria: Type.Array(ChecklistCriterionSchema, { minItems: 1 })
}, { additionalProperties: false });
export const CreateVersionBodySchema = Type.Object({
  name: NonEmptyString,
  description: Type.String(),
  created_from_version_id: NonEmptyString,
  sections: Type.Array(ChecklistSectionSchema, { minItems: 1 }),
  criteria: Type.Array(ChecklistCriterionSchema, { minItems: 1 })
}, { additionalProperties: false });
export const UpdateChecklistBodySchema = Type.Object({
  name: NonEmptyString,
  description: Type.String(),
  expected_active_version_id: NonEmptyString,
  sections: Type.Array(ChecklistSectionSchema, { minItems: 1 }),
  criteria: Type.Array(ChecklistCriterionSchema, { minItems: 1 })
}, { additionalProperties: false });
export const ActivateVersionBodySchema = Type.Object({
  version_id: NonEmptyString,
  expected_active_version_id: Type.Union([Type.String(), Type.Null()])
}, { additionalProperties: false });
export const IdParamsSchema = Type.Object({ id: NonEmptyString });
export const VersionParamsSchema = Type.Object({ id: NonEmptyString, versionId: NonEmptyString });

export type CreateChecklistBody = Static<typeof CreateChecklistBodySchema>;
export type CreateVersionBody = Static<typeof CreateVersionBodySchema>;
export type ActivateVersionBody = Static<typeof ActivateVersionBodySchema>;
export type UpdateChecklistBody = Static<typeof UpdateChecklistBodySchema>;
