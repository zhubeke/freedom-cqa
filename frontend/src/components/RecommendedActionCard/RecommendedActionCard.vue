<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { CheckCircle2, RefreshCw, ShieldAlert } from "lucide-vue-next";
import { ApiError } from "../../api/client";
import { actionKeys, classify, getAction, getLabels, verifyLabel } from "../../api/actions";
import { ACTION_CODES, ACTION_LABELS, type ActionCode } from "../../shared/types/action";

const props = defineProps<{ conversationId: string }>();
const emit = defineEmits<{ evidence: [messageId: string] }>();
const client = useQueryClient(); const selected = ref<ActionCode>("NO_ACTION"); const reviewer = ref("");
const actionQuery = useQuery({ queryKey: computed(() => actionKeys.detail(props.conversationId)), queryFn: ({ signal }) => getAction(props.conversationId, signal), retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 1, refetchInterval: (query) => ["queued", "processing"].includes(query.state.data?.status ?? "") ? 1000 : false });
const labelsQuery = useQuery({ queryKey: computed(() => actionKeys.label(props.conversationId)), queryFn: ({ signal }) => getLabels(props.conversationId, signal) });
const label = computed(() => labelsQuery.data.value?.[0]);
watch(label, (value) => { if (value) selected.value = value.verified_action ?? value.proposed_action; }, { immediate: true });
const request = useMutation({ mutationFn: () => classify(props.conversationId, Boolean(actionQuery.data.value)), onSuccess: async () => { await client.invalidateQueries({ queryKey: actionKeys.detail(props.conversationId) }); } });
const verify = useMutation({ mutationFn: () => verifyLabel(label.value!.label_id, selected.value, reviewer.value.trim()), onSuccess: async () => { await client.invalidateQueries({ queryKey: actionKeys.label(props.conversationId) }); } });
const pending = computed(() => request.isPending.value || ["queued", "processing"].includes(actionQuery.data.value?.status ?? ""));
</script>

<template>
  <section class="rounded-[1.75rem] bg-white p-5 sm:p-7" aria-labelledby="recommended-action-title">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-primary">Recommended follow-up</p>
        <h2 id="recommended-action-title" class="mt-2 text-xl font-bold text-ink">
          {{ actionQuery.data.value?.final_action ? ACTION_LABELS[actionQuery.data.value.final_action] : pending ? "Classification pending" : "Not classified" }}
        </h2>
        <p v-if="actionQuery.data.value?.local_rule_prediction?.explanation" class="mt-2 max-w-3xl text-sm leading-6 text-muted">{{ actionQuery.data.value.local_rule_prediction.explanation }}</p>
      </div>
      <button type="button" class="button-primary" :disabled="pending" @click="request.mutate()"><RefreshCw :size="16" :class="{ 'animate-spin': pending }" /> {{ actionQuery.data.value ? "Reclassify" : "Classify" }}</button>
    </div>
    <div v-if="actionQuery.data.value?.final_action" class="mt-5 flex flex-wrap gap-2 text-xs">
      <span class="rounded-full bg-primary-soft px-3 py-1.5 font-semibold text-primary">{{ actionQuery.data.value.classification_source === "tabpfn" ? "TabPFN" : "Rules" }}</span>
      <span v-if="actionQuery.data.value.model_confidence !== null" class="rounded-full bg-surface px-3 py-1.5 text-muted">{{ Math.round(actionQuery.data.value.model_confidence * 100) }}% confidence</span>
      <span class="rounded-full bg-surface px-3 py-1.5 capitalize text-muted">{{ actionQuery.data.value.status }}</span>
    </div>
    <div v-if="actionQuery.data.value?.override_reason" class="mt-4 flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><ShieldAlert :size="18" class="shrink-0" />{{ actionQuery.data.value.override_reason }}</div>
    <div v-if="actionQuery.data.value?.evidence_message_ids?.length" class="mt-5">
      <p class="text-xs font-semibold uppercase text-muted">Supporting evidence</p>
      <div class="mt-2 flex flex-wrap gap-2"><button v-for="id in actionQuery.data.value.evidence_message_ids" :key="id" type="button" class="rounded-lg border border-line px-3 py-1.5 text-xs text-primary hover:bg-primary-soft" @click="emit('evidence', id)">{{ id }}</button></div>
    </div>
    <div v-if="label" class="mt-6 border-t border-line pt-5">
      <div class="flex items-center gap-2 text-sm font-semibold text-ink"><CheckCircle2 :size="18" /> Verify training label</div>
      <div class="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <select v-model="selected" class="min-h-11 rounded-xl border border-line bg-white px-3 text-sm"><option v-for="code in ACTION_CODES" :key="code" :value="code">{{ ACTION_LABELS[code] }}</option></select>
        <input v-model="reviewer" class="min-h-11 rounded-xl border border-line px-3 text-sm" placeholder="Reviewer name" />
        <button type="button" class="min-h-11 rounded-xl border border-primary px-4 text-sm font-semibold text-primary disabled:opacity-50" :disabled="!reviewer.trim() || verify.isPending.value" @click="verify.mutate()">{{ label.verification_status === "VERIFIED" ? "Update" : "Confirm" }}</button>
      </div>
    </div>
  </section>
</template>
