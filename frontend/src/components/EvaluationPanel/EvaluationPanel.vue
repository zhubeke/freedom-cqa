<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { AlertTriangle, CheckCircle2, LoaderCircle, Play, RotateCw, X } from "lucide-vue-next";
import { listChecklists } from "../../api/checklists";
import { apiGet } from "../../api/client";
import { evaluationKeys, getEvaluationHistory, retryEvaluation, startEvaluation } from "../../api/evaluations";
import AppealPanel from "../AppealPanel/AppealPanel.vue";
import CriterionScorecard from "../CriterionScorecard/CriterionScorecard.vue";
import { criterionState, isSevereCriterion, reviewerDecision, summarizeCriteria } from "../CriterionScorecard/criterion-presentation";
import type { ChecklistCriterion, ChecklistVersion } from "../../shared/types/checklist";
import type { CriterionEvaluation, EvaluationRun } from "../../shared/types/evaluation";
import type { TranscriptEntry } from "../../shared/types/conversation";

const props = withDefaults(defineProps<{ conversationId: string; datasetGroupId?: string; transcript?: TranscriptEntry[]; requestedRunId?: string; mode?: "simple" | "advanced" }>(), { transcript: () => [], mode: "advanced" });
const emit = defineEmits<{ evidence: [messageId: string]; selectedRun: [run: EvaluationRun | null] }>();
const queryClient = useQueryClient();
const dialogOpen = ref(false);
const selectedChecklistId = ref("");
const selectedVersionId = ref("");
const selectedRunId = ref("");
watch(() => props.requestedRunId, (id) => { if (id) selectedRunId.value = id; }, { immediate: true });

const checklistsQuery = useQuery({ queryKey: ["checklists"], queryFn: ({ signal }) => listChecklists(signal) });
const activeChecklists = computed(() => (checklistsQuery.data.value ?? []).filter(item => item.is_active !== false && item.active_version_id));
watch(activeChecklists, (items) => {
  if (items?.length && !items.some((item) => item.id === selectedChecklistId.value)) selectedChecklistId.value = items.find((item) => item.id === "freedom-default-checklist")?.id ?? items[0]!.id;
  if (!items?.length) selectedChecklistId.value = "";
}, { immediate: true });
watch([selectedChecklistId, activeChecklists], ([id, items]) => {
  selectedVersionId.value = items?.find((item) => item.id === id)?.active_version_id ?? "";
}, { immediate: true });

const historyQuery = useQuery({
  queryKey: computed(() => evaluationKeys.history(props.conversationId, props.datasetGroupId)),
  queryFn: ({ signal }) => getEvaluationHistory(props.conversationId, signal, props.datasetGroupId),
  refetchInterval: (query) => query.state.data?.some((run) => ["queued", "processing", "waiting"].includes(run.status)) ? 2500 : false,
  retry: 1
});
const currentRun = computed(() => historyQuery.data.value?.find((run) => run.run_id === selectedRunId.value)
  ?? historyQuery.data.value?.find((run) => run.status === "completed" && run.finalized_at)
  ?? historyQuery.data.value?.[0] ?? null);
watch(currentRun, (run) => emit("selectedRun", run), { immediate: true });
watch(() => props.conversationId, () => { selectedRunId.value = ""; });
const historicalVersion = useQuery({
  queryKey: computed(() => ["checklists", currentRun.value?.checklist_id, "versions", currentRun.value?.checklist_version_id]),
  enabled: computed(() => Boolean(currentRun.value && !currentRun.value.checklist_snapshot)),
  queryFn: ({ signal }) => apiGet<ChecklistVersion>(`/v1/checklists/${encodeURIComponent(currentRun.value!.checklist_id)}/versions/${encodeURIComponent(currentRun.value!.checklist_version_id)}`, signal),
  retry: false
});
const configuration = computed(() => currentRun.value?.checklist_snapshot ?? historicalVersion.data.value);
const criterionConfiguration = (criterion: CriterionEvaluation): ChecklistCriterion | undefined => configuration.value?.criteria.find((item) => item.id === criterion.criterion_id);
const groups = computed(() => {
  const criteria = [...(currentRun.value?.criteria ?? [])].sort((a, b) => a.display_order - b.display_order);
  const groups = [...(configuration.value?.sections ?? [])].sort((a, b) => a.display_order - b.display_order).map((section) => ({ ...section, criteria: criteria.filter((criterion) => !isSevereCriterion(criterion, criterionConfiguration(criterion)) && criterionConfiguration(criterion)?.section_id === section.id) }));
  const assigned = new Set(groups.flatMap((group) => group.criteria.map((criterion) => criterion.criterion_id)));
  const ungrouped = criteria.filter((criterion) => !assigned.has(criterion.criterion_id) && !isSevereCriterion(criterion, criterionConfiguration(criterion)));
  if (ungrouped.length) groups.push({ id: "unassigned", name: "Scored criteria", display_order: Number.MAX_SAFE_INTEGER - 1, criteria: ungrouped });
  const severe = criteria.filter((criterion) => isSevereCriterion(criterion, criterionConfiguration(criterion)));
  if (severe.length) groups.push({ id: "severe-violations", name: "Severe Violations", display_order: Number.MAX_SAFE_INTEGER, criteria: severe });
  return groups.filter((group) => group.criteria.length);
});
const isProcessing = computed(() => currentRun.value ? ["queued", "processing", "waiting"].includes(currentRun.value.status) : false);
const summary = computed(() => currentRun.value ? summarizeCriteria(currentRun.value) : null);
const attention = computed(() => (currentRun.value?.criteria ?? []).filter(criterion => {
  const state = criterionState(criterion, criterionConfiguration(criterion), reviewerDecision(currentRun.value!, criterion.criterion_id));
  return ["partial", "zero", "critical", "error", "pending"].includes(state);
}).sort((a, b) => a.display_order - b.display_order));
const startMutation = useMutation({
  mutationFn: () => startEvaluation(props.conversationId, selectedVersionId.value, props.datasetGroupId),
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
  billing: "AI account balance exhausted",
  authentication: "Authentication error",
  authorization: "Permission error",
  not_found: "Account, model, or endpoint not found",
  rate_limited: "Rate limited",
  quota_exhausted: "Daily AI quota exhausted",
  provider_unavailable: "AI service unavailable",
  timeout: "Inference timeout",
  network: "Network error",
  malformed_response: "Invalid model response"
};
const failureLabel = computed(() => failureLabels[currentRun.value?.error_category ?? ""] ?? "Evaluation error");
const statusLabel = computed(() => currentRun.value ? ({ queued: "Queued", processing: `Processing: ${currentRun.value.completed_criteria}/${currentRun.value.total_criteria} criteria`, waiting: "Waiting for AI capacity", completed: "Completed", failed: "Retry available" }[currentRun.value.status]) : "");
function runLabel(run: EvaluationRun) { return `${new Date(run.requested_at).toLocaleString()} · ${run.status}${run.finalized_at ? ' · Reviewed' : ''}`; }
</script>

<template>
  <section class="rounded-md bg-white" aria-labelledby="evaluation-title">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-line px-3 py-3">
      <div>
        <h2 id="evaluation-title" class="text-sm font-bold text-ink">{{ mode === 'simple' ? 'What needs attention' : 'Quality evaluation' }}</h2>
        <p v-if="mode === 'advanced'" class="mt-0.5 text-xs text-muted">Select a criterion to see the explanation and evidence.</p>
      </div>
      <button class="button-secondary min-h-9 px-3 text-xs" type="button" :disabled="isProcessing" @click="dialogOpen = true">
        <Play :size="15" aria-hidden="true" /> {{ isProcessing ? "Evaluating…" : "Evaluate" }}
      </button>
    </div>

    <div v-if="historyQuery.isLoading.value" class="flex items-center justify-center gap-2 p-8 text-sm text-muted"><LoaderCircle class="animate-spin" :size="18" /> Loading evaluations…</div>
    <div v-else-if="historyQuery.isError.value" class="p-6 text-center" role="alert"><p class="text-sm font-semibold text-red-700">{{ historyQuery.error.value?.message }}</p><button type="button" class="button-secondary mt-4" @click="historyQuery.refetch()"><RotateCw :size="16" /> Retry</button></div>
    <div v-else-if="currentRun" class="px-3 py-3">
      <div v-if="mode === 'advanced' || isProcessing" class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span class="text-xs font-semibold text-muted">{{ statusLabel }} · {{ currentRun.completed_criteria }}/{{ currentRun.total_criteria }} criteria</span>
        <label v-if="mode === 'advanced' && (historyQuery.data.value?.length ?? 0) > 1" class="flex min-w-0 max-w-full items-center gap-2 text-xs text-muted">History
          <select :value="currentRun.run_id" class="min-h-8 min-w-0 max-w-full rounded border border-line bg-white px-2 text-xs text-ink" aria-label="Evaluation history" @change="selectedRunId = ($event.target as HTMLSelectElement).value"><option v-for="run in historyQuery.data.value" :key="run.run_id" :value="run.run_id">{{ runLabel(run) }}</option></select>
        </label>
      </div>
      <div v-if="currentRun.status === 'queued'" class="flex items-center gap-3 rounded-md bg-surface p-3 text-sm font-semibold"><LoaderCircle class="animate-spin text-primary" :size="18" /> Evaluation is queued</div>
      <div v-else-if="currentRun.status === 'processing'" class="rounded-md bg-surface p-3">
        <div class="flex items-center justify-between gap-4 text-sm font-semibold"><span class="inline-flex items-center gap-2"><LoaderCircle class="animate-spin text-primary" :size="18" /> Processing criteria</span><span>{{ currentRun.completed_criteria }}/{{ currentRun.total_criteria }}</span></div>
        <div class="mt-3 h-2 overflow-hidden rounded-full bg-white"><div class="h-full rounded-full bg-primary transition-all" :style="{ width: `${progress}%` }" /></div>
      </div>
      <div v-else-if="currentRun.status === 'waiting'" class="flex flex-wrap items-start justify-between gap-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900" role="status">
        <div class="flex gap-3"><LoaderCircle class="animate-spin shrink-0" :size="18" /><div><strong>{{ failureLabel }}</strong><p class="mt-1">Completed criteria are saved. Evaluation will resume automatically.</p><p v-if="currentRun.next_retry_at" class="mt-1 text-xs">Next attempt: {{ new Date(currentRun.next_retry_at).toLocaleString() }}</p></div></div>
        <button type="button" class="button-secondary min-h-9 shrink-0 px-3 text-xs" :disabled="retryMutation.isPending.value" @click="retryMutation.mutate()"><RotateCw :size="15" /> Retry now</button>
      </div>
      <div v-else-if="currentRun.status === 'failed'" class="flex flex-wrap items-start justify-between gap-3 rounded-md bg-red-50 p-3 text-sm text-red-800"><div class="flex gap-2"><AlertTriangle :size="18" class="shrink-0" /><div><strong>Retry available</strong><p class="mt-1">{{ failureLabel }}. Completed criteria are preserved.</p></div></div><button type="button" class="button-secondary min-h-9 shrink-0 px-3 text-xs" :disabled="retryMutation.isPending.value" @click="retryMutation.mutate()"><RotateCw :size="15" /> Retry failed criteria</button></div>
      <p v-if="retryMutation.error.value" class="mt-2 text-xs text-red-700" role="alert">{{ retryMutation.error.value.message }}</p>
      <p v-if="mode === 'advanced' && currentRun.finalized_at" class="mb-3 text-xs text-muted">Finalized by a reviewer. Each reviewed criterion includes the original result.</p>
      <p v-if="historicalVersion.isError.value && !currentRun.checklist_snapshot" class="mb-3 text-xs text-amber-800">Historical checklist sections are unavailable. Stored criterion results are shown below.</p>
      <template v-if="mode === 'simple'">
        <div v-if="attention.length" class="space-y-2"><CriterionScorecard v-for="criterion in attention" :key="`${currentRun.run_id}:${criterion.criterion_id}`" :criterion="criterion" :configuration="criterionConfiguration(criterion)" :transcript="transcript" :decision="reviewerDecision(currentRun, criterion.criterion_id)" @evidence="emit('evidence', $event)" /></div>
        <p v-else-if="currentRun.status === 'completed'" class="flex items-center gap-2 py-2 text-sm text-emerald-700"><CheckCircle2 :size="17" /> No issues found in this evaluation.</p>
        <p v-if="summary && currentRun.status === 'completed'" class="mt-3 text-xs text-muted">{{ summary.passed }} passed<span v-if="summary.na"> · {{ summary.na }} not applicable</span>. Switch to Advanced to review every criterion.</p>
      </template>
      <section v-for="group in mode === 'advanced' ? groups : []" :key="`${currentRun.run_id}:${group.id}`" class="mt-4" :aria-labelledby="`criterion-section-${group.id}`">
        <div class="mb-2 flex items-center justify-between gap-2"><h3 :id="`criterion-section-${group.id}`" class="text-xs font-bold leading-5 text-ink">{{ group.name }}</h3><span class="text-[11px] text-muted">{{ group.criteria.length }} {{ group.criteria.length === 1 ? 'criterion' : 'criteria' }}</span></div>
        <div class="space-y-1.5"><CriterionScorecard v-for="criterion in group.criteria" :key="`${currentRun.run_id}:${criterion.criterion_id}`" :criterion="criterion" :configuration="criterionConfiguration(criterion)" :transcript="transcript" :decision="reviewerDecision(currentRun, criterion.criterion_id)" advanced @evidence="emit('evidence', $event)" /></div>
      </section>
      <details v-if="mode === 'advanced'" class="mt-4 rounded-md border border-line p-3 text-xs text-muted"><summary class="cursor-pointer font-semibold text-ink">Evaluation details</summary><dl class="mt-3 grid gap-2 break-words sm:grid-cols-2"><div><dt>Model</dt><dd class="mt-1 text-ink">{{ currentRun.model_id }}</dd></div><div><dt>Requested</dt><dd class="mt-1 text-ink">{{ new Date(currentRun.requested_at).toLocaleString() }}</dd></div><div><dt>Checklist version</dt><dd class="mt-1 text-ink">{{ currentRun.checklist_version_id }}</dd></div><div><dt>Completed</dt><dd class="mt-1 text-ink">{{ currentRun.completed_at ? new Date(currentRun.completed_at).toLocaleString() : 'Not completed' }}</dd></div><div class="sm:col-span-2"><dt>Run ID</dt><dd class="mt-1 text-ink">{{ currentRun.run_id }}</dd></div></dl><p v-if="currentRun.error" class="mt-3 text-red-700">{{ currentRun.error }}</p></details>
      <AppealPanel v-if="mode === 'advanced' && currentRun.status === 'completed'" :conversation-id="conversationId" :run-id="currentRun.run_id" :criteria="currentRun.criteria" @evidence="emit('evidence', $event)" />
    </div>
    <div v-else class="p-8 text-center text-sm text-muted">No evaluation has been run for this conversation.</div>
  </section>

  <div v-if="dialogOpen" class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="evaluation-dialog-title" @click.self="dialogOpen = false">
    <div class="w-full max-w-md rounded-[1.5rem] bg-white p-6 shadow-2xl">
      <div class="flex items-center justify-between"><h2 id="evaluation-dialog-title" class="text-lg font-bold">Evaluate conversation</h2><button class="icon-button" type="button" aria-label="Close" @click="dialogOpen = false"><X :size="20" /></button></div>
      <label class="label mt-5" for="evaluation-checklist">Checklist</label>
      <select id="evaluation-checklist" v-model="selectedChecklistId" class="field mt-2"><option v-for="checklist in activeChecklists" :key="checklist.id" :value="checklist.id">{{ checklist.name }}</option></select>
      <p class="mt-3 text-sm text-muted">The checklist’s current configuration will be used.</p>
      <p v-if="startMutation.error.value" class="mt-3 text-sm text-red-700">{{ startMutation.error.value.message }}</p>
      <div class="mt-6 flex justify-end gap-3"><button class="button-secondary" type="button" @click="dialogOpen = false">Cancel</button><button class="button-primary" type="button" :disabled="!selectedVersionId || startMutation.isPending.value" @click="startMutation.mutate()"><LoaderCircle v-if="startMutation.isPending.value" class="animate-spin" :size="17" /> Start evaluation</button></div>
    </div>
  </div>
</template>
