import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import type { AppConfig } from "../../../config/config.js";
import type { ChecklistCriterion } from "../../checklist-management/domain/checklist.types.js";
import type { EvaluationBatchDocument } from "../../batch-evaluation/application/batch.types.js";
import { ORGANIZER_CRITERION_IDS, type OrganizerResults } from "./results.types.js";
import { validateOrganizerResults } from "./validate-results.js";
import { loadExportResult } from "./conversation-export.js";
import { ResultsExportError } from "./export-errors.js";

export { ResultsExportError } from "./export-errors.js";

export async function buildOrganizerResults(db: Db, config: AppConfig, batch: EvaluationBatchDocument) {
  if (!["completed", "completed_with_errors"].includes(batch.status)) throw new ResultsExportError("Only finished batches can be exported", 409);
  if (!config.teamName.trim()) throw new ResultsExportError("CQA_TEAM_NAME must be configured before export", 422);
  const version = await db.collection<{ _id: string; criteria: ChecklistCriterion[] }>("checklist_versions").findOne({ _id: batch.checklist_version_id });
  if (!version) throw new ResultsExportError("Checklist version is missing", 500);
  const conversations = await db.collection<{ conversation_id: string; message_count: number }>("conversations").find({ dataset_group_id: batch.dataset_group_id }, { projection: { conversation_id: 1, message_count: 1 } }).sort({ conversation_id: 1 }).toArray();
  const results: OrganizerResults["results"] = [];
  const modelNames = new Set<string>();
  const checklistsByConversation = new Map<string, ChecklistCriterion[]>();
  for (const item of batch.conversation_results) {
    if (!item.evaluation_run_id || item.status === "failed") {
      results.push({ conversation_id: item.conversation_id, status: "error", criteria: [], score: null, error: item.error || "Model evaluation failed." });
      continue;
    }
    try {
      const prepared = await loadExportResult(db, { dataset_group_id: batch.dataset_group_id, conversation_id: item.conversation_id }, item.evaluation_run_id);
      modelNames.add(prepared.modelName);
      checklistsByConversation.set(item.conversation_id, prepared.checklist);
      results.push(prepared.result);
    } catch (error) {
      results.push({ conversation_id: item.conversation_id, status: "error", criteria: [], score: null, error: error instanceof Error ? error.message : "Model evaluation failed." });
    }
  }
  results.sort((left, right) => left.conversation_id.localeCompare(right.conversation_id));
  if (modelNames.size > 1) throw new ResultsExportError("Batch evaluations use incompatible models. Export each model separately.", 422, [...modelNames]);
  const document: OrganizerResults = { schema_version: "1.0", team_name: config.teamName, model: { mode: "external_api", name: [...modelNames][0] || batch.model_id }, results };
  const validation = validateOrganizerResults(document, {
    datasetGroupId: batch.dataset_group_id,
    expectedConversationIds: batch.conversation_results.map((item) => item.conversation_id),
    messageCounts: new Map(conversations.map((item) => [item.conversation_id, item.message_count])),
    checklistCriteria: version.criteria,
    checklistsByConversation
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
