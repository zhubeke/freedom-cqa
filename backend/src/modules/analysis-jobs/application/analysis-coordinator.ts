import { MongoServerError, type Db } from "mongodb";
import type { Producer } from "kafkajs";
import type { AppConfig } from "../../../config/config.js";
import { EvaluationRepository } from "../../criterion-evaluation/adapters/persistence/evaluation-repository.js";
import { startEvaluation, EvaluationRequestError } from "../../evaluation-orchestration/application/start-evaluation.js";
import { publishPendingEvaluations } from "../../evaluation-orchestration/application/publish-pending-evaluations.js";
import { MetadataRepository } from "../../conversation-metadata/adapters/persistence/metadata-repository.js";
import { SentimentRepository } from "../../conversation-metadata/adapters/persistence/sentiment-repository.js";
import { METADATA_EXTRACTOR_VERSION } from "../../conversation-metadata/application/metadata.types.js";
import { MESSAGE_SENTIMENT_ANALYZER_VERSION } from "../../conversation-metadata/application/analyze-message-sentiment.js";
import { makeMetadataEvent, publishMetadataRequested } from "../../conversation-metadata/application/events.js";
import { makeSentimentEvent, publishSentimentRequested } from "../../conversation-metadata/application/sentiment-events.js";
import { ClassificationRepository } from "../../action-classification/adapters/persistence/classification-repository.js";
import { publishClassificationRequested } from "../../action-classification/application/events.js";
import { AnalysisRepository } from "../adapters/persistence/analysis-repository.js";
import { isStageFinished, jobStatus, publicJob, retryStages, type AnalysisJob, type AnalysisStage } from "./analysis.types.js";

export class AnalysisRequestError extends Error {
  constructor(message: string, public readonly statusCode = 400) { super(message); }
}

/** Coordinates the existing pipelines; it never synthesizes stage completion. */
export class AnalysisCoordinator {
  readonly jobs: AnalysisRepository;
  private readonly evaluations: EvaluationRepository;
  private readonly metadata: MetadataRepository;
  private readonly sentiments: SentimentRepository;
  private readonly classifications: ClassificationRepository;
  constructor(private readonly db: Db, private readonly producer: Producer, private readonly config: AppConfig) {
    this.jobs = new AnalysisRepository(db);
    this.evaluations = new EvaluationRepository(db);
    this.metadata = new MetadataRepository(db);
    this.sentiments = new SentimentRepository(db);
    this.classifications = new ClassificationRepository(db);
  }
  async identity(conversationId: string, datasetGroupId?: string) {
    const matches = await this.db.collection("conversations").find({ conversation_id: conversationId,
      ...(datasetGroupId ? { dataset_group_id: datasetGroupId } : {}) }, { projection: { dataset_group_id: 1 } }).limit(2).toArray();
    if (!matches.length) throw new AnalysisRequestError("Conversation not found", 404);
    if (matches.length > 1) throw new AnalysisRequestError("datasetGroupId is required for this conversation", 409);
    return String(matches[0]!.dataset_group_id);
  }
  async latest(conversationId: string, groupId?: string) {
    const group = await this.identity(conversationId, groupId);
    const job = await this.jobs.latest(group, conversationId);
    if (!job) return null;
    if (job.active_key) await this.advance(job.job_id);
    return publicJob((await this.jobs.latest(group, conversationId))!);
  }
  async start(conversationId: string, groupId?: string, retryFailed = false, checklistVersionId?: string) {
    const group = await this.identity(conversationId, groupId);
    const active = await this.jobs.active(group, conversationId);
    if (active) return publicJob(active);
    let job: AnalysisJob;
    try {
      if (retryFailed) {
        const latest = await this.jobs.latest(group, conversationId);
        if (!latest || latest.status !== "completed_with_errors") throw new AnalysisRequestError("There are no failed analyses to retry", 409);
        const retried = await this.jobs.collection().findOneAndUpdate({ job_id: latest.job_id, status: "completed_with_errors" }, {
          $set: { stages: retryStages(latest.stages), status: "queued", completed_at: null,
            active_key: `${group}:${conversationId}`, updated_at: new Date() }
        }, { returnDocument: "after" });
        if (!retried) return publicJob((await this.jobs.latest(group, conversationId))!);
        job = retried;
      } else {
        // Fail early before creating a job when no usable checklist exists.
        const checklist = checklistVersionId
          ? await this.db.collection("checklist_versions").findOne({ _id: checklistVersionId } as never)
          : await this.db.collection("checklists").findOne({ _id: "freedom-default-checklist", active_version_id: { $ne: null } } as never);
        if (!checklist) throw new AnalysisRequestError("No active checklist version found", 422);
        if (checklistVersionId) {
          const parent = await this.db.collection("checklists").findOne({ _id: checklist.checklist_id } as never);
          if (!parent || parent.is_active === false) throw new AnalysisRequestError("This checklist is inactive or no longer available for new evaluations", 409);
        }
        job = await this.jobs.create(group, conversationId, checklistVersionId ?? String(checklist.active_version_id));
      }
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const existing = await this.jobs.active(group, conversationId);
        if (existing) return publicJob(existing);
      }
      throw error;
    }
    await this.advance(job.job_id);
    return publicJob((await this.jobs.latest(group, conversationId))!);
  }
  async recover() {
    const pending = await this.jobs.collection().find({ active_key: { $exists: true } }).limit(100).toArray();
    for (const job of pending) await this.advance(job.job_id);
  }
  async advance(jobId: string) {
    const job = await this.jobs.claim(jobId);
    if (!job) return;
    try {
      for (const stage of job.stages) {
        if (isStageFinished(stage)) continue;
        if (stage.published) await this.refresh(job, stage);
      }
      for (const stage of job.stages.filter((item) => !isStageFinished(item))) {
        if (stage.key === "followup") {
          const upstream = job.stages.filter((item) => item.key !== "followup");
          if (!upstream.every(isStageFinished)) continue;
          if (upstream.some((item) => item.status !== "completed")) {
            stage.status = "failed";
            stage.error = "Waiting for failed analyses to be retried before recommending a follow-up.";
            continue;
          }
        }
        if (!stage.published) {
          try { await this.dispatch(job, stage); }
          catch (error) {
            stage.error = error instanceof Error ? error.message : "Analysis could not be queued";
            if (error instanceof EvaluationRequestError || error instanceof AnalysisRequestError) stage.status = "failed";
            // Publication failures retain their durable reference and are retried by recovery.
          }
        }
      }
      job.status = jobStatus(job.stages);
    } finally {
      await this.jobs.save(job, true);
    }
  }
  private async refresh(job: AnalysisJob, stage: AnalysisStage) {
    if (!stage.reference_id) return;
    if (stage.key === "evaluation") {
      const run = await this.evaluations.findRun(stage.reference_id);
      if (!run) return;
      stage.status = run.status === "waiting" ? "processing" : run.status;
      stage.error = run.error;
      return;
    }
    if (stage.key === "metadata") {
      const item = await this.metadata.generation(job.dataset_group_id, job.conversation_id, stage.event_id);
      if (!item) return;
      const states = [item.deterministic_status, item.semantic_status];
      stage.status = states.includes("failed") ? "failed" : states.includes("partial") ? "partial"
        : states.every((state) => state === "completed") ? "completed"
          : states.includes("processing") ? "processing" : "queued";
      stage.error = ["failed", "partial"].includes(stage.status) ? item.errors.map((error) => `${error.stage}: ${error.message}`).join("; ") || "Metadata analysis is incomplete" : null;
      return;
    }
    if (stage.key === "sentiment") {
      const item = await this.sentiments.generation(job.dataset_group_id, job.conversation_id, MESSAGE_SENTIMENT_ANALYZER_VERSION, stage.event_id);
      if (!item) return;
      stage.status = ["completed", "partial", "failed", "processing"].includes(item.status) ? item.status as AnalysisStage["status"] : "queued";
      stage.error = ["failed", "partial"].includes(stage.status) ? item.failed_batches.map((failure) => failure.error).join("; ") || "Sentiment analysis is incomplete" : null;
      return;
    }
    const item = await this.classifications.findByEvent(stage.event_id);
    if (!item) return;
    stage.status = item.status === "fallback" ? "completed" : item.status;
    stage.error = item.error ?? null;
  }
  private async dispatch(job: AnalysisJob, stage: AnalysisStage) {
    const group = job.dataset_group_id, id = job.conversation_id;
    if (stage.key === "evaluation") {
      if (stage.reference_id && stage.attempt > 1) {
        const run = await this.evaluations.findRun(stage.reference_id);
        if (run?.status === "failed") {
          const criteria = await this.evaluations.criteria().find({ evaluation_run_id: run.run_id, processing_state: { $in: ["error", "retry_scheduled"] } }).toArray();
          if (!criteria.length) throw new AnalysisRequestError("Evaluation has no retryable criteria", 409);
          for (const criterion of criteria) await this.evaluations.criteria().updateOne({ _id: criterion._id }, { $set: {
            processing_state: "retry_scheduled", error: null, error_category: null, retry_count: 0, completed_at: null, next_retry_at: new Date()
          } });
          await this.evaluations.runs().updateOne({ run_id: run.run_id }, { $set: {
            status: "waiting", error: null, error_category: null, completed_at: null, next_retry_at: new Date(),
            completed_criteria: run.total_criteria - criteria.length,
            active_key: `${run.dataset_group_id}:${run.conversation_id}:${run.checklist_version_id}:${run.model_id}:${run.prompt_version ?? "criterion-v1"}`
          } });
          stage.status = "queued"; stage.published = true; stage.error = null;
          return;
        }
      }
      const result = await startEvaluation(this.db, this.evaluations, id, job.checklist_version_id, {
        modelId: this.config.llm.model, promptVersion: "criterion-v1", force: true, requestKey: stage.event_id, datasetGroupId: group, allowInactiveChecklist: true
      });
      stage.reference_id = result.run.run_id;
      stage.status = result.run.status === "waiting" ? "processing" : result.run.status;
      await this.jobs.save(job);
      await publishPendingEvaluations(this.evaluations, this.producer, result.run.run_id);
    } else if (stage.key === "metadata") {
      const current = await this.metadata.latest(group, id);
      if (current && current.current_event_id !== stage.event_id && [current.deterministic_status, current.semantic_status].some((state) => state === "pending" || state === "processing")) return;
      const conversation = await this.db.collection("conversations").findOne({ dataset_group_id: group, conversation_id: id }, { projection: { has_audio: 1 } });
      if (current?.current_event_id !== stage.event_id && !await this.metadata.queue(group, id, METADATA_EXTRACTOR_VERSION, stage.event_id, Boolean(conversation?.has_audio), true)) return;
      stage.reference_id = stage.event_id; stage.status = "queued";
      await this.jobs.save(job);
      await publishMetadataRequested(this.producer, makeMetadataEvent("cqa.metadata.requested", group, id, stage.event_id));
    } else if (stage.key === "sentiment") {
      const current = await this.sentiments.detail(group, id, MESSAGE_SENTIMENT_ANALYZER_VERSION);
      if (current && current.source_event_id !== stage.event_id && ["queued", "processing"].includes(current.status)) return;
      if (current?.source_event_id !== stage.event_id) {
        const queued = await this.sentiments.queue(group, id, MESSAGE_SENTIMENT_ANALYZER_VERSION, stage.event_id);
        if (!queued) return;
      }
      stage.reference_id = stage.event_id; stage.status = "queued";
      await this.jobs.save(job);
      await publishSentimentRequested(this.producer, { ...makeSentimentEvent("cqa.sentiment.requested", group, id, stage.event_id), force_reanalysis: true });
    } else {
      const queued = await this.classifications.queue(group, id, true, stage.event_id);
      stage.reference_id = String(queued.result.result_id); stage.status = "queued";
      await this.jobs.save(job);
      await publishClassificationRequested(this.producer, queued.event);
    }
    stage.published = true; stage.error = null;
  }
}
