import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

const ChatTimestamp = Type.String({ pattern: "^(?:[0-9]+):[0-5][0-9]$" });
const IsoTimestamp = Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$" });

export const TranscriptMessageSchema = Type.Object({
  timestamp: Type.Union([ChatTimestamp, IsoTimestamp]),
  speaker: Type.Union([Type.Literal("client"), Type.Literal("operator"), Type.Literal("bot"), Type.Literal("system")]),
  text: Type.String()
}, { additionalProperties: true });

export const SourceRecordSchema = Type.Object({
  conversation_id: Type.String({ minLength: 1 }),
  channel: Type.Union([Type.Literal("agent chat"), Type.Literal("voice call")]),
  language: Type.Union([Type.Literal("RU"), Type.Literal("KZ"), Type.Literal("EN")]),
  transcript: Type.Array(TranscriptMessageSchema),
  audio_url: Type.Union([Type.String(), Type.Null()])
}, { additionalProperties: true });

export const DatasetEnvelopeSchema = Type.Object({
  error: Type.String(),
  isSuccess: Type.Literal(true),
  data: Type.Object({
    dataset_group_id: Type.String({ minLength: 1 }),
    total_records: Type.Integer({ minimum: 0 }),
    records: Type.Array(SourceRecordSchema)
  }, { additionalProperties: true })
}, { additionalProperties: true });

export type DatasetEnvelope = Static<typeof DatasetEnvelopeSchema>;
export type SourceRecord = Static<typeof SourceRecordSchema>;

export class DatasetValidationError extends Error {
  constructor(public readonly details: string[]) {
    super(`Invalid dataset: ${details.join("; ")}`);
    this.name = "DatasetValidationError";
  }
}

export function validateDataset(value: unknown): DatasetEnvelope {
  if (!Value.Check(DatasetEnvelopeSchema, value)) {
    const details = [...Value.Errors(DatasetEnvelopeSchema, value)].map((error) => `${error.path || "/"}: ${error.message}`);
    throw new DatasetValidationError(details);
  }
  const dataset = value as DatasetEnvelope;
  if (dataset.data.total_records !== dataset.data.records.length) {
    throw new DatasetValidationError([`/data/total_records: expected ${dataset.data.records.length}, received ${dataset.data.total_records}`]);
  }
  const ids = new Set<string>();
  for (const [recordIndex, record] of dataset.data.records.entries()) {
    if (ids.has(record.conversation_id)) {
      throw new DatasetValidationError([`/data/records/${recordIndex}/conversation_id: duplicate ${record.conversation_id}`]);
    }
    ids.add(record.conversation_id);
    const expectsIso = record.channel === "voice call";
    for (const [messageIndex, message] of record.transcript.entries()) {
      const valid = expectsIso
        ? !Number.isNaN(Date.parse(message.timestamp)) && /(?:Z|[+-]\d{2}:\d{2})$/.test(message.timestamp)
        : /^\d+:[0-5]\d$/.test(message.timestamp);
      if (!valid) throw new DatasetValidationError([`/data/records/${recordIndex}/transcript/${messageIndex}/timestamp: invalid for ${record.channel}`]);
    }
  }
  return dataset;
}
