import { randomUUID } from "node:crypto";
import type { EvaluationRunDocument } from "./evaluation.types.js";

export function evaluationEvent(run: EvaluationRunDocument) {
  return { event_id: run.event_id, correlation_id: run.correlation_id, conversation_id: run.conversation_id, evaluation_run_id: run.run_id,
    checklist_version_id: run.checklist_version_id, timestamp: run.requested_at.toISOString(), payload_reference: `evaluation_runs/${run.run_id}` };
}
export function criterionEvent(run: EvaluationRunDocument, criterionId: string) {
  return { event_id: randomUUID(), correlation_id: run.correlation_id, conversation_id: run.conversation_id, evaluation_run_id: run.run_id,
    checklist_version_id: run.checklist_version_id, criterion_id: criterionId, timestamp: new Date().toISOString(), payload_reference: `evaluation_runs/${run.run_id}` };
}
