<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { CheckCircle2, RefreshCw, ShieldAlert } from "lucide-vue-next";
import { ApiError } from "../../api/client";
import { actionKeys, classify, getAction, getClassificationStatus, getLabels, verifyLabel } from "../../api/actions";
import { ACTION_CODES, ACTION_LABELS, type ActionCode } from "../../shared/types/action";

const props = withDefaults(defineProps<{ conversationId: string; datasetGroupId?: string; mode?: "simple" | "advanced" }>(), { mode: "advanced" });
const emit = defineEmits<{ evidence: [messageId: string] }>();
const client = useQueryClient(); const selected = ref<ActionCode>("NO_ACTION"); const reviewer = ref("");
const verificationFeedback = ref<{ type: "success" | "error"; message: string } | null>(null);
const actionQuery = useQuery({ queryKey: computed(() => actionKeys.detail(props.conversationId, props.datasetGroupId)), queryFn: ({ signal }) => getAction(props.conversationId, signal, props.datasetGroupId), retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 1, refetchInterval: (query) => ["queued", "processing"].includes(query.state.data?.status ?? "") ? 1000 : false });
const labelsQuery = useQuery({ queryKey: computed(() => actionKeys.label(props.conversationId, props.datasetGroupId)), queryFn: ({ signal }) => getLabels(props.conversationId, signal, props.datasetGroupId), enabled: computed(() => props.mode === "advanced") });
const classifier = useQuery({ queryKey: actionKeys.status, queryFn: ({ signal }) => getClassificationStatus(signal), enabled: computed(() => props.mode === "advanced"), staleTime: 30000 });
const actionMissing = computed(() => actionQuery.error.value instanceof ApiError && actionQuery.error.value.status === 404);
const label = computed(() => labelsQuery.data.value?.[0]);
watch(label, (value) => { if (value) selected.value = value.verified_action ?? value.proposed_action; }, { immediate: true });
const request = useMutation({ mutationFn: () => classify(props.conversationId, Boolean(actionQuery.data.value), props.datasetGroupId), onSuccess: async () => { await client.invalidateQueries({ queryKey: actionKeys.detail(props.conversationId) }); } });
watch([selected, reviewer], () => { verificationFeedback.value = null; });
const verify = useMutation({
  mutationFn: () => verifyLabel(label.value!.label_id, selected.value, reviewer.value.trim()),
  onMutate: () => { verificationFeedback.value = null; },
  onSuccess: async () => {
    await client.invalidateQueries({ queryKey: actionKeys.label(props.conversationId) });
    await client.invalidateQueries({ queryKey: actionKeys.status });
    verificationFeedback.value = { type: "success", message: "Training sample saved." };
  },
  onError: (error) => {
    verificationFeedback.value = { type: "error", message: error instanceof Error ? error.message : "Unable to update the training label." };
  }
});
const pending = computed(() => request.isPending.value || ["queued", "processing"].includes(actionQuery.data.value?.status ?? ""));
</script>

<template>
  <section class="rounded-md bg-white p-3" aria-labelledby="recommended-action-title">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0 flex-1">
        <p class="text-xs font-medium text-muted">Recommended follow-up</p>
        <h2 id="recommended-action-title" class="mt-1 text-base font-semibold text-ink">
          {{ actionQuery.data.value?.final_action ? ACTION_LABELS[actionQuery.data.value.final_action] : actionQuery.isLoading.value ? "Loading recommendation…" : pending ? "Finding a recommendation…" : actionQuery.isError.value && !actionMissing ? "Recommendation unavailable" : actionQuery.data.value?.status === 'failed' ? "Recommendation failed" : "No recommendation yet" }}
        </h2>
        <p v-if="actionQuery.data.value?.classification_source === 'rules' && actionQuery.data.value.local_rule_prediction?.explanation" class="mt-2 max-w-3xl text-sm leading-6 text-muted">{{ actionQuery.data.value.local_rule_prediction.explanation }}</p>
      </div>
      <button type="button" class="button-secondary shrink-0 !min-h-8 !rounded-md !px-3 !text-xs" :disabled="pending || actionQuery.isLoading.value" @click="request.mutate()"><RefreshCw :size="14" :class="{ 'animate-spin': pending }" /> {{ actionQuery.data.value ? "Refresh" : "Get recommendation" }}</button>
    </div>
    <p v-if="request.error.value || (actionQuery.isError.value && !actionMissing)" class="mt-3 text-xs text-red-700" role="alert">{{ request.error.value?.message ?? actionQuery.error.value?.message }}</p>
    <div v-if="mode === 'advanced' && actionQuery.data.value?.final_action" class="mt-4 flex flex-wrap gap-2 text-xs">
      <span class="rounded-full bg-primary-soft px-3 py-1.5 font-semibold text-primary">{{ actionQuery.data.value.classification_source === "tabpfn" ? "TabPFN" : "Rules" }}</span>
      <span v-if="actionQuery.data.value.model_confidence !== null" class="rounded-full bg-surface px-3 py-1.5 text-muted">{{ Math.round(actionQuery.data.value.model_confidence * 100) }}% confidence</span>
      <span class="rounded-full bg-surface px-3 py-1.5 capitalize text-muted">{{ actionQuery.data.value.status }}</span>
    </div>
    <div v-if="actionQuery.data.value?.override_reason" class="mt-4 flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><ShieldAlert :size="18" class="shrink-0" />{{ actionQuery.data.value.override_reason }}</div>
    <div v-if="actionQuery.data.value?.evidence_message_ids?.length" class="mt-5">
      <p class="text-xs font-semibold text-muted">Supporting evidence</p>
      <div class="mt-2 flex flex-wrap gap-2"><button v-for="(id, index) in actionQuery.data.value.evidence_message_ids" :key="id" type="button" class="rounded-lg border border-line px-3 py-1.5 text-xs text-primary hover:bg-primary-soft" @click="emit('evidence', id)">Evidence {{ index + 1 }}</button></div>
    </div>
    <div v-if="mode === 'advanced'" class="mt-5 rounded-md border border-line p-3">
      <h3 class="text-sm font-semibold text-ink">Classifier details</h3>
      <div v-if="actionQuery.data.value?.local_rule_prediction" class="mt-3 rounded border border-line p-3 text-xs text-muted"><p class="font-medium text-ink">Rules suggested: {{ actionQuery.data.value.local_rule_prediction.action ? ACTION_LABELS[actionQuery.data.value.local_rule_prediction.action] : 'Not recorded' }}</p><p class="mt-1 leading-5">{{ actionQuery.data.value.local_rule_prediction.explanation }}</p><details v-if="actionQuery.data.value.local_rule_prediction.supporting_features" class="mt-2"><summary class="cursor-pointer">Supporting features</summary><pre class="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[11px]">{{ JSON.stringify(actionQuery.data.value.local_rule_prediction.supporting_features, null, 2) }}</pre></details></div>
      <p v-if="actionQuery.data.value?.tabpfn_unavailable_reason" class="mt-2 text-xs leading-5 text-muted">{{ actionQuery.data.value.tabpfn_unavailable_reason }}</p>
      <div v-if="classifier.data.value" class="mt-3 space-y-2 text-xs text-muted">
        <p>TabPFN: <strong class="text-ink">{{ classifier.data.value.enabled ? (classifier.data.value.training.ready ? 'Samples ready' : 'Needs verified samples') : 'Disabled' }}</strong></p>
        <p>Training source: verified samples from the database.</p>
        <p>{{ classifier.data.value.training.eligible_total }} eligible · {{ classifier.data.value.training.verified_total }} verified · {{ classifier.data.value.training.rejected_total }} excluded</p>
        <p>Requires {{ classifier.data.value.training.minimum_total }} eligible samples and at least {{ classifier.data.value.training.minimum_per_class }} samples in each of two or more action classes.</p>
        <dl class="space-y-1"><div v-for="(count, code) in classifier.data.value.training.class_counts" :key="code" class="flex justify-between gap-3"><dt>{{ ACTION_LABELS[code] }}</dt><dd>{{ count }}</dd></div></dl>
        <p v-if="actionQuery.data.value?.training_sample_count != null">Eligible database samples for this result: {{ actionQuery.data.value.training_sample_count }}.</p>
        <p v-if="classifier.data.value.model">Model: {{ classifier.data.value.model.provider_model_id }} · {{ classifier.data.value.model.status }}</p>
      </div>
      <p v-else-if="classifier.isLoading.value" class="mt-3 text-xs text-muted">Loading training samples…</p>
      <p v-else-if="classifier.isError.value" class="mt-3 text-xs text-red-700">Couldn’t load training status. <button type="button" class="underline" @click="classifier.refetch()">Retry</button></p>
      <p v-if="actionQuery.data.value?.previous_classification?.final_action" class="mt-3 text-xs text-muted">Original classification: <strong>{{ ACTION_LABELS[actionQuery.data.value.previous_classification.final_action] }}</strong></p>
    <div v-if="label" class="mt-4 border-t border-line pt-4">
      <div class="flex items-center gap-2 text-sm font-semibold text-ink"><CheckCircle2 :size="18" /> Verify training label</div>
      <div class="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <select v-model="selected" aria-label="Verified follow-up action" class="min-h-10 rounded-md border border-line bg-white px-3 text-xs"><option v-for="code in ACTION_CODES" :key="code" :value="code">{{ ACTION_LABELS[code] }}</option></select>
        <input v-model="reviewer" aria-label="Reviewer name" class="min-h-10 rounded-md border border-line px-3 text-xs" placeholder="Reviewer name" />
        <button type="button" class="min-h-11 rounded-xl border border-primary px-4 text-sm font-semibold text-primary disabled:opacity-50" :disabled="!reviewer.trim() || verify.isPending.value" @click="verify.mutate()">{{ verify.isPending.value ? "Saving..." : label.verification_status === "VERIFIED" ? "Update" : "Confirm" }}</button>
      </div>
      <p
        v-if="verificationFeedback"
        class="mt-3 text-sm"
        :class="verificationFeedback.type === 'success' ? 'text-emerald-700' : 'text-red-700'"
        role="status"
        aria-live="polite"
      >
        {{ verificationFeedback.message }}
      </p>
    </div>
    </div>
  </section>
</template>
