import assert from "node:assert/strict";
import test from "node:test";
import { AnalysisCoordinator } from "../application/analysis-coordinator.js";
import { initialStages, jobStatus, publicJob, retryStages, type AnalysisJob, type AnalysisStage } from "../application/analysis.types.js";

function fixture(): AnalysisJob {
  return { _id: "job", job_id: "job", dataset_group_id: "DEV", conversation_id: "c1", status: "queued",
    stages: initialStages("job"), requested_at: new Date(), updated_at: new Date(), completed_at: null, active_key: "DEV:c1" };
}

test("progress counts actual successful stages and never labels partial output complete", () => {
  const job = fixture();
  job.stages[0]!.status = "completed";
  job.stages[1]!.status = "failed";
  job.stages[2]!.status = "partial";
  job.stages[3]!.status = "completed";
  assert.equal(publicJob(job).completed_stages, 2);
  assert.equal(jobStatus(job.stages), "completed_with_errors");
  assert.equal("active_key" in publicJob(job), false);
});

test("retry preserves successful references and only resets incomplete stages", () => {
  const stages = fixture().stages;
  stages[0]!.status = "failed"; stages[0]!.reference_id = "evaluation-with-successful-criteria";
  stages[1]!.status = "failed";
  stages[2]!.status = "completed"; stages[2]!.reference_id = "successful-sentiment"; stages[2]!.published = true;
  stages[3]!.status = "partial";
  const retried = retryStages(stages);
  assert.deepEqual(retried[2], stages[2]);
  assert.equal(retried[0]!.reference_id, "evaluation-with-successful-criteria");
  assert.equal(retried[0]!.status, "waiting");
  assert.equal(retried[3]!.event_id, "analysis:job:metadata:2");
  assert.equal(stages[3]!.status, "partial");
});

function harness(job: AnalysisJob) {
  const coordinator = new AnalysisCoordinator({} as never, {} as never, {} as never);
  const sent: string[] = [];
  const persisted = new Map<string, AnalysisStage["status"]>();
  const internal = coordinator as unknown as {
    jobs: { claim: () => Promise<AnalysisJob>; save: (value: AnalysisJob, release?: boolean) => Promise<void> };
    refresh: (value: AnalysisJob, stage: AnalysisStage) => Promise<void>;
    dispatch: (value: AnalysisJob, stage: AnalysisStage) => Promise<void>;
  };
  let released = false;
  internal.jobs = { claim: async () => job, save: async (_value, release) => { released = release ?? false; } };
  internal.refresh = async (_value, stage) => { stage.status = persisted.get(stage.key) ?? stage.status; };
  internal.dispatch = async (_value, stage) => { sent.push(stage.key); stage.status = "queued"; stage.reference_id = stage.event_id; stage.published = true; };
  return { coordinator, sent, persisted, released: () => released };
}

test("follow-up waits for the current evaluation, sentiment, and metadata, including after refresh", async () => {
  const job = fixture(), h = harness(job);
  await h.coordinator.advance(job.job_id);
  assert.deepEqual(h.sent, ["evaluation", "sentiment", "metadata"]);
  assert.equal(job.stages[1]!.status, "waiting");
  h.persisted.set("evaluation", "completed"); h.persisted.set("metadata", "completed");
  await h.coordinator.advance(job.job_id);
  assert.equal(h.sent.includes("followup"), false);
  h.persisted.set("sentiment", "completed");
  await h.coordinator.advance(job.job_id);
  assert.equal(h.sent.at(-1), "followup");
  h.persisted.set("followup", "completed");
  await h.coordinator.advance(job.job_id);
  assert.equal(job.status, "completed");
  assert.equal(h.released(), true);
});

test("partial upstream analysis blocks a fresh recommendation and preserves successful results", async () => {
  const job = fixture(), h = harness(job);
  await h.coordinator.advance(job.job_id);
  h.persisted.set("evaluation", "completed"); h.persisted.set("metadata", "partial"); h.persisted.set("sentiment", "completed");
  await h.coordinator.advance(job.job_id);
  assert.equal(job.status, "completed_with_errors");
  assert.equal(job.stages[0]!.status, "completed");
  assert.equal(job.stages[1]!.status, "failed");
  assert.match(job.stages[1]!.error!, /failed analyses/);
  assert.equal(h.sent.includes("followup"), false);
});

test("a failed publication remains recoverable and is not counted as completed", async () => {
  const job = fixture(), h = harness(job);
  const internal = h.coordinator as unknown as { dispatch: (value: AnalysisJob, stage: AnalysisStage) => Promise<void> };
  internal.dispatch = async (_value, stage) => { stage.reference_id = "persisted-reference"; throw new Error("Broker temporarily unavailable"); };
  await h.coordinator.advance(job.job_id);
  assert.equal(publicJob(job).completed_stages, 0);
  assert.equal(job.stages[0]!.published, false);
  assert.match(job.stages[0]!.error!, /Broker/);
  assert.equal(job.status, "queued");
});

test("a repeated start returns the durable active job without dispatching duplicates", async () => {
  const job = fixture();
  const coordinator = new AnalysisCoordinator({} as never, {} as never, {} as never);
  const internal = coordinator as unknown as { identity: () => Promise<string>; jobs: { active: () => Promise<AnalysisJob> } };
  internal.identity = async () => "DEV";
  internal.jobs = { active: async () => job };
  const first = await coordinator.start("c1", "DEV");
  const second = await coordinator.start("c1", "DEV");
  assert.equal(first.job_id, second.job_id);
  assert.equal(second.completed_stages, 0);
});

test("replaying metadata publication after completion does not reset its generation", async () => {
  const job = fixture(), stage = job.stages.find((item) => item.key === "metadata")!;
  let publications = 0;
  const db = { collection: () => ({ findOne: async () => ({ has_audio: false }) }) };
  const producer = { send: async () => { publications++; } };
  const coordinator = new AnalysisCoordinator(db as never, producer as never, {} as never);
  const internal = coordinator as unknown as {
    metadata: { latest: () => Promise<unknown>; generation: () => Promise<unknown>; queue: () => Promise<void> };
    jobs: { save: () => Promise<void> };
    dispatch: (value: AnalysisJob, item: AnalysisStage) => Promise<void>;
    refresh: (value: AnalysisJob, item: AnalysisStage) => Promise<void>;
  };
  internal.metadata = {
    latest: async () => ({ current_event_id: stage.event_id, deterministic_status: "completed", semantic_status: "completed", errors: [] }),
    generation: async () => ({ current_event_id: stage.event_id, deterministic_status: "completed", semantic_status: "completed", errors: [] }),
    queue: async () => { throw new Error("Completed generation must not be reset"); }
  };
  internal.jobs = { save: async () => {} };
  await internal.dispatch(job, stage);
  assert.equal(publications, 1);
  assert.equal(stage.published, true);
  await internal.refresh(job, stage);
  assert.equal(stage.status, "completed");
});
