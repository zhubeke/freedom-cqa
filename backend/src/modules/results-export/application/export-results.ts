import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import type { AppConfig } from "../../../config/config.js";
import type { ChecklistCriterion } from "../../checklist-management/domain/checklist.types.js";
import type { EvaluationBatchDocument } from "../../batch-evaluation/application/batch.types.js";
import { ORGANIZER_CRITERION_IDS, type OrganizerCriterion, type OrganizerCriterionId, type OrganizerResults } from "./results.types.js";
import { validateOrganizerResults } from "./validate-results.js";

export class ResultsExportError extends Error {
  constructor(message: string, public readonly statusCode = 400, public readonly details: string[] = []) { super(message); }
}

export async function buildOrganizerResults(db: Db, config: AppConfig, batch: EvaluationBatchDocument) {
  if (!["completed", "completed_with_errors"].includes(batch.status)) throw new ResultsExportError("Only finished batches can be exported", 409);
  if (!config.teamName) throw new ResultsExportError("CQA_TEAM_NAME must be configured before export", 422);
  const version = await db.collection<{ _id: string; criteria: ChecklistCriterion[] }>("checklist_versions").findOne({ _id: batch.checklist_version_id });
  if (!version) throw new ResultsExportError("Checklist version is missing", 500);
  const conversations = await db.collection<{ conversation_id: string; message_count: number }>("conversations").find({ dataset_group_id: batch.dataset_group_id }, { projection: { conversation_id: 1, message_count: 1 } }).sort({ conversation_id: 1 }).toArray();
  const results: OrganizerResults["results"] = [];
  const modelNames = new Set<string>();
  for (const item of batch.conversation_results) {
    if (!item.evaluation_run_id || item.status === "failed") {
      results.push({ conversation_id: item.conversation_id, status: "error", criteria: [], score: null, error: item.error || "Model evaluation failed." });
      continue;
    }
    const run = await db.collection("evaluation_runs").findOne({ run_id: item.evaluation_run_id });
    if (!run || run.status !== "completed" || typeof run.final_score !== "number" || typeof run.critical_flag !== "boolean") {
      results.push({ conversation_id: item.conversation_id, status: "error", criteria: [], score: null, error: "Model evaluation failed." });
      continue;
    }
    const stored = await db.collection("criterion_evaluations").find({ evaluation_run_id: item.evaluation_run_id, processing_state: "completed" }).sort({ display_order: 1 }).toArray();
    const criteria = stored.map((criterion) => {
      modelNames.add(String(criterion.model_id));
      return { criterion_id: String(criterion.external_code) as OrganizerCriterionId, value: criterion.raw_value as boolean | number | null, rationale: String(criterion.explanation), evidence_turns: criterion.evidence_turns as number[] };
    });
    results.push({ conversation_id: item.conversation_id, status: "ok", criteria: criteria as OrganizerCriterion[], score: { final_score: Math.round((Number(run.final_score) + Number.EPSILON) * 100) / 100, critical_flag: Boolean(run.critical_flag) } });
  }
  results.sort((left, right) => left.conversation_id.localeCompare(right.conversation_id));
  const document: OrganizerResults = { schema_version: "1.0", team_name: config.teamName, model: { mode: "external_api", name: [...modelNames].sort().join(", ") || batch.model_id }, results };
  const validation = validateOrganizerResults(document, {
    datasetGroupId: batch.dataset_group_id,
    expectedConversationIds: batch.conversation_results.map((item) => item.conversation_id),
    messageCounts: new Map(conversations.map((item) => [item.conversation_id, item.message_count])),
    checklistCriteria: version.criteria
  });
  if (!validation.valid) throw new ResultsExportError("Organizer results validation failed", 422, validation.errors);
  return { document, validation };
}

export async function writeOrganizerResultsAtomically(document: OrganizerResults, datasetGroupId: string) {
  const group = datasetGroupId.toLowerCase();
  if (group !== "dev" && group !== "prod") throw new ResultsExportError("Only DEV and PROD datasets have organizer export paths", 422);
  const defaultRoot = path.basename(process.cwd()) === "backend" ? path.resolve(process.cwd(), "../results") : path.resolve(process.cwd(), "results");
  const root = process.env.CQA_RESULTS_DIR?.trim() || defaultRoot;
  const directory = path.join(root, group);
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, "results.json");
  const temporary = path.join(directory, `.results-${randomUUID()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporary, target);
  return target;
}

export { ORGANIZER_CRITERION_IDS };
