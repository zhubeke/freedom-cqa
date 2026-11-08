<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { useRoute, useRouter } from "vue-router";
import { CheckCircle2, CircleAlert, ExternalLink, FileSearch, Inbox, LoaderCircle, RefreshCw, Search, X } from "lucide-vue-next";
import { appealKeys, decideAppeal, getAppealSummary, listAppeals, type AppealDecisionBody } from "../../api/appeals";
import { apiGet } from "../../api/client";
import { actionKeys } from "../../api/actions";
import { evaluationKeys, getEvaluation } from "../../api/evaluations";
import { useHistoryStore } from "../../app/history";
import ConfirmDialog from "../../components/ConfirmDialog/ConfirmDialog.vue";
import type { Appeal, DecisionOutcome } from "../../shared/types/appeal";
import type { ChecklistVersion } from "../../shared/types/checklist";
import EvaluationComparison from "./components/EvaluationComparison/EvaluationComparison.vue";
import ReviewEvidenceDrawer from "./components/ReviewEvidenceDrawer/ReviewEvidenceDrawer.vue";
import { appealOutcome, deriveOutcome, displayValue, finalizedContribution, isDecided, outcomeLabel, workflowLabel } from "./review-model";

type QueueFilter = "all" | "todo" | "done";
type QueueSort = "newest" | "oldest" | "priority" | "workflow";
interface DecisionDraft { mode: "CONFIRMED" | "OVERRIDDEN"; value: string; justification: string; explanation: string; evidence: string }
interface Confirmation { appeal: Appeal; body: AppealDecisionBody; outcome: DecisionOutcome }
const client = useQueryClient(); const history = useHistoryStore(); const router = useRouter(); const route = useRoute();
const search = ref(""); const queueFilter = ref<QueueFilter>("all"); const sort = ref<QueueSort>("newest"); const reviewer = ref("");
const activeId = ref(typeof route.query.appeal === "string" ? route.query.appeal : "");
const drafts = ref<Record<string, DecisionDraft>>({}); const confirmation = ref<Confirmation | null>(null);
const drawer = ref<{ source: "original" | "final"; reference?: string } | null>(null);
const query = useQuery({ queryKey: appealKeys.queue, queryFn: ({ signal }) => listAppeals("", signal) });
const summaryQuery = useQuery({ queryKey: appealKeys.summary, queryFn: ({ signal }) => getAppealSummary(signal), retry: 1 });
const appeals = computed(() => query.data.value ?? []);
const active = computed(() => appeals.value.find(appeal => appeal.appeal_id === activeId.value) ?? null);
const draft = computed(() => active.value ? drafts.value[active.value.appeal_id] : undefined);
const totalCount = computed(() => summaryQuery.data.value?.total ?? appeals.value.length);
const needsReviewCount = computed(() => summaryQuery.data.value?.pending ?? appeals.value.filter(appeal => !isDecided(appeal)).length);
const decidedCount = computed(() => summaryQuery.data.value?.completed ?? appeals.value.filter(isDecided).length);
const filteredAppeals = computed(() => {
  const term = search.value.trim().toLowerCase();
  const items = appeals.value.filter(appeal => (queueFilter.value === "all" || (queueFilter.value === "done") === isDecided(appeal))
    && (!term || [appeal.criterion_name, appeal.conversation_id].some(value => value.toLowerCase().includes(term))));
  return items.sort((a, b) => {
    if (sort.value === "priority") return (b.priority ?? 0) - (a.priority ?? 0) || b.created_at.localeCompare(a.created_at);
    if (sort.value === "workflow") { const rank = { OPEN: 0, UNDER_REVIEW: 1, CONFIRMED: 2, OVERRIDDEN: 2 }; return rank[a.status] - rank[b.status] || b.created_at.localeCompare(a.created_at); }
    return sort.value === "oldest" ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at);
  });
});
const emptyQueueMessage = computed(() => search.value.trim() ? "No appeals match your search." : queueFilter.value === "todo" ? "No appeals need review. All submitted appeals have decisions." : queueFilter.value === "done" ? "No completed decisions yet." : "No appeals yet.");
function initializeDraft(appeal: Appeal) {
  drafts.value[appeal.appeal_id] ??= { mode: "CONFIRMED", value: appeal.original_evaluation.raw_value === null ? "na" : String(appeal.original_evaluation.raw_value), justification: "", explanation: appeal.original_evaluation.explanation ?? "", evidence: appeal.original_evaluation.evidence_message_ids.join("\n") };
}
watch(appeals, items => {
  if (active.value) initializeDraft(active.value);
  else if (items.length) selectAppeal(filteredAppeals.value[0] ?? items[0]!);
}, { immediate: true });
watch(() => route.query.appeal, id => { if (typeof id === "string" && appeals.value.some(appeal => appeal.appeal_id === id)) { activeId.value = id; initializeDraft(active.value!); } });
function selectAppeal(appeal: Appeal) {
  activeId.value = appeal.appeal_id; initializeDraft(appeal); drawer.value = null;
  void router.replace({ query: { ...route.query, appeal: appeal.appeal_id } });
}
const runQuery = useQuery({
  queryKey: computed(() => ["evaluation", active.value?.evaluation_run_id]), enabled: computed(() => Boolean(active.value)),
  queryFn: ({ signal }) => getEvaluation(active.value!.evaluation_run_id, signal), retry: 1
});
const historicalVersion = useQuery({
  queryKey: computed(() => ["checklists", runQuery.data.value?.checklist_id, "versions", runQuery.data.value?.checklist_version_id]),
  enabled: computed(() => Boolean(runQuery.data.value && !runQuery.data.value.checklist_snapshot)),
  queryFn: ({ signal }) => apiGet<ChecklistVersion>(`/v1/checklists/${encodeURIComponent(runQuery.data.value!.checklist_id)}/versions/${encodeURIComponent(runQuery.data.value!.checklist_version_id)}`, signal), retry: false
});
const configuration = computed(() => runQuery.data.value?.checklist_snapshot ?? historicalVersion.data.value);
const criterionConfiguration = computed(() => configuration.value?.criteria.find(criterion => criterion.id === active.value?.criterion_id));
const scaleMaximum = computed(() => {
  const values = criterionConfiguration.value?.numeric_scale.map(option => option.value) ?? active.value?.original_evaluation.allowed_values ?? [];
  return values.length ? Math.max(...values) : active.value?.original_evaluation.scale_maximum ?? null;
});
const finalContribution = computed(() => {
  const appeal = active.value; const run = runQuery.data.value;
  if (!appeal?.decision || !isDecided(appeal)) return null;
  // A historical appeal compares its own decision, even if a later appeal exists.
  if (run && configuration.value) return finalizedContribution({ ...run, appeals: [appeal] }, configuration.value.criteria, appeal.criterion_id);
  if (appeal.decision.effective_value === null) return null;
  if (appeal.decision.effective_value === appeal.original_evaluation.raw_value) return appeal.original_evaluation.weighted_contribution;
  const weight = appeal.original_evaluation.criterion_weight;
  if (weight === undefined) return null;
  const value = appeal.decision.effective_value;
  if (typeof value === "boolean") return Number(value) * weight;
  return scaleMaximum.value && scaleMaximum.value > 0 ? value / scaleMaximum.value * weight : null;
});
const allowedValues = computed(() => criterionConfiguration.value?.numeric_scale ?? active.value?.original_evaluation.numeric_scale ?? active.value?.original_evaluation.allowed_values.map(value => ({ value, description: "" })) ?? []);
const finalValue = computed<boolean | number | null>(() => {
  if (!active.value || !draft.value || draft.value.mode === "CONFIRMED") return active.value?.original_evaluation.raw_value ?? null;
  return draft.value.value === "na" ? null : active.value.original_evaluation.answer_type === "numeric" ? Number(draft.value.value) : draft.value.value === "true";
});
const evidenceIds = computed(() => [...new Set((draft.value?.evidence ?? "").split(/[\n,]+/).map(id => id.trim()).filter(Boolean))]);
const validValue = computed(() => {
  if (!active.value || !draft.value) return false;
  if (draft.value.mode === "CONFIRMED") return true;
  if (finalValue.value === null) return active.value.original_evaluation.na_enabled;
  return active.value.original_evaluation.answer_type !== "numeric" || allowedValues.value.some(option => option.value === finalValue.value);
});
const effectiveDraftExplanation = computed(() => !active.value || !draft.value || draft.value.mode === "CONFIRMED" || draft.value.explanation === (active.value.original_evaluation.explanation ?? "") ? active.value?.original_evaluation.explanation ?? null : draft.value.explanation.trim());
const previewOutcome = computed(() => active.value && draft.value ? deriveOutcome(active.value.original_evaluation, finalValue.value, effectiveDraftExplanation.value, draft.value.mode === "CONFIRMED" ? active.value.original_evaluation.evidence_message_ids : evidenceIds.value) : "UPHELD");
const canRecord = computed(() => Boolean(active.value && draft.value && !isDecided(active.value) && reviewer.value.trim() && draft.value.justification.trim() && validValue.value && (draft.value.mode === "CONFIRMED" || draft.value.explanation.trim())));
const mutation = useMutation({
  mutationFn: ({ id, body }: { id: string; body: AppealDecisionBody }) => decideAppeal(id, body),
  onSuccess: async result => {
    confirmation.value = null;
    client.setQueryData<Appeal[]>(appealKeys.queue, items => items?.map(item => item.appeal_id === result.appeal_id ? result : item));
    history.notify(isDecided(result) ? "Review decision recorded" : "Appeal marked in review");
    await Promise.all([
      client.invalidateQueries({ queryKey: ["appeals"] }), client.invalidateQueries({ queryKey: evaluationKeys.history(result.conversation_id) }),
      client.invalidateQueries({ queryKey: ["evaluation", result.evaluation_run_id] }), client.invalidateQueries({ queryKey: ["conversation", result.conversation_id] }),
      client.invalidateQueries({ queryKey: ["conversations"] }), client.invalidateQueries({ queryKey: actionKeys.detail(result.conversation_id) }), client.invalidateQueries({ queryKey: actionKeys.status }), client.invalidateQueries({ queryKey: ["analytics"] })
    ]);
  }, onError: error => history.notify(error.message, "error")
});
const decisionError = computed(() => mutation.variables.value?.id === activeId.value ? mutation.error.value?.message : "");
function decisionBody(status = draft.value?.mode): AppealDecisionBody | null {
  if (!active.value || !draft.value || !status) return null;
  return { status, reviewer: reviewer.value.trim(), justification: draft.value.justification.trim(), ...(status === "OVERRIDDEN" ? { override_value: finalValue.value, ...(draft.value.explanation !== (active.value.original_evaluation.explanation ?? "") ? { revised_explanation: draft.value.explanation.trim() } : {}), ...(draft.value.evidence !== active.value.original_evaluation.evidence_message_ids.join("\n") ? { revised_evidence_message_ids: evidenceIds.value } : {}) } : {}) };
}
function confirmDecision() {
  const body = decisionBody();
  if (canRecord.value && active.value && body && !mutation.isPending.value) confirmation.value = { appeal: active.value, body, outcome: previewOutcome.value };
}
function recordConfirmedDecision() {
  if (!confirmation.value || mutation.isPending.value) return;
  mutation.mutate({ id: confirmation.value.appeal.appeal_id, body: confirmation.value.body });
}
function markInReview() {
  const body = decisionBody(); if (!active.value || !body || !canRecord.value || mutation.isPending.value) return;
  mutation.mutate({ id: active.value.appeal_id, body: { status: "UNDER_REVIEW", reviewer: body.reviewer, justification: body.justification } });
}
function openEvidence(source: "original" | "final", reference?: string) { drawer.value = { source, reference }; }
const drawerEvidence = computed(() => {
  if (!active.value) return { ids: [], turns: [] };
  if (drawer.value?.source === "final" && active.value.decision?.effective_evidence_message_ids !== undefined) return { ids: active.value.decision.effective_evidence_message_ids, turns: [] };
  return { ids: active.value.original_evaluation.evidence_message_ids, turns: active.value.original_evaluation.evidence_turns };
});
function formatDate(value: string, time = false) {
  const date = new Date(value); if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", ...(time ? { timeStyle: "short" } : {}) }).format(date);
}
</script>

<template>
  <section class="appeals-page mx-auto w-full max-w-[100rem]">
    <header class="flex flex-wrap items-center justify-between gap-3"><div><h1 class="text-2xl font-semibold tracking-tight">Appeal reviews</h1><p class="mt-1 text-sm text-muted">Compare evaluations, inspect evidence, and record a clear decision.</p></div><button type="button" class="button-secondary !min-h-9" :disabled="query.isFetching.value || summaryQuery.isFetching.value" @click="query.refetch(); summaryQuery.refetch()"><RefreshCw :size="15" :class="{ 'animate-spin': query.isFetching.value }" />Refresh</button></header>
    <dl class="my-4 flex flex-wrap gap-x-6 gap-y-2 border-y border-line py-2.5 text-sm"><div class="flex gap-2"><dt class="text-muted">Total appeals</dt><dd class="font-semibold">{{ totalCount }}</dd></div><div class="flex gap-2"><dt class="text-muted">Pending reviews</dt><dd class="font-semibold" :class="needsReviewCount ? 'text-amber-800' : ''">{{ needsReviewCount }}</dd></div><div class="flex gap-2"><dt class="text-muted">Completed decisions</dt><dd class="font-semibold text-emerald-800">{{ decidedCount }}</dd></div></dl>
    <div v-if="query.isPending.value" class="flex min-h-48 items-center justify-center gap-2 rounded-lg border border-line bg-white text-sm text-muted" role="status"><LoaderCircle class="animate-spin" :size="20" />Loading appeal queue…</div>
    <div v-else-if="query.isError.value && !appeals.length" class="rounded-lg border border-red-200 bg-white p-6 text-center" role="alert"><CircleAlert class="mx-auto text-red-600" :size="24" /><h2 class="mt-3 font-semibold">Couldn’t load appeal reviews</h2><p class="mt-1 text-sm text-muted">{{ query.error.value?.message }}</p><button class="button-secondary mt-4" type="button" @click="query.refetch()">Try again</button></div>
    <template v-else>
      <p v-if="query.isError.value" class="mb-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900" role="alert">The queue could not refresh. Previously loaded appeals are shown. {{ query.error.value?.message }}</p>
      <div v-if="appeals.length" class="review-layout grid items-start gap-4">
        <aside class="min-w-0 overflow-hidden rounded-lg border border-line bg-white lg:sticky lg:top-24" aria-label="Appeal queue">
          <div class="space-y-3 border-b border-line p-3">
            <div class="relative"><Search :size="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input v-model="search" type="search" class="field !py-2 !pl-9 !pr-9" placeholder="Criterion or conversation ID" aria-label="Search by criterion or conversation ID" /><button v-if="search" type="button" class="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center text-muted" aria-label="Clear appeal search" @click="search = ''"><X :size="15" /></button></div>
            <div class="grid grid-cols-3 rounded-md bg-surface p-1" role="group" aria-label="Filter appeal queue"><button v-for="option in ([['all','All'],['todo','To do'],['done','Done']] as const)" :key="option[0]" type="button" :aria-pressed="queueFilter === option[0]" class="min-h-8 rounded px-2 text-xs font-semibold" :class="queueFilter === option[0] ? 'bg-white shadow-sm' : 'text-muted hover:text-ink'" @click="queueFilter = option[0]">{{ option[1] }}</button></div>
            <label class="flex items-center gap-2 text-xs text-muted">Sort<select v-model="sort" class="min-h-8 min-w-0 flex-1 rounded border border-line bg-white px-2 text-xs text-ink" aria-label="Sort appeal queue"><option value="newest">Submission date · newest</option><option value="oldest">Submission date · oldest</option><option value="priority">Priority · highest</option><option value="workflow">Workflow status</option></select></label>
          </div>
          <div class="queue-scroll overflow-y-auto p-1.5"><button v-for="appeal in filteredAppeals" :key="appeal.appeal_id" type="button" :aria-pressed="activeId === appeal.appeal_id" class="mb-1 block w-full rounded-md border px-3 py-3 text-left transition last:mb-0" :class="activeId === appeal.appeal_id ? 'border-slate-300 bg-slate-50' : 'border-transparent hover:border-line hover:bg-surface/60'" @click="selectAppeal(appeal)"><p class="text-sm font-semibold leading-5">{{ appeal.criterion_name }}</p><p class="mt-1 break-words text-xs text-muted">{{ appeal.conversation_id }} · {{ formatDate(appeal.created_at) }}</p><div class="mt-2 flex items-center justify-between gap-2"><span class="rounded px-1.5 py-0.5 text-[11px] font-medium" :class="isDecided(appeal) ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'">{{ workflowLabel(appeal.status) }}</span><span v-if="appeal.priority !== undefined" class="text-[11px] text-muted">Priority {{ appeal.priority }}</span></div></button><div v-if="!filteredAppeals.length" class="px-3 py-8 text-center"><p class="text-sm text-muted">{{ emptyQueueMessage }}</p><button v-if="search || queueFilter !== 'all'" type="button" class="mt-3 text-xs font-semibold underline" @click="search = ''; queueFilter = 'all'">Clear search and filters</button></div></div>
        </aside>
        <article v-if="active" class="min-w-0 overflow-hidden rounded-lg border border-line bg-white">
          <header class="border-b border-line px-4 py-4 sm:px-5"><div class="flex flex-wrap items-start justify-between gap-3"><div class="min-w-0"><h2 class="text-lg font-semibold">{{ active.criterion_name }}</h2><p class="mt-1 text-xs text-muted">Conversation: <span class="font-medium text-ink">{{ active.conversation_id }}</span> · Submitted {{ formatDate(active.created_at) }}</p><div class="mt-2 flex flex-wrap gap-2 text-xs"><span class="rounded px-2 py-1 font-medium" :class="isDecided(active) ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'">{{ workflowLabel(active.status) }}</span><span v-if="isDecided(active) && active.decision" class="rounded bg-surface px-2 py-1 font-medium">{{ outcomeLabel(appealOutcome(active)) }}</span></div></div><RouterLink class="button-secondary !min-h-9 !px-3 !text-xs" :to="{ name: 'conversation-detail', params: { id: active.conversation_id }, query: { datasetGroupId: active.dataset_group_id, from: `/reviews?appeal=${encodeURIComponent(active.appeal_id)}` } }"><ExternalLink :size="14" />Open conversation</RouterLink></div><p v-if="!filteredAppeals.some(item => item.appeal_id === active?.appeal_id)" class="mt-3 text-xs text-muted">This selected appeal is outside the current queue filters.</p></header>
          <div class="space-y-4 p-4 sm:p-5">
            <section class="border-l-2 border-slate-200 pl-3"><h3 class="text-xs font-semibold text-muted">Reason for appeal</h3><p class="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{{ active.comment }}</p></section>
            <EvaluationComparison :appeal="active" :final-contribution="finalContribution" :scale-maximum="scaleMaximum" @evidence="openEvidence" />
            <p v-if="runQuery.isError.value || historicalVersion.isError.value" class="text-xs text-amber-800">Historical scoring details could not be loaded. The stored appeal and its original constraints are still available.</p>
            <p v-if="active.original_evaluation.na_enabled" class="text-xs text-muted">Weighted points are shown before any N/A redistribution. Conversation totals use the finalized scoring calculation.</p>
            <div v-if="runQuery.data.value?.finalized_at" class="flex flex-wrap items-baseline gap-x-5 gap-y-1 rounded-md bg-surface px-3 py-2 text-xs"><p>Original conversation score <strong class="ml-1">{{ runQuery.data.value.final_score ?? 'N/A' }}</strong></p><p>Finalized conversation score <strong class="ml-1">{{ runQuery.data.value.finalized_score ?? 'N/A' }}</strong></p></div>
            <section v-if="isDecided(active)" aria-label="Recorded decision" class="rounded-md border border-line p-4"><div class="flex items-center gap-2 text-emerald-800"><CheckCircle2 :size="17" /><h3 class="text-sm font-semibold">Decision recorded</h3></div><template v-if="active.decision"><h4 class="mt-3 text-xs font-semibold">Decision rationale</h4><p class="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{{ active.decision.justification || 'No decision rationale was recorded.' }}</p><p class="mt-3 border-t border-line pt-3 text-xs text-muted"><span v-if="active.decision.reviewer">Reviewer: <strong class="font-medium text-ink">{{ active.decision.reviewer }}</strong></span><span v-if="active.decision.reviewer && active.decision.decided_at"> · </span><span v-if="active.decision.decided_at">Decided {{ formatDate(active.decision.decided_at, true) }}</span></p></template><p v-else class="mt-2 text-sm text-muted">Historical decision details were not recorded.</p></section>
            <form v-else-if="draft" class="rounded-md border border-line p-4" @submit.prevent="confirmDecision">
              <h3 class="text-sm font-semibold">Review decision</h3>
              <fieldset class="mt-3"><legend class="label">Decision</legend><div class="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm"><label class="flex items-center gap-2"><input v-model="draft.mode" type="radio" value="CONFIRMED" name="decision-mode" class="accent-slate-700" />Uphold original evaluation</label><label class="flex items-center gap-2"><input v-model="draft.mode" type="radio" value="OVERRIDDEN" name="decision-mode" class="accent-slate-700" />Change evaluation</label></div></fieldset>
              <div class="mt-4 grid gap-4 sm:grid-cols-2"><label class="label" for="reviewer-name">Reviewer name<input id="reviewer-name" v-model="reviewer" class="field mt-1.5" autocomplete="name" required placeholder="Enter your name" /></label><label class="label" for="final-criterion-value">Final criterion value<input v-if="draft.mode === 'CONFIRMED'" id="final-criterion-value" class="field mt-1.5" :value="displayValue(active.original_evaluation.raw_value)" readonly /><select v-else-if="active.original_evaluation.answer_type === 'numeric'" id="final-criterion-value" v-model="draft.value" class="field mt-1.5" required><option v-for="option in allowedValues" :key="option.value" :value="String(option.value)">{{ option.value }}{{ option.description ? ` · ${option.description}` : '' }}</option><option v-if="active.original_evaluation.na_enabled" value="na">N/A</option></select><select v-else id="final-criterion-value" v-model="draft.value" class="field mt-1.5"><option value="true">Yes</option><option value="false">No</option><option v-if="active.original_evaluation.na_enabled" value="na">N/A</option></select></label></div>
              <template v-if="draft.mode === 'OVERRIDDEN'"><label class="label mt-4" for="final-evaluation-rationale">Final evaluation rationale<textarea id="final-evaluation-rationale" v-model="draft.explanation" class="field mt-1.5 min-h-24 resize-y" required /></label><p class="mt-1 text-xs text-muted">Keep the same value to make a reasoning-only revision.</p><details class="mt-3"><summary class="cursor-pointer text-xs font-semibold text-muted">Revise evidence references</summary><label class="label mt-2" for="revised-evidence">Stable message IDs, one per line<textarea id="revised-evidence" v-model="draft.evidence" class="field mt-1.5 min-h-20 resize-y font-mono" /><span class="mt-1 block font-normal">Copy exact message IDs from the evidence drawer. Clearing this field explicitly removes the evidence references.</span></label></details></template>
              <label class="label mt-4" for="decision-rationale">Decision rationale<textarea id="decision-rationale" v-model="draft.justification" class="field mt-1.5 min-h-24 resize-y" required placeholder="Explain your decision using the conversation evidence…" /></label>
              <div class="mt-4 flex flex-wrap items-center justify-between gap-3"><div class="text-xs text-muted">Outcome: <strong class="font-semibold text-ink">{{ outcomeLabel(previewOutcome) }}</strong></div><div class="flex flex-wrap gap-2"><button type="button" class="button-secondary !min-h-9 !text-xs" @click="openEvidence('original')"><FileSearch :size="14" />Review evidence</button><button v-if="active.status === 'OPEN'" type="button" class="button-secondary !min-h-9 !text-xs" :disabled="!canRecord || mutation.isPending.value" @click="markInReview">Mark in review</button><button type="submit" class="button-primary !min-h-9 !bg-slate-800 hover:!bg-slate-900" :disabled="!canRecord || mutation.isPending.value"><LoaderCircle v-if="mutation.isPending.value" :size="15" class="animate-spin" />{{ mutation.isPending.value ? 'Recording…' : 'Record decision' }}</button></div></div>
              <p v-if="!validValue" class="mt-3 text-xs text-red-700" role="alert">Choose a value allowed by this checklist version.</p><p v-if="decisionError" class="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800" role="alert">{{ decisionError }}</p>
            </form>
          </div>
        </article>
        <div v-else class="rounded-lg border border-line bg-white p-8 text-center text-sm text-muted">Select an appeal to review its evaluation.</div>
      </div>
      <div v-else class="rounded-lg border border-dashed border-line bg-white px-5 py-12 text-center"><Inbox :size="26" class="mx-auto text-muted" /><h2 class="mt-3 font-semibold">No appeals yet</h2><p class="mt-1 text-sm text-muted">Appeals appear here when an evaluation is disputed.</p></div>
    </template>
    <ReviewEvidenceDrawer v-if="drawer && active" :appeal="active" :evidence-ids="drawerEvidence.ids" :evidence-turns="drawerEvidence.turns" :focused-reference="drawer.reference" @close="drawer = null" />
    <ConfirmDialog v-if="confirmation" title="Record review decision?" confirm-label="Confirm decision" :busy="mutation.isPending.value" @cancel="confirmation = null" @confirm="recordConfirmedDecision"><dl class="space-y-2"><div><dt class="text-xs font-semibold text-muted">Criterion</dt><dd class="font-semibold text-ink">{{ confirmation.appeal.criterion_name }}</dd></div><div class="flex gap-5"><p>Original: <strong>{{ displayValue(confirmation.appeal.original_evaluation.raw_value) }}</strong></p><p>Final: <strong>{{ displayValue(confirmation.body.status === 'OVERRIDDEN' ? confirmation.body.override_value! : confirmation.appeal.original_evaluation.raw_value) }}</strong></p></div><div><dt class="text-xs font-semibold text-muted">Decision outcome</dt><dd>{{ outcomeLabel(confirmation.outcome) }}</dd></div><div><dt class="text-xs font-semibold text-muted">Decision rationale</dt><dd class="whitespace-pre-wrap break-words text-ink">{{ confirmation.body.justification }}</dd></div></dl><p v-if="mutation.error.value" class="mt-3 text-red-700" role="alert">{{ mutation.error.value.message }}</p></ConfirmDialog>
  </section>
</template>

<style scoped>
.appeals-page :deep(.field), .appeals-page :deep(.button-primary), .appeals-page :deep(.button-secondary) { border-radius: .375rem; }
.appeals-page :deep(.button-primary), .appeals-page :deep(.button-secondary) { font-weight: 600; }
.queue-scroll { max-height: min(64vh, 46rem); }
@media (min-width: 1024px) { .review-layout { grid-template-columns: minmax(17rem, 30%) minmax(0, 1fr); } }
@media (prefers-reduced-motion: reduce) { .appeals-page :deep(*) { transition-duration: 0s !important; animation-duration: 0s !important; } }
</style>
