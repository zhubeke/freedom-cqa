import { randomUUID } from "node:crypto";
import type { EvaluationBatchDocument } from "./batch.types.js";

export function batchRequestedEvent(batch: EvaluationBatchDocument) {
  return {
    event_id: batch.event_id,
    correlation_id: batch.correlation_id,
    batch_id: batch.batch_id,
    dataset_group_id: batch.dataset_group_id,
    checklist_version_id: batch.checklist_version_id,
    timestamp: batch.created_at.toISOString(),
    payload_reference: `evaluation_batches/${batch.batch_id}`
  };
}

export function batchCompletedEvent(batch: EvaluationBatchDocument) {
  return {
    event_id: randomUUID(),
    correlation_id: batch.correlation_id,
    batch_id: batch.batch_id,
    dataset_group_id: batch.dataset_group_id,
    checklist_version_id: batch.checklist_version_id,
    status: batch.status,
    timestamp: (batch.finished_at ?? new Date()).toISOString(),
    payload_reference: `evaluation_batches/${batch.batch_id}`
  };
}
