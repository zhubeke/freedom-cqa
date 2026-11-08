import { randomUUID } from "node:crypto";
import type { Consumer, EachMessagePayload, Producer } from "kafkajs";
import type { Db } from "mongodb";
import type { AppConfig } from "../../../../config/config.js";
import type { ChecklistVersionRecord } from "../../../checklist-management/domain/checklist.types.js";
import { calculateEvaluationScore } from "../../../score-calculation/application/calculate-evaluation-score.js";
import { LlmGatewayError, type LlmGateway } from "../../../llm-gateway/application/llm-gateway.js";
import { criterionEvent } from "../../../evaluation-orchestration/application/events.js";
import { publishEvaluationCompletion } from "../../../evaluation-orchestration/application/publish-pending-completions.js";
import { CRITERION_COMPLETED_TOPIC, CRITERION_REQUESTED_TOPIC, EVALUATION_REQUESTED_TOPIC } from "../../../evaluation-orchestration/adapters/events/topics.js";
import { evaluateCriterion, type EvaluationMessage } from "../../application/evaluate-criterion.js";
import { organizerCode } from "../../application/external-code.js";
import { EvaluationRepository } from "../persistence/evaluation-repository.js";

interface PipelineEvent { evaluation_run_id?: string; criterion_id?: string }
type ChecklistVersionDocument = Omit<ChecklistVersionRecord, "id"> & { _id: string };

export class EvaluationConsumer {
  private readonly repository: EvaluationRepository;
  constructor(private readonly consumer: Consumer, private readonly producer: Producer, private readonly db: Db, private readonly config: AppConfig, private readonly gateway: LlmGateway) {
    this.repository = new EvaluationRepository(db);
  }
  async start() {
    await this.repository.ensureIndexes();
    await this.consumer.connect();
    await this.consumer.subscribe({ topics: [EVALUATION_REQUESTED_TOPIC, CRITERION_REQUESTED_TOPIC], fromBeginning: true });
    await this.consumer.run({ partitionsConsumedConcurrently: this.config.llm.maxConcurrency, eachMessage: (payload) => this.handle(payload) });
  }
  private async handle({ topic, message }: EachMessagePayload) {
    if (!message.value) return;
    const event = JSON.parse(message.value.toString()) as PipelineEvent;
    if (!event.evaluation_run_id) throw new Error("Evaluation event is missing evaluation_run_id");
    if (topic === EVALUATION_REQUESTED_TOPIC) await this.requestCriteria(event.evaluation_run_id);
    else if (topic === CRITERION_REQUESTED_TOPIC && event.criterion_id) await this.processCriterion(event.evaluation_run_id, event.criterion_id);
  }
  private async load(runId: string) {
    const run = await this.repository.findRun(runId);
    if (!run) return null;
    const [conversation, version] = await Promise.all([
      this.db.collection("conversations").findOne({ conversation_id: run.conversation_id, dataset_group_id: run.dataset_group_id }),
      this.db.collection<ChecklistVersionDocument>("checklist_versions").findOne({ _id: run.checklist_version_id })
    ]);
    if (!conversation || !version) throw new Error("Evaluation references missing immutable input");
    const { _id, ...versionFields } = version;
    return { run, conversation, version: { id: _id, ...versionFields } as ChecklistVersionRecord };
  }
  private async requestCriteria(runId: string) {
    const loaded = await this.load(runId); if (!loaded || ["completed", "failed"].includes(loaded.run.status)) return;
    await this.repository.runs().updateOne({ run_id: runId }, { $set: { status: "processing", started_at: loaded.run.started_at ?? new Date(), model_id: this.config.llm.model } });
    if (loaded.run.criteria_dispatched) return;
    for (const criterion of loaded.version.criteria.filter((item) => item.enabled)) {
      const event = criterionEvent(loaded.run, criterion.id);
      await this.producer.send({ topic: CRITERION_REQUESTED_TOPIC, messages: [{ key: `${runId}:${criterion.id}`, value: JSON.stringify(event) }] });
    }
    await this.repository.runs().updateOne({ run_id: runId }, { $set: { criteria_dispatched: true } });
  }
  private async processCriterion(runId: string, criterionId: string) {
    const loaded = await this.load(runId); if (!loaded || loaded.run.status === "completed") return;
    const criterion = loaded.version.criteria.find((item) => item.id === criterionId && item.enabled);
    if (!criterion) return;
    const existing = await this.repository.criteria().findOne({ evaluation_run_id: runId, criterion_id: criterionId });
    if (existing?.processing_state === "completed") { await this.finalize(runId, loaded.version); return; }
    const now = new Date(); const externalCode = organizerCode(criterion);
    await this.repository.criteria().updateOne({ evaluation_run_id: runId, criterion_id: criterionId }, { $setOnInsert: {
      _id: randomUUID(), evaluation_run_id: runId, criterion_id: criterionId, external_code: externalCode, criterion_name: criterion.display_name, display_order: criterion.display_order,
      raw_value: null, weight: criterion.weight, weighted_contribution: null, is_na: false, na_rationale: null, explanation: null,
      evidence_message_ids: [], evidence_turns: [], confidence: null, model_id: this.config.llm.model, prompt_version: "criterion-v1",
      latency_ms: null, token_usage: null, processing_state: "processing", error: null, error_category: null, created_at: now, completed_at: null
    } }, { upsert: true });
    try {
      const result = await evaluateCriterion({ gateway: this.gateway, language: String(loaded.conversation.normalized_language), messages: loaded.conversation.transcript as EvaluationMessage[], criterion, externalCode, maxRetries: 1 });
      const contribution = calculateEvaluationScore([criterion], new Map([[criterion.id, result.value]])).weightedContributions.get(criterion.id) ?? 0;
      await this.repository.criteria().updateOne({ evaluation_run_id: runId, criterion_id: criterionId }, { $set: {
        raw_value: result.value, weighted_contribution: contribution, is_na: result.value === null, na_rationale: result.value === null ? result.rationale : null,
        explanation: result.rationale, evidence_message_ids: result.evidence_message_ids, evidence_turns: result.evidence_turns,
        confidence: result.confidence, model_id: result.model_id, latency_ms: result.latency_ms, token_usage: result.token_usage,
        processing_state: "completed", error: null, error_category: null, completed_at: new Date()
      } });
    } catch (error) {
      const category = error instanceof LlmGatewayError ? error.category : "malformed_response";
      const detail = error instanceof LlmGatewayError ? error.message : "Model output could not be validated";
      const retryCount = (existing?.retry_count ?? 0) + 1;
      const capacityDeferred = error instanceof LlmGatewayError && ["quota_exhausted", "rate_limited", "provider_unavailable"].includes(error.category);
      if (error instanceof LlmGatewayError && error.retryable && (capacityDeferred || retryCount <= this.config.llm.maxRetries)) {
        const delay = error.category === "quota_exhausted" ? (error.retryAfterMs ?? this.config.llm.quotaRecheckMs ?? 21_600_000) : Math.max(error.retryAfterMs ?? 0, Math.min(60_000, 2 ** Math.min(retryCount, 5) * 2_000 + Math.floor(Math.random() * 1_000)));
        const nextRetryAt = new Date(Date.now() + delay);
        await this.repository.criteria().updateOne({ evaluation_run_id: runId, criterion_id: criterionId }, { $set: { processing_state: "retry_scheduled", error: detail, error_category: category, retry_count: retryCount, next_retry_at: nextRetryAt, completed_at: null } });
        await this.repository.runs().updateOne({ run_id: runId }, { $set: { status: "waiting", error: "Waiting for AI capacity", error_category: category, next_retry_at: nextRetryAt } });
        return;
      }
      await this.repository.criteria().updateOne({ evaluation_run_id: runId, criterion_id: criterionId }, { $set: { processing_state: "error", error: detail, error_category: category, retry_count: retryCount, completed_at: new Date(), next_retry_at: null } });
    }
    await this.producer.send({ topic: CRITERION_COMPLETED_TOPIC, messages: [{ key: `${runId}:${criterionId}`, value: JSON.stringify({ ...criterionEvent(loaded.run, criterionId), processing_state: (await this.repository.criteria().findOne({ evaluation_run_id: runId, criterion_id: criterionId }))?.processing_state }) }] });
    await this.finalize(runId, loaded.version);
  }
  private async finalize(runId: string, version: ChecklistVersionRecord) {
    const results = await this.repository.criteria().find({ evaluation_run_id: runId }).toArray();
    const finished = results.filter((item) => item.processing_state === "completed" || item.processing_state === "error");
    await this.repository.runs().updateOne({ run_id: runId }, { $set: { completed_criteria: finished.length } });
    const enabled = version.criteria.filter((criterion) => criterion.enabled);
    if (finished.length < enabled.length) return;
    const values = new Map(results.map((result) => [result.criterion_id, result.raw_value]));
    const score = calculateEvaluationScore(enabled, values);
    for (const result of results.filter((item) => item.processing_state === "completed")) {
      await this.repository.criteria().updateOne({ evaluation_run_id: runId, criterion_id: result.criterion_id }, { $set: { weighted_contribution: score.weightedContributions.get(result.criterion_id) ?? 0 } });
    }
    const errors = results.filter((item) => item.processing_state === "error");
    if (errors.length) {
      const category = errors[0]?.error_category ?? "malformed_response";
      const detail = `${errors.length} criterion evaluation(s) failed (${category})`;
      const updated = await this.repository.runs().findOneAndUpdate({ run_id: runId, status: { $nin: ["completed", "failed"] } }, { $set: { status: "failed", error: detail, error_category: category, completed_at: new Date(), final_score: null, critical_flag: null, completion_publication_status: "pending" }, $unset: { active_key: "" } }, { returnDocument: "after" });
      if (updated) await this.publishCompleted(updated);
      return;
    }
    const updated = await this.repository.runs().findOneAndUpdate({ run_id: runId, status: { $nin: ["completed", "failed"] } }, { $set: { status: "completed", error: null, error_category: null, completed_at: new Date(), final_score: score.finalScore, critical_flag: score.criticalFlag, completion_publication_status: "pending" }, $unset: { active_key: "" } }, { returnDocument: "after" });
    if (updated) await this.publishCompleted(updated);
  }
  private async publishCompleted(run: NonNullable<Awaited<ReturnType<EvaluationRepository["findRun"]>>>) {
    await publishEvaluationCompletion(this.repository, this.producer, run);
  }
  async recoverDeferredRetries() {
    const due = await this.repository.criteria().find({ processing_state: "retry_scheduled", next_retry_at: { $lte: new Date() } }).limit(100).toArray();
    for (const criterion of due) {
      const claimed = await this.repository.criteria().findOneAndUpdate(
        { _id: criterion._id, processing_state: "retry_scheduled" },
        { $set: { processing_state: "processing", next_retry_at: null } },
        { returnDocument: "after" }
      );
      if (!claimed) continue;
      const run = await this.repository.findRun(criterion.evaluation_run_id);
      if (!run) continue;
      await this.repository.runs().updateOne({ run_id: run.run_id }, { $set: { status: "processing", error: null, next_retry_at: null } });
      const event = criterionEvent(run, criterion.criterion_id);
      try {
        await this.producer.send({ topic: CRITERION_REQUESTED_TOPIC, messages: [{ key: `${run.run_id}:${criterion.criterion_id}`, value: JSON.stringify(event) }] });
      } catch (error) {
        await this.repository.criteria().updateOne({ _id: criterion._id, processing_state: "processing" }, { $set: { processing_state: "retry_scheduled", next_retry_at: new Date() } });
        throw error;
      }
    }
  }
  async close() { await this.consumer.disconnect(); }
}
