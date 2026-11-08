<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { Check, Download, LoaderCircle, Play, RotateCw } from "lucide-vue-next";
import { analysisKeys, getAnalyses, runAnalyses } from "../../api/analyses";
import { evaluationKeys, getEvaluationHistory } from "../../api/evaluations";
import { actionKeys } from "../../api/actions";
import { metadataKeys } from "../../api/metadata";
import { sentimentKeys } from "../../api/sentiment";
import ExportResultsDialog from "../ExportResultsDialog/ExportResultsDialog.vue";
const props = defineProps<{ conversationId: string; datasetGroupId: string }>();
const emit = defineEmits<{ status: [status: string]; evaluationRun: [runId: string] }>();
const client = useQueryClient();
const exportOpen = ref(false);
const query = useQuery({ queryKey: computed(() => analysisKeys.detail(props.conversationId, props.datasetGroupId)),
  queryFn: ({ signal }) => getAnalyses(props.conversationId, props.datasetGroupId, signal), retry: false,
  refetchInterval: state => state.state.data && ["queued", "processing"].includes(state.state.data.status) ? 2000 : false });
const history = useQuery({ queryKey: computed(() => evaluationKeys.history(props.conversationId, props.datasetGroupId)),
  queryFn: ({ signal }) => getEvaluationHistory(props.conversationId, signal, props.datasetGroupId) });
const job = computed(() => query.data.value);
const active = computed(() => Boolean(job.value && ["queued", "processing"].includes(job.value.status)));
const partial = computed(() => job.value?.status === "completed_with_errors");
const hasEvaluation = computed(() => history.data.value?.some(run => run.status === "completed"));
const label = computed(() => active.value ? `Analyzing ${job.value?.completed_stages ?? 0} of 4…`
  : partial.value ? "Retry failed analyses" : job.value?.status === "completed" ? "Rerun All" : "Run All Analyses");
const progress = computed(() => (job.value?.completed_stages ?? 0) / 4 * 100);
const failed = computed(() => job.value?.stages.filter(stage => ["failed", "partial"].includes(stage.status)) ?? []);
async function refreshResults() {
  await Promise.all([
    client.invalidateQueries({ queryKey: evaluationKeys.history(props.conversationId) }),
    client.invalidateQueries({ queryKey: actionKeys.detail(props.conversationId) }),
    client.invalidateQueries({ queryKey: metadataKeys.detail(props.conversationId, props.datasetGroupId) }),
    client.invalidateQueries({ queryKey: sentimentKeys.detail(props.conversationId, props.datasetGroupId) }),
    client.invalidateQueries({ queryKey: ["conversation", props.conversationId] }),
    client.invalidateQueries({ queryKey: ["conversations"] })
  ]);
}
watch(() => job.value?.stages.map(s => `${s.key}:${s.status}:${s.reference_id}`).join("|"), (value, old) => {
  if (value && value !== old) void refreshResults();
});
watch(() => job.value?.status, status => { emit("status", status ?? ""); });
watch(() => job.value?.stages.find(stage => stage.key === "evaluation")?.reference_id, id => { if (id) emit("evaluationRun", id); });
const mutation = useMutation({ mutationFn: () => runAnalyses(props.conversationId, props.datasetGroupId, partial.value),
  onSuccess: async result => {
    client.setQueryData(analysisKeys.detail(props.conversationId, props.datasetGroupId), result);
    await refreshResults();
  } });
</script>

<template>
  <div class="flex min-w-0 flex-wrap items-center gap-2">
    <span v-if="job?.status === 'completed'" role="status" class="inline-flex items-center gap-1 text-xs text-emerald-700"><Check :size="14" /> All analyses completed</span>
    <details v-if="job" class="relative">
      <summary class="cursor-pointer rounded px-2 py-1 text-xs text-muted hover:bg-surface" :class="partial ? 'text-amber-800' : ''">{{ partial ? `${failed.map(stage => stage.label).join(', ')} needs retry` : 'Analysis status' }}</summary>
      <div class="absolute right-0 z-40 mt-2 w-72 max-w-[80vw] rounded-lg border border-line bg-white p-3 shadow-lg" aria-live="polite">
        <ul class="space-y-2 text-xs"><li v-for="stage in job.stages" :key="stage.key"><div class="flex justify-between gap-2"><span class="font-semibold">{{ stage.label }}</span><span :class="stage.status === 'failed' ? 'text-red-700' : stage.status === 'partial' ? 'text-amber-800' : 'text-muted'">{{ stage.status }}</span></div><p v-if="stage.error" class="mt-1 break-words text-red-700">{{ stage.error }}</p></li></ul>
      </div>
    </details>
    <button type="button" class="button-primary !min-h-9 !rounded-md !px-3 !text-xs" :disabled="active || mutation.isPending.value || query.isLoading.value || query.isError.value" @click="mutation.mutate()">
      <LoaderCircle v-if="active || mutation.isPending.value" :size="15" class="animate-spin" aria-hidden="true" /><RotateCw v-else-if="job" :size="15" aria-hidden="true" /><Play v-else :size="15" aria-hidden="true" />{{ label }}
    </button>
    <span v-if="active" class="h-1.5 w-12 overflow-hidden rounded bg-surface-strong" role="progressbar" :aria-valuenow="job?.completed_stages ?? 0" :aria-valuemin="0" :aria-valuemax="4" aria-label="Completed analyses"><span class="block h-full bg-slate-600 transition-[width]" :style="{width: `${progress}%`}" /></span>
    <button type="button" class="button-secondary !min-h-9 !rounded-md !px-3 !text-xs" :disabled="!hasEvaluation" :title="hasEvaluation ? 'Download validated evaluation results' : 'A completed evaluation is required'" @click="exportOpen = true"><Download :size="15" aria-hidden="true" /> Export JSON</button>
    <p v-if="mutation.error.value || query.isError.value" role="alert" class="basis-full text-xs text-red-700">{{ mutation.error.value?.message ?? query.error.value?.message }} <button v-if="query.isError.value" type="button" class="underline" @click="query.refetch()">Retry status</button></p>
  </div>
  <ExportResultsDialog v-if="exportOpen" :selection="{ conversations: [{conversation_id: conversationId, dataset_group_id: datasetGroupId}] }" :filename="`cqa-${conversationId}.json`" @close="exportOpen = false" />
</template>
