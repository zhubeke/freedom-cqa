import type { ChecklistCriterion } from "../../checklist-management/domain/checklist.types.js";
import { calculateEvaluationScore } from "../../score-calculation/application/calculate-evaluation-score.js";
import { ORGANIZER_CRITERION_IDS, type OrganizerCriterionId, type OrganizerResults } from "./results.types.js";

const ALLOWED: Record<OrganizerCriterionId, ReadonlyArray<boolean | number | null>> = {
  contact: [true, false], discovery: [true, false, null], identification: [true, false, null],
  consultation: [0, 5, 10, 15, 20, null], empathy: [true, false], dialogue: [0, 4, 7, 10],
  closure: [true, false, null], critical: [true, false]
};

export interface ExportValidationContext {
  datasetGroupId: string;
  expectedConversationIds: string[];
  messageCounts: Map<string, number>;
  checklistCriteria: ChecklistCriterion[];
}

export function validateOrganizerResults(document: OrganizerResults, context: ExportValidationContext) {
  const errors: string[] = [];
  if (document.schema_version !== "1.0") errors.push("schema_version must be 1.0");
  if (!document.team_name.trim()) errors.push("CQA_TEAM_NAME is not configured");
  if (document.model.mode !== "external_api" || !document.model.name.trim()) errors.push("model metadata is invalid");
  const expectedCount = context.datasetGroupId.toUpperCase() === "DEV" ? 65 : context.datasetGroupId.toUpperCase() === "PROD" ? 10 : context.expectedConversationIds.length;
  if (document.results.length !== expectedCount) errors.push(`expected ${expectedCount} results, received ${document.results.length}`);
  const expected = new Set(context.expectedConversationIds);
  const seen = new Set<string>();
  for (const result of document.results) {
    if (!expected.has(result.conversation_id)) errors.push(`unexpected conversation_id ${result.conversation_id}`);
    if (seen.has(result.conversation_id)) errors.push(`duplicate conversation_id ${result.conversation_id}`);
    seen.add(result.conversation_id);
    if (result.status === "error") {
      if (result.criteria.length !== 0 || result.score !== null || !result.error.trim()) errors.push(`${result.conversation_id}: malformed error result`);
      continue;
    }
    const ids = result.criteria.map((criterion) => criterion.criterion_id);
    if (ids.length !== 8 || ORGANIZER_CRITERION_IDS.some((id) => ids.filter((value) => value === id).length !== 1)) errors.push(`${result.conversation_id}: criteria must contain each required ID once`);
    const count = context.messageCounts.get(result.conversation_id) ?? 0;
    for (const criterion of result.criteria) {
      if (!ALLOWED[criterion.criterion_id]?.some((allowed) => Object.is(allowed, criterion.value))) errors.push(`${result.conversation_id}/${criterion.criterion_id}: invalid value`);
      if (!criterion.rationale.trim()) errors.push(`${result.conversation_id}/${criterion.criterion_id}: rationale is blank`);
      if (criterion.evidence_turns.length === 0 || criterion.evidence_turns.some((turn) => !Number.isInteger(turn) || turn < 1 || turn > count)) errors.push(`${result.conversation_id}/${criterion.criterion_id}: invalid evidence_turns`);
    }
    const values = new Map(context.checklistCriteria.map((criterion) => [criterion.id, result.criteria.find((item) => item.criterion_id === ({
      "freedom-criterion-01": "contact", "freedom-criterion-02": "discovery", "freedom-criterion-03": "identification", "freedom-criterion-04": "consultation",
      "freedom-criterion-05": "empathy", "freedom-criterion-06": "dialogue", "freedom-criterion-07": "closure", "freedom-criterion-08": "critical"
    } as Record<string, string>)[criterion.id])?.value ?? null]));
    const calculated = calculateEvaluationScore(context.checklistCriteria, values);
    if (calculated.finalScore === null || Math.abs(calculated.finalScore - result.score.final_score) > 0.001) errors.push(`${result.conversation_id}: final_score is incorrect`);
    if (calculated.criticalFlag !== result.score.critical_flag) errors.push(`${result.conversation_id}: critical_flag is incorrect`);
  }
  for (const id of expected) if (!seen.has(id)) errors.push(`missing conversation_id ${id}`);
  return { valid: errors.length === 0, errors };
}
