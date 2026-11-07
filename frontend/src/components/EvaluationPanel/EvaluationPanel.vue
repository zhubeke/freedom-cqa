<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { AlertTriangle, CheckCircle2, ExternalLink, LoaderCircle, RotateCw, ShieldAlert, Sparkles, X } from "lucide-vue-next";
import { listChecklists, listChecklistVersions } from "../../api/checklists";
import { evaluationKeys, getEvaluationHistory, retryEvaluation, startEvaluation } from "../../api/evaluations";

const props = defineProps<{ conversationId: string }>();
const emit = defineEmits<{ evidence: [messageId: string] }>();
const queryClient = useQueryClient();
const dialogOpen = ref(false);
const selectedChecklistId = ref("");
const selectedVersionId = ref("");
const selectedRunId = ref("");

const checklistsQuery = useQuery({ queryKey: ["checklists"], queryFn: ({ signal }) => listChecklists(signal) });
watch(() => checklistsQuery.data.value, (items) => {
  if (!selectedChecklistId.value && items?.length) selectedChecklistId.value = items.find((item) => item.id === "freedom-default-checklist")?.id ?? items[0]!.id;
}, { immediate: true });
const versionsQuery = useQuery({
  queryKey: computed(() => ["checklists", selectedChecklistId.value, "versions"]),
  queryFn: ({ signal }) => listChecklistVersions(selectedChecklistId.value, signal),
  enabled: computed(() => Boolean(selectedChecklistId.value))
});
watch(() => versionsQuery.data.value, (versions) => {
  if (!versions?.length) return;
  const checklist = checklistsQuery.data.value?.find((item) => item.id === selectedChecklistId.value);
  selectedVersionId.value = checklist?.active_version_id ?? versions[0]!.id;
}, { immediate: true });

const historyQuery = useQuery({
  queryKey: computed(() => evaluationKeys.history(props.conversationId)),
  queryFn: ({ signal }) => getEvaluationHistory(props.conversationId, signal),
  refetchInterval: (query) => query.state.data?.some((run) => ["queued", "processing", "waiting"].includes(run.status)) ? 2500 : false,
  retry: 1
});
const currentRun = computed(() => historyQuery.data.value?.find((run) => run.run_id === selectedRunId.value) ?? historyQuery.data.value?.[0] ?? null);
const isProcessing = computed(() => currentRun.value ? ["queued", "processing", "waiting"].includes(currentRun.value.status) : false);
const startMutation = useMutation({
  mutationFn: () => startEvaluation(props.conversationId, selectedVersionId.value),
  onSuccess: async (result) => {
    selectedRunId.value = result.evaluation_run_id;
    dialogOpen.value = false;
    await queryClient.invalidateQueries({ queryKey: evaluationKeys.history(props.conversationId) });
  }
});
const retryMutation = useMutation({
  mutationFn: () => retryEvaluation(currentRun.value!.run_id),
  onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: evaluationKeys.history(props.conversationId) }); }
});
const progress = computed(() => currentRun.value?.total_criteria ? Math.round(100 * currentRun.value.completed_criteria / currentRun.value.total_criteria) : 0);
const failureLabels: Record<string, string> = {
  configuration: "Configuration error",
  authentication: "Authentication error",
  authorization: "Permission error",
  not_found: "Account, model, or endpoint not found",
  rate_limited: "Rate limited",
  quota_exhausted: "Daily AI quota exhausted",
  provider_unavailable: "Cloudflare unavailable",
  timeout: "Inference timeout",
  network: "Network error",
  malformed_response: "Invalid model response"
};
const failureLabel = computed(() => failureLabels[currentRun.value?.error_category ?? ""] ?? "Evaluation error");
const statusLabel = computed(() => currentRun.value ? ({ queued: "Queued", processing: `Processing: ${currentRun.value.completed_criteria}/${currentRun.value.total_criteria} criteria`, waiting: "Waiting for AI capacity", completed: "Completed", failed: "Retry available" }[currentRun.value.status]) : "");
function answer(value: boolean | number | null, isNa: boolean) { return isNa ? "N/A" : value === null ? "Pending" : typeof value === "boolean" ? (value ? "Yes" : "No") : String(value); }
</script>

<template>
  <section class="overflow-hidden rounded-[1.75rem] bg-white" aria-labelledby="evaluation-title">
    <div class="flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-5 sm:px-7">
      <div>
        <h2 id="evaluation-title" class="text-lg font-bold text-ink">Quality evaluation</h2>
        <p class="mt-1 text-sm text-muted">Independent, evidence-backed checks for each enabled criterion.</p>
      </div>
      <button class="button-primary" type="button" :disabled="isProcessing" @click="dialogOpen = true">
        <Sparkles :size="17" aria-hidden="true" /> {{ isProcessing ? "Evaluation in progress" : "Evaluate conversation" }}
      </button>
    </div>

    <div v-if="historyQuery.isLoading.value" class="flex items-center justify-center gap-2 p-8 text-sm text-muted"><LoaderCircle class="animate-spin" :size="18" /> Loading evaluations…</div>
    <div v-else-if="historyQuery.isError.value" class="p-6 text-center" role="alert"><p class="text-sm font-semibold text-red-700">{{ historyQuery.error.value?.message }}</p><button type="button" class="button-secondary mt-4" @click="historyQuery.refetch()"><RotateCw :size="16" /> Retry</button></div>
    <div v-else-if="currentRun" class="p-5 sm:p-7">
      <div class="mb-4 flex items-center justify-between gap-4"><span class="rounded-full bg-surface px-3 py-1.5 text-xs font-bold text-ink">{{ statusLabel }}</span><span class="text-xs text-muted">{{ currentRun.completed_criteria }}/{{ currentRun.total_criteria }}</span></div>
      <div v-if="currentRun.status === 'queued'" class="flex items-center gap-3 rounded-2xl bg-surface p-4 text-sm font-semibold"><LoaderCircle class="animate-spin text-primary" :size="18" /> Evaluation is queued</div>
      <div v-else-if="currentRun.status === 'processing'" class="rounded-2xl bg-surface p-4">
        <div class="flex items-center justify-between gap-4 text-sm font-semibold"><span class="inline-flex items-center gap-2"><LoaderCircle class="animate-spin text-primary" :size="18" /> Processing criteria</span><span>{{ currentRun.completed_criteria }}/{{ currentRun.total_criteria }}</span></div>
        <div class="mt-3 h-2 overflow-hidden rounded-full bg-white"><div class="h-full rounded-full bg-primary transition-all" :style="{ width: `${progress}%` }" /></div>
      </div>
      <div v-else-if="currentRun.status === 'waiting'" class="flex gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900"><LoaderCircle class="animate-spin shrink-0" :size="20" /><div><strong>Waiting for available AI capacity</strong><p class="mt-1">AI capacity temporarily unavailable. Your completed results are saved.</p></div></div>
      <div v-else-if="currentRun.status === 'failed'" class="flex items-start justify-between gap-3 rounded-2xl bg-red-50 p-4 text-sm text-red-800"><div class="flex gap-3"><AlertTriangle :size="20" class="shrink-0" /><div><strong>Retry available</strong><p class="mt-1">{{ failureLabel }}. No score has been assigned.</p></div></div><button type="button" class="button-secondary shrink-0" :disabled="retryMutation.isPending.value" @click="retryMutation.mutate()"><RotateCw :size="16" /> Retry failed criteria</button></div>
      <div v-else-if="currentRun.status === 'completed'" class="grid gap-4 sm:grid-cols-2">
        <div class="rounded-2xl bg-surface p-5"><p class="text-xs font-bold uppercase tracking-wide text-muted">Final quality score</p><p class="mt-2 text-4xl font-black text-ink">{{ currentRun.final_score === null ? "N/A" : `${currentRun.final_score}%` }}</p></div>
        <div class="rounded-2xl p-5" :class="currentRun.critical_flag ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'"><p class="text-xs font-bold uppercase tracking-wide">Critical violation flag</p><p class="mt-2 flex items-center gap-2 text-lg font-bold"><ShieldAlert v-if="currentRun.critical_flag" :size="22" /><CheckCircle2 v-else :size="22" />{{ currentRun.critical_flag ? "Detected" : "Not detected" }}</p></div>
      </div>
      <div v-if="currentRun.criteria.length" class="mt-5 divide-y divide-line rounded-2xl border border-line">
        <article v-for="criterion in currentRun.criteria" :key="criterion.criterion_id" class="p-4 sm:p-5">
          <div class="flex flex-wrap items-start justify-between gap-3"><div><h3 class="font-bold text-ink">{{ criterion.criterion_name }}</h3><p class="mt-1 text-xs text-muted">Weight {{ criterion.weight }} · Weighted score {{ criterion.weighted_contribution ?? (criterion.is_na ? 'N/A' : '—') }}</p></div><span class="rounded-lg px-3 py-1 text-sm font-black" :class="criterion.raw_value === false && !criterion.is_na ? 'bg-red-50 text-red-700' : 'bg-surface text-ink'">{{ criterion.processing_state === 'error' ? 'Failed' : criterion.processing_state === 'retry_scheduled' ? 'Waiting' : answer(criterion.raw_value, criterion.is_na) }}</span></div>
          <p v-if="criterion.explanation" class="mt-3 text-sm leading-6 text-muted">{{ criterion.explanation }}</p>
          <p v-else-if="criterion.processing_state === 'error'" class="mt-3 text-sm text-red-700">{{ failureLabels[criterion.error_category ?? ''] ?? 'Criterion evaluation failed' }}</p>
          <div v-if="criterion.evidence_message_ids.length" class="mt-3 flex flex-wrap gap-2">
            <button v-for="(messageId, index) in criterion.evidence_message_ids" :key="messageId" type="button" class="inline-flex items-center gap-1 rounded-lg bg-primary-soft px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-red-100" @click="emit('evidence', messageId)"><ExternalLink :size="13" /> Turn {{ criterion.evidence_turns[index] }}</button>
          </div>
        </article>
      </div>
    </div>
    <div v-else class="p-8 text-center text-sm text-muted">No evaluation has been run for this conversation.</div>
  </section>

  <div v-if="dialogOpen" class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="evaluation-dialog-title" @click.self="dialogOpen = false">
    <div class="w-full max-w-md rounded-[1.5rem] bg-white p-6 shadow-2xl">
      <div class="flex items-center justify-between"><h2 id="evaluation-dialog-title" class="text-lg font-bold">Evaluate conversation</h2><button class="icon-button" type="button" aria-label="Close" @click="dialogOpen = false"><X :size="20" /></button></div>
      <label class="label mt-5" for="evaluation-checklist">Checklist</label>
      <select id="evaluation-checklist" v-model="selectedChecklistId" class="field mt-2"><option v-for="checklist in checklistsQuery.data.value" :key="checklist.id" :value="checklist.id">{{ checklist.name }}</option></select>
      <label class="label mt-4" for="evaluation-version">Version</label>
      <select id="evaluation-version" v-model="selectedVersionId" class="field mt-2"><option v-for="version in versionsQuery.data.value" :key="version.id" :value="version.id">Version {{ version.version_number }}</option></select>
      <p v-if="startMutation.error.value" class="mt-3 text-sm text-red-700">{{ startMutation.error.value.message }}</p>
      <div class="mt-6 flex justify-end gap-3"><button class="button-secondary" type="button" @click="dialogOpen = false">Cancel</button><button class="button-primary" type="button" :disabled="!selectedVersionId || startMutation.isPending.value" @click="startMutation.mutate()"><LoaderCircle v-if="startMutation.isPending.value" class="animate-spin" :size="17" /> Start evaluation</button></div>
    </div>
  </div>
</template>
