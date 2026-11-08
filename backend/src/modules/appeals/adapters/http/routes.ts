import type { FastifyInstance } from "fastify";
import type { Producer } from "kafkajs";
import type { Db } from "mongodb";
import type { ChecklistCriterion } from "../../../checklist-management/domain/checklist.types.js";
import { ClassificationRepository } from "../../../action-classification/adapters/persistence/classification-repository.js";
import { publishClassificationRequested } from "../../../action-classification/application/events.js";
import { APPEAL_STATES, type AppealState } from "../../application/appeal.types.js";
import { AppealRepository } from "../persistence/appeal-repository.js";
import { calculateFinalizedEvaluation } from "../../application/finalize-appeal-score.js";
import { AppealDecisionError, decisionOutcome, validateDecisionValue, validateRevisedEvidence } from "../../application/review-decision.js";
import { AppealDecisionBodySchema, AppealIdParamsSchema, SubmitAppealBodySchema } from "../../schemas/appeal.schemas.js";

interface SubmitBody { evaluation_run_id: string; criterion_id: string; comment: string }
interface DecisionBody { status: "UNDER_REVIEW" | "CONFIRMED" | "OVERRIDDEN"; reviewer: string; justification: string; override_value?: boolean | number | null; revised_explanation?: string; revised_evidence_message_ids?: string[] }

export async function registerAppealRoutes(app: FastifyInstance, db: Db, producer: Producer) {
  const repository = new AppealRepository(db); await repository.ensureIndexes();
  app.post<{ Params: { id: string }; Body: SubmitBody }>("/api/v1/conversations/:id/appeals", { schema: { params: AppealIdParamsSchema, body: SubmitAppealBodySchema } }, async (request, reply) => {
    const comment = request.body?.comment?.trim();
    if (!comment) return reply.code(400).send({ error: "Appeal comment is required" });
    const run = await db.collection("evaluation_runs").findOne({ run_id: request.body.evaluation_run_id, conversation_id: request.params.id, status: "completed" });
    if (!run) return reply.code(404).send({ error: "Completed evaluation not found" });
    const criterion = await db.collection("criterion_evaluations").findOne({ evaluation_run_id: run.run_id, criterion_id: request.body.criterion_id, processing_state: "completed" });
    if (!criterion) return reply.code(404).send({ error: "Evaluated criterion not found" });
    const version = run.checklist_snapshot ?? await db.collection("checklist_versions").findOne({ _id: run.checklist_version_id });
    const criterionConfig = (version?.criteria as ChecklistCriterion[] | undefined)?.find((item) => item.id === criterion.criterion_id);
    if (!criterionConfig) return reply.code(409).send({ error: "The evaluation checklist snapshot is unavailable" });
    const open = await repository.collection().findOne({ evaluation_run_id: run.run_id, criterion_id: criterion.criterion_id, status: { $in: ["OPEN", "UNDER_REVIEW"] } });
    if (open) return reply.code(409).send({ error: "An active appeal already exists for this criterion", appeal_id: open.appeal_id });
    const appeal = await repository.create({ evaluation_run_id: String(run.run_id), conversation_id: request.params.id, dataset_group_id: String(run.dataset_group_id), criterion_id: String(criterion.criterion_id), criterion_name: String(criterion.criterion_name), comment, original_evaluation: { raw_value: criterion.raw_value as boolean | number | null, explanation: criterion.explanation ? String(criterion.explanation) : null, evidence_message_ids: (criterion.evidence_message_ids ?? []) as string[], evidence_turns: (criterion.evidence_turns ?? []) as number[], weighted_contribution: typeof criterion.weighted_contribution === "number" ? criterion.weighted_contribution : null, answer_type: criterionConfig.answer_type, allowed_values: criterionConfig.numeric_scale.map((option) => option.value), na_enabled: criterionConfig.na_enabled, criterion_weight: criterionConfig.weight, scale_maximum: criterionConfig.answer_type === "numeric" ? Math.max(...criterionConfig.numeric_scale.map(option => option.value)) : 1, numeric_scale: structuredClone(criterionConfig.numeric_scale) } });
    return reply.code(201).send(stripId(appeal));
  });
  app.get<{ Params: { id: string } }>("/api/v1/conversations/:id/appeals", async (request) => repository.list({ conversation_id: request.params.id }, 250));
  app.get("/api/v1/appeals/summary", async () => {
    const [total, pending, completed] = await Promise.all([
      repository.collection().countDocuments({}),
      repository.collection().countDocuments({ status: { $in: ["OPEN", "UNDER_REVIEW"] } }),
      repository.collection().countDocuments({ status: { $in: ["CONFIRMED", "OVERRIDDEN"] } })
    ]);
    return { total, pending, completed };
  });
  app.get<{ Querystring: { status?: string; limit?: string } }>("/api/v1/appeals", async (request, reply) => {
    const status = request.query.status?.toUpperCase();
    if (status && !APPEAL_STATES.includes(status as AppealState)) return reply.code(400).send({ error: "Invalid appeal status" });
    if (request.query.limit === "all") return repository.list(status ? { status } : {}, 0);
    const requestedLimit = Number(request.query.limit ?? 100);
    if (!Number.isFinite(requestedLimit)) return reply.code(400).send({ error: "Appeal limit must be a number" });
    return repository.list(status ? { status } : {}, Math.min(500, Math.max(1, Math.trunc(requestedLimit))));
  });
  app.post<{ Params: { id: string }; Body: DecisionBody }>("/api/v1/appeals/:id/decision", { schema: { params: AppealIdParamsSchema, body: AppealDecisionBodySchema } }, async (request, reply) => {
    const body = request.body; const reviewer = typeof body?.reviewer === "string" ? body.reviewer.trim() : ""; const justification = typeof body?.justification === "string" ? body.justification.trim() : "";
    if (!reviewer || !justification) return reply.code(400).send({ error: "Reviewer and justification are required" });
    if (!(["UNDER_REVIEW", "CONFIRMED", "OVERRIDDEN"] as string[]).includes(body.status)) return reply.code(400).send({ error: "Invalid decision status" });
    const appeal = await repository.find(request.params.id); if (!appeal) return reply.code(404).send({ error: "Appeal not found" });
    if (["CONFIRMED", "OVERRIDDEN"].includes(appeal.status)) return reply.code(409).send({ error: "Appeal already has a final decision" });
    if (body.status === "OVERRIDDEN" && !("override_value" in body)) return reply.code(400).send({ error: "Override value is required" });
    if (body.status === "OVERRIDDEN") {
      const run = await db.collection("evaluation_runs").findOne({ run_id: appeal.evaluation_run_id });
      const version = run?.checklist_snapshot ?? (run ? await db.collection("checklist_versions").findOne({ _id: run.checklist_version_id }) : null);
      const criterion = (version?.criteria as ChecklistCriterion[] | undefined)?.find((item) => item.id === appeal.criterion_id);
      if (!criterion) return reply.code(409).send({ error: "The evaluation checklist snapshot is unavailable" });
      try { validateDecisionValue(criterion, body.override_value); }
      catch (error) { if (error instanceof AppealDecisionError) return reply.code(400).send({ error: error.message }); throw error; }
    }
    const effectiveValue = body.status === "OVERRIDDEN" ? body.override_value! : appeal.original_evaluation.raw_value;
    let effectiveExplanation = appeal.original_evaluation.explanation;
    let effectiveEvidence = appeal.original_evaluation.evidence_message_ids;
    if (body.status === "OVERRIDDEN") {
      if (body.revised_explanation !== undefined) {
        if (typeof body.revised_explanation !== "string" || !body.revised_explanation.trim()) return reply.code(400).send({ error: "Revised evaluation rationale must not be empty" });
        effectiveExplanation = body.revised_explanation.trim();
      }
      if (body.revised_evidence_message_ids !== undefined) {
        const conversation = await db.collection("conversations").findOne({ conversation_id: appeal.conversation_id, dataset_group_id: appeal.dataset_group_id }, { projection: { transcript: 1 } });
        if (!conversation) return reply.code(409).send({ error: "The original conversation transcript is unavailable" });
        try { effectiveEvidence = validateRevisedEvidence(body.revised_evidence_message_ids, (conversation.transcript ?? []) as Array<{ message_id?: string }>); }
        catch (error) { if (error instanceof AppealDecisionError) return reply.code(400).send({ error: error.message }); throw error; }
      }
    } else if (body.revised_explanation !== undefined || body.revised_evidence_message_ids !== undefined) return reply.code(400).send({ error: "Choose change evaluation to revise reasoning or evidence" });
    const effective = { effective_value: effectiveValue, effective_explanation: effectiveExplanation, effective_evidence_message_ids: effectiveEvidence };
    const outcome = decisionOutcome(appeal.original_evaluation, effective);
    const decision = { reviewer, justification, decided_at: new Date(), ...effective, outcome };
    const updated = await repository.collection().findOneAndUpdate({ appeal_id: appeal.appeal_id, status: { $in: ["OPEN", "UNDER_REVIEW"] } }, { $set: { status: body.status, decision, updated_at: new Date() } }, { returnDocument: "after", projection: { _id: 0 } });
    if (!updated) return reply.code(409).send({ error: "Appeal changed while it was being reviewed" });
    if (body.status !== "UNDER_REVIEW") {
      await recalculateFinalizedScore(db, appeal.evaluation_run_id);
      if (outcome !== "UPHELD") {
        const classifications = new ClassificationRepository(db);
        const queued = await classifications.queue(appeal.dataset_group_id, appeal.conversation_id, true);
        if (!queued.duplicate) await publishClassificationRequested(producer, queued.event).catch((error) => request.log.warn({ error }, "Appeal reclassification publication deferred"));
      }
    }
    return updated;
  });
}

async function recalculateFinalizedScore(db: Db, runId: string) {
  const run = await db.collection("evaluation_runs").findOne({ run_id: runId }); if (!run) return;
  const version = run.checklist_snapshot ?? await db.collection("checklist_versions").findOne({ _id: run.checklist_version_id }); if (!version) return;
  const criteria = await db.collection("criterion_evaluations").find({ evaluation_run_id: runId }).toArray();
  const decisions = await db.collection("appeals").find({ evaluation_run_id: runId, status: "OVERRIDDEN" }).sort({ updated_at: 1 }).toArray();
  const score = calculateFinalizedEvaluation((version.criteria ?? []) as ChecklistCriterion[], criteria.map((item) => ({ criterion_id: String(item.criterion_id), raw_value: item.raw_value as boolean | number | null })), decisions.map((item) => ({ criterion_id: String(item.criterion_id), status: String(item.status), decision: item.decision as { effective_value?: boolean | number | null } | null })));
  await db.collection("evaluation_runs").updateOne({ run_id: runId }, { $set: { finalized_score: score.finalScore, finalized_critical_flag: score.criticalFlag, finalized_at: new Date() } });
}

function stripId<T extends { _id: string }>(value: T) { const { _id, ...rest } = value; void _id; return rest; }
