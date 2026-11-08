export type AnalysisKey = "evaluation" | "followup" | "sentiment" | "metadata";
export type AnalysisStageStatus = "waiting" | "queued" | "processing" | "completed" | "partial" | "failed";
export interface AnalysisStage {
  key: AnalysisKey;
  label: string;
  status: AnalysisStageStatus;
  reference_id: string | null;
  error: string | null;
  attempt: number;
  event_id: string;
  published: boolean;
}
export interface AnalysisJob {
  _id: string;
  job_id: string;
  dataset_group_id: string;
  conversation_id: string;
  checklist_version_id?: string;
  status: "queued" | "processing" | "completed" | "completed_with_errors";
  stages: AnalysisStage[];
  requested_at: Date;
  updated_at: Date;
  completed_at: Date | null;
  active_key?: string;
  lease_until?: Date;
  lease_token?: string;
}
export const ANALYSIS_LABELS: Record<AnalysisKey, string> = {
  evaluation: "Evaluation", followup: "Recommended follow-up", sentiment: "Sentiment timeline", metadata: "Metadata"
};
export function initialStages(jobId: string): AnalysisStage[] {
  return (["evaluation", "followup", "sentiment", "metadata"] as const).map((key) => ({
    key, label: ANALYSIS_LABELS[key], status: "waiting", reference_id: null, error: null,
    attempt: 1, event_id: `analysis:${jobId}:${key}:1`, published: false
  }));
}
export const isStageFinished = (stage: AnalysisStage) => ["completed", "partial", "failed"].includes(stage.status);
export function jobStatus(stages: AnalysisStage[]): AnalysisJob["status"] {
  if (stages.every(isStageFinished)) return stages.every((stage) => stage.status === "completed") ? "completed" : "completed_with_errors";
  return stages.every((stage) => stage.status === "waiting") ? "queued" : "processing";
}
export function retryStages(stages: AnalysisStage[]): AnalysisStage[] {
  return stages.map((stage) => stage.status === "completed" ? stage : ({
    ...stage, status: "waiting", reference_id: stage.key === "evaluation" ? stage.reference_id : null,
    error: null, published: false, attempt: stage.attempt + 1,
    event_id: stage.event_id.replace(/:\d+$/, `:${stage.attempt + 1}`)
  }));
}
export function publicJob(job: AnalysisJob) {
  const { _id, active_key, lease_until, lease_token, ...result } = job;
  void _id; void active_key; void lease_until; void lease_token;
  return { ...result, total_stages: 4, completed_stages: job.stages.filter((stage) => stage.status === "completed").length,
    stages: job.stages.map(({ event_id, published, ...stage }) => { void event_id; void published; return stage; }) };
}
