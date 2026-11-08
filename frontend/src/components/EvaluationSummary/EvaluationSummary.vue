<script setup lang="ts">
import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { ShieldAlert } from "lucide-vue-next";
import { evaluationKeys, getEvaluationHistory } from "../../api/evaluations";
import { effectiveScore, effectiveCritical, scoreTone } from "../../shared/evaluation-display";
import type { EvaluationRun } from "../../shared/types/evaluation";
import { summarizeCriteria } from "../CriterionScorecard/criterion-presentation";
const props = defineProps<{ conversationId: string; datasetGroupId?: string; selectedRun?: EvaluationRun | null; requestedRunId?: string }>();
const history = useQuery({ queryKey: computed(() => evaluationKeys.history(props.conversationId, props.datasetGroupId)),
  queryFn: ({ signal }) => getEvaluationHistory(props.conversationId, signal, props.datasetGroupId),
  refetchInterval: (query) => query.state.data?.some(r => ["queued", "waiting", "processing"].includes(r.status)) ? 2500 : false });
const run = computed(() => props.selectedRun !== undefined ? props.selectedRun
  : history.data.value?.find(r => r.run_id === props.requestedRunId)
    ?? history.data.value?.find(r => r.status === "completed" && r.finalized_at)
    ?? history.data.value?.find(r => r.status === "completed"));
const latest = computed(() => history.data.value?.[0]);
const score = computed(() => run.value ? effectiveScore(run.value) : null);
const critical = computed(() => run.value ? effectiveCritical(run.value) : null);
const counts = computed(() => run.value ? summarizeCriteria(run.value) : null);
</script>

<template>
  <div class="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-3" aria-label="Evaluation summary" aria-live="polite">
    <div class="flex items-baseline gap-2">
      <span class="text-xs font-semibold text-muted">Overall score</span>
      <strong class="text-2xl tabular-nums" :class="scoreTone(score)">{{ score == null ? '—' : score.toFixed(2) }}</strong>
      <span class="text-xs text-muted">/ 100</span>
    </div>
    <div class="flex flex-wrap items-center gap-3 text-xs text-muted">
      <span v-if="run?.finalized_at">Reviewer finalized</span>
      <span v-else>{{ history.isError.value ? 'Score unavailable' : run?.status ?? latest?.status ?? 'Not evaluated' }}</span>
      <span v-if="counts && run?.status === 'completed'">{{ counts.passed }} passed · {{ counts.partial }} partial · {{ counts.failed }} failed / {{ counts.applicable }} applicable<span v-if="counts.na"> · {{ counts.na }} N/A</span></span>
      <span v-if="critical === true" class="inline-flex items-center gap-1 font-bold text-red-700"><ShieldAlert :size="15" /> Severe violation</span>
      <span v-else-if="critical === false">No severe violations</span>
    </div>
  </div>
</template>
