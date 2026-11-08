import type { Db } from "mongodb";
import type { AppConfig } from "../../../config/config.js";
import type { ChecklistCriterion } from "../../checklist-management/domain/checklist.types.js";
import type { EvaluationRunDocument, CriterionEvaluationDocument } from "../../evaluation-orchestration/application/evaluation.types.js";
import type { AppealDocument } from "../../appeals/application/appeal.types.js";
import { ConversationQueryRepository } from "../../conversation-query/adapters/persistence/conversation-query-repository.js";
import { listConversations } from "../../conversation-query/application/list-conversations.js";
import { serializeEvaluation, type ExportConversation } from "./serialize-result.js";
import type { OrganizerResults, OrganizerSuccess } from "./results.types.js";
import { validateOrganizerResults } from "./validate-results.js";
import { ResultsExportError } from "./export-errors.js";

export interface ConversationIdentity { dataset_group_id?: string; conversation_id: string }
export interface ExportSelection { conversations?: ConversationIdentity[]; matching?: Record<string, string> }
export interface ExportIssue extends ConversationIdentity { error: string }
interface PreparedResult { identity: ConversationIdentity; result: OrganizerSuccess; modelName: string; checklist: ChecklistCriterion[]; messageCount: number }

export async function loadExportResult(db: Db, identity: ConversationIdentity, preferredRunId?: string): Promise<PreparedResult> {
  const conversationFilter = { conversation_id: identity.conversation_id, ...(identity.dataset_group_id ? { dataset_group_id: identity.dataset_group_id } : {}) };
  const matches = await db.collection<ExportConversation>("conversations").find(conversationFilter, { projection: { transcript: 1, dataset_group_id: 1, conversation_id: 1 } }).limit(2).toArray();
  const conversation = matches[0];
  if (!conversation) throw new Error("Conversation not found");
  if (matches.length > 1) throw new Error("Conversation ID is ambiguous; specify its dataset group");
  const runFilter = { dataset_group_id: conversation.dataset_group_id, conversation_id: conversation.conversation_id, status: "completed" as const };
  const runs = db.collection<EvaluationRunDocument>("evaluation_runs");
  const approved = await runs.findOne({ ...runFilter, finalized_at: { $ne: null } }, { sort: { finalized_at: -1, completed_at: -1 } });
  const run = approved ?? (preferredRunId ? await runs.findOne({ ...runFilter, run_id: preferredRunId })
    : await runs.findOne(runFilter, { sort: { completed_at: -1, requested_at: -1 } }));
  if (!run) throw new Error("No completed evaluation is available");
  const version = run.checklist_snapshot ?? await db.collection<{ _id: string; criteria: ChecklistCriterion[] }>("checklist_versions").findOne({ _id: run.checklist_version_id });
  if (!version || !Array.isArray(version.criteria)) throw new Error("Historical checklist configuration is unavailable");
  const checklist = version.criteria as ChecklistCriterion[];
  const [criteria, appeals] = await Promise.all([
    db.collection<CriterionEvaluationDocument>("criterion_evaluations").find({ evaluation_run_id: run.run_id }).toArray(),
    db.collection<AppealDocument>("appeals").find({ evaluation_run_id: run.run_id, status: "OVERRIDDEN" }).sort({ updated_at: 1 }).toArray()
  ]);
  const serialized = serializeEvaluation({ conversation, run, criteria, checklist, appeals });
  // Per-result validation also handles selections containing different historical checklist versions.
  const validation = validateOrganizerResults({ schema_version: "1.0", team_name: "validation", model: { mode: "external_api", name: serialized.modelName }, results: [serialized.result] }, {
    scope: "selection", datasetGroupId: conversation.dataset_group_id, expectedConversationIds: [conversation.conversation_id],
    messageCounts: new Map([[conversation.conversation_id, conversation.transcript.length]]), checklistCriteria: checklist
  });
  if (!validation.valid) throw new Error(validation.errors.join("; "));
  return { ...serialized, identity: { dataset_group_id: conversation.dataset_group_id, conversation_id: conversation.conversation_id }, checklist, messageCount: conversation.transcript.length };
}

export async function resolveExportSelection(db: Db, selection: ExportSelection): Promise<ConversationIdentity[]> {
  if (selection.conversations?.length && selection.matching) throw new ResultsExportError("Choose explicit conversations or matching filters, not both");
  let identities = selection.conversations;
  if (selection.matching) {
    identities = [];
    const repository = new ConversationQueryRepository(db);
    let page = 1;
    while (true) {
      let result: Awaited<ReturnType<typeof listConversations>>;
      try { result = await listConversations(repository, { ...selection.matching, page: String(page), pageSize: "100" }); }
      catch (error) { throw new ResultsExportError(error instanceof Error ? error.message : "Invalid export filters"); }
      if (result.pagination.total > 5000) throw new ResultsExportError("Export supports at most 5000 selected conversations");
      identities.push(...result.items.map(item => {
        const record = item as unknown as { dataset_group_id: string; conversation_id: string };
        return { dataset_group_id: String(record.dataset_group_id), conversation_id: String(record.conversation_id) };
      }));
      if (page >= result.pagination.totalPages) break;
      page += 1;
    }
  }
  if (!Array.isArray(identities) || identities.length === 0 || identities.length > 5000) throw new ResultsExportError("Select 1-5000 conversations to export");
  if (identities.some(item => !item || typeof item.conversation_id !== "string" || !item.conversation_id.trim()
    || (item.dataset_group_id !== undefined && (typeof item.dataset_group_id !== "string" || !item.dataset_group_id.trim())))) {
    throw new ResultsExportError("Every selected conversation must have a valid identity");
  }
  const seen = new Set<string>();
  return identities.filter(item => { const key = JSON.stringify([item.dataset_group_id ?? null, item.conversation_id]); if (seen.has(key)) return false; seen.add(key); return true; });
}

async function prepareExport(db: Db, config: AppConfig, selection: ExportSelection) {
  const identities = await resolveExportSelection(db, selection);
  const prepared: PreparedResult[] = [];
  const issues: ExportIssue[] = [];
  const ids = new Set<string>();
  for (const identity of identities) {
    if (ids.has(identity.conversation_id)) { issues.push({ ...identity, error: "The schema cannot distinguish duplicate conversation IDs across datasets" }); continue; }
    try {
      prepared.push(await loadExportResult(db, identity));
      ids.add(identity.conversation_id);
    }
    catch (error) { issues.push({ ...identity, error: error instanceof Error ? error.message : "Evaluation is unavailable" }); }
  }
  const modelNames = [...new Set(prepared.map(item => item.modelName))];
  const preview = { eligible: prepared.map(item => item.identity), issues,
    model_conflict: modelNames.length > 1, models: modelNames.map(name => ({ mode: "external_api" as const, name })),
    configured: Boolean(config.teamName.trim()) };
  return { prepared, preview };
}

export async function previewConversationExport(db: Db, config: AppConfig, selection: ExportSelection) {
  return (await prepareExport(db, config, selection)).preview;
}

export async function buildSelectedOrganizerResults(db: Db, config: AppConfig, selection: ExportSelection): Promise<OrganizerResults> {
  const { prepared, preview } = await prepareExport(db, config, selection);
  if (!preview.configured) throw new ResultsExportError("CQA_TEAM_NAME must be configured before export", 422);
  if (preview.issues.length) throw new ResultsExportError("Some selected conversations cannot be exported. Review the export preview and explicitly choose eligible records.", 422, preview.issues.map(issue => `${issue.conversation_id}: ${issue.error}`));
  if (preview.model_conflict) throw new ResultsExportError("Selected evaluations use incompatible models. Export each model separately.", 422, preview.models.map(model => model.name));
  const document: OrganizerResults = { schema_version: "1.0", team_name: config.teamName,
    model: { mode: "external_api", name: prepared[0]!.modelName }, results: prepared.map(item => item.result).sort((a, b) => a.conversation_id.localeCompare(b.conversation_id)) };
  const validation = validateOrganizerResults(document, { scope: "selection", datasetGroupId: "selection",
    expectedConversationIds: prepared.map(item => item.identity.conversation_id),
    messageCounts: new Map(prepared.map(item => [item.identity.conversation_id, item.messageCount])), checklistCriteria: [],
    checklistsByConversation: new Map(prepared.map(item => [item.identity.conversation_id, item.checklist])) });
  if (!validation.valid) throw new ResultsExportError("Export validation failed", 422, validation.errors);
  return document;
}
