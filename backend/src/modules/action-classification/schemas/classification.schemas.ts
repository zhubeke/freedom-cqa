import { Type, type Static } from "@sinclair/typebox";
import { ACTION_CODES } from "../application/action.types.js";
export const ClassificationParamsSchema = Type.Object({ id: Type.String({ minLength: 1 }) });
export const DatasetParamsSchema = Type.Object({ groupId: Type.String({ minLength: 1 }) });
export const ClassificationQuerySchema = Type.Object({ datasetGroupId: Type.Optional(Type.String()), force: Type.Optional(Type.Boolean()) });
export const VerifyLabelBodySchema = Type.Object({ action: Type.Union(ACTION_CODES.map((code) => Type.Literal(code))), reviewer: Type.String({ minLength: 1, maxLength: 120 }) }, { additionalProperties: false });
export const DatasetClassifyBodySchema = Type.Object({ force: Type.Optional(Type.Boolean()), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 10000 })) }, { additionalProperties: false });
export type VerifyLabelBody = Static<typeof VerifyLabelBodySchema>;
export type DatasetClassifyBody = Static<typeof DatasetClassifyBodySchema>;
