import type { EvaluationRun } from "./types/evaluation";

// Display bands only. The official score is always supplied by the backend.
const configuredHigh = Number(import.meta.env.VITE_SCORE_HIGH_THRESHOLD ?? 80);
const configuredMedium = Number(import.meta.env.VITE_SCORE_MEDIUM_THRESHOLD ?? 60);
export const scoreBands = Number.isFinite(configuredHigh) && Number.isFinite(configuredMedium)
  && configuredMedium >= 0 && configuredMedium < configuredHigh && configuredHigh <= 100
  ? { high: configuredHigh, medium: configuredMedium } : { high: 80, medium: 60 };

export function scoreTone(score: number | null | undefined): string {
  return score == null ? "text-muted" : score >= scoreBands.high ? "text-emerald-700"
    : score >= scoreBands.medium ? "text-amber-700" : "text-red-700";
}
export function effectiveScore(run: EvaluationRun): number | null {
  return run.finalized_at ? run.finalized_score ?? null : run.final_score;
}
export function effectiveCritical(run: EvaluationRun): boolean | null {
  return run.finalized_at ? run.finalized_critical_flag ?? null : run.critical_flag;
}
