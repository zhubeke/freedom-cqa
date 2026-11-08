import { createHash, randomUUID } from "node:crypto";
import type { DatasetEnvelope } from "../../conversation-ingestion/schemas/dataset.js";
import type { ImportRepository } from "./import-repository.js";

export async function createImport(repository: ImportRepository, dataset: DatasetEnvelope, rawBytes: Buffer) {
  const importId = randomUUID();
  const document = {
    import_id: importId,
    dataset_group_id: dataset.data.dataset_group_id,
    content_hash: createHash("sha256").update(rawBytes).digest("hex"),
    original_payload: dataset,
    status: "queued" as const,
    requested_at: new Date(),
    processed_at: null,
    total_records: dataset.data.total_records,
    processed_count: 0,
    last_error: null,
    publication_status: "pending" as const,
    publication_attempts: 0,
    event_id: randomUUID()
  };
  await repository.collection().insertOne(document);
  return document;
}
