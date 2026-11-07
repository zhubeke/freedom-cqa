import { Type } from "@sinclair/typebox";

export const NormalizedCustomWorkerResponseSchema = Type.Object({
  response: Type.String(),
  model_id: Type.String({ minLength: 1 }),
  usage: Type.Optional(Type.Object({
    prompt_tokens: Type.Optional(Type.Integer({ minimum: 0 })),
    completion_tokens: Type.Optional(Type.Integer({ minimum: 0 })),
    total_tokens: Type.Optional(Type.Integer({ minimum: 0 }))
  }, { additionalProperties: true }))
}, { additionalProperties: true });
