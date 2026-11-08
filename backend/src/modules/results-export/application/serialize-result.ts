import type { ChecklistCriterion } from "../../checklist-management/domain/checklist.types.js";
import type { EvaluationRunDocument, CriterionEvaluationDocument } from "../../evaluation-orchestration/application/evaluation.types.js";
import type { AppealDocument } from "../../appeals/application/appeal.types.js";
import { ORGANIZER_CRITERION_IDS, type OrganizerCriterionId, type OrganizerSuccess } from "./results.types.js";
import { exportCriterionId } from "./validate-results.js";

export interface ExportConversation {
  dataset_group_id: string;
  conversation_id: string;
  transcript: Array<{ message_id: string }>;
}
export type ExportRun = Pick<EvaluationRunDocument, "status" | "final_score" | "critical_flag" | "finalized_at" | "finalized_score" | "finalized_critical_flag">;
export type ExportCriterion = Pick<CriterionEvaluationDocument, "criterion_id" | "external_code" | "raw_value" | "is_na" | "explanation" | "evidence_message_ids" | "processing_state" | "model_id">;
export type ExportAppeal = Pick<AppealDocument, "criterion_id" | "status" | "decision" | "updated_at">;

/** Shared by individual, selected, and organizer batch exports. No score is recalculated here. */
export function serializeEvaluation(input: {
  conversation: ExportConversation; run: ExportRun; criteria: ExportCriterion[];
  checklist: ChecklistCriterion[]; appeals?: ExportAppeal[];
}): { result: OrganizerSuccess; modelName: string } {
  const { conversation, run, criteria, checklist } = input;
  const finalScore = run.finalized_at ? run.finalized_score : run.final_score;
  const criticalFlag = run.finalized_at ? run.finalized_critical_flag : run.critical_flag;
  if (run.status !== "completed" || typeof finalScore !== "number" || !Number.isFinite(finalScore)
    || typeof criticalFlag !== "boolean") throw new Error("A completed evaluation with a valid final score is required");
  const enabled = checklist.filter(c => c.enabled);
  if (enabled.length !== 8 || criteria.length !== 8 || criteria.some(c => c.processing_state !== "completed")) {
    throw new Error("All eight original checklist criteria must be completed for export");
  }
  const models = new Set(criteria.map(c => c.model_id?.trim()).filter(Boolean));
  if (models.size !== 1 || criteria.some(c => !c.model_id?.trim())) {
    throw new Error("Evaluation uses incompatible or unavailable actual model metadata");
  }
  const turns = new Map(conversation.transcript.map((message, index) => [message.message_id, index + 1]));
  const decisions = run.finalized_at ? [...(input.appeals ?? [])].filter(a => a.status === "OVERRIDDEN" && a.decision)
    .sort((a, b) => new Date(a.decision!.decided_at ?? a.updated_at).getTime() - new Date(b.decision!.decided_at ?? b.updated_at).getTime()) : [];
  const overrides = new Map(decisions.map(a => [a.criterion_id, a.decision!]));
  const serialized = enabled.map(config => {
    const stored = criteria.find(c => c.criterion_id === config.id);
    if (!stored) throw new Error(`Missing completed criterion ${config.code}`);
    const code = exportCriterionId(config);
    if (!ORGANIZER_CRITERION_IDS.includes(code as OrganizerCriterionId)) throw new Error(`Checklist criterion ${config.code} is incompatible with export schema 1.0`);
    const override = overrides.get(config.id);
    const value = override ? override.effective_value : stored.is_na ? null : stored.raw_value;
    const rationale = override ? override.effective_explanation ?? override.justification : stored.explanation;
    if (typeof rationale !== "string" || !rationale.trim()) throw new Error(`Criterion ${code} has no rationale`);
    const evidence = [...new Set(override?.effective_evidence_message_ids ?? stored.evidence_message_ids ?? [])].map(id => {
      // A suffix is accepted only if it resolves to the selected conversation's stable ID.
      const turn = turns.get(id) ?? (!id.includes(":") ? turns.get(`${conversation.conversation_id}:${id}`) : undefined);
      if (turn === undefined) throw new Error(`Criterion ${code} references an unknown transcript message`);
      return turn;
    });
    return { criterion_id: code as OrganizerCriterionId, value, rationale, evidence_turns: evidence };
  });
  serialized.sort((a, b) => ORGANIZER_CRITERION_IDS.indexOf(a.criterion_id) - ORGANIZER_CRITERION_IDS.indexOf(b.criterion_id));
  return {
    modelName: [...models][0]!,
    result: { conversation_id: conversation.conversation_id, status: "ok", criteria: serialized,
      score: { final_score: finalScore, critical_flag: criticalFlag } }
  };
}
