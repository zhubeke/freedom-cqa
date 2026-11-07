<script setup lang="ts">
import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { AlertTriangle, LoaderCircle, RefreshCw, Sparkles } from "lucide-vue-next";
import { ApiError } from "../../api/client";
import { extractMetadata, getMetadata, metadataKeys } from "../../api/metadata";
import type { ConversationDetail } from "../../shared/types/conversation";
import type { Signal } from "../../shared/types/metadata";
import { getSentiment, sentimentKeys } from "../../api/sentiment";

const props = defineProps<{ conversation: ConversationDetail }>();
const queryClient = useQueryClient();
const metadataQuery = useQuery({
  queryKey: computed(() => metadataKeys.detail(props.conversation.conversation_id, props.conversation.dataset_group_id)),
  queryFn: ({ signal }) => getMetadata(props.conversation.conversation_id, props.conversation.dataset_group_id, signal),
  retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  refetchInterval: (query) => query.state.data && [query.state.data.deterministic_status, query.state.data.semantic_status].some((status) => status === "pending" || status === "processing") ? 2500 : false
});
const sentimentQuery = useQuery({
  queryKey: computed(() => sentimentKeys.detail(props.conversation.conversation_id, props.conversation.dataset_group_id)),
  queryFn: ({ signal }) => getSentiment(props.conversation.conversation_id, props.conversation.dataset_group_id, signal),
  retry: false
});
const extractMutation = useMutation({
  mutationFn: () => extractMetadata(props.conversation.conversation_id, props.conversation.dataset_group_id),
  onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: metadataKeys.detail(props.conversation.conversation_id, props.conversation.dataset_group_id) }); }
});
const notExtracted = computed(() => metadataQuery.error.value instanceof ApiError && metadataQuery.error.value.status === 404);
const metadata = computed(() => metadataQuery.data.value);
const complianceSignals = computed(() => {
  const compliance = metadata.value?.semantic?.compliance;
  if (!compliance) return [];
  const candidates: Array<[string, Signal]> = [
    ["Identity verification required", compliance.identity_verification_required],
    ["Identity verification confirmed", compliance.identity_verification_confirmed],
    ["Potential sensitive disclosure", compliance.sensitive_information_disclosure],
    ["Potential severe violation", compliance.potential_severe_violation]
  ];
  return candidates.filter(([, signal]) => signal.value);
});
function seconds(value?: number | null): string { return value === null || value === undefined ? "Unavailable" : `${Math.round(value * 10) / 10} s`; }
function percent(value?: number): string { return value === undefined ? "Unavailable" : `${Math.round(value * 100)}%`; }
</script>

<template>
  <section class="overflow-hidden rounded-[1.75rem] bg-white" aria-labelledby="metadata-title">
    <div class="flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-5 sm:px-7">
      <div><h2 id="metadata-title" class="text-lg font-bold text-ink">Conversation metadata</h2><p class="mt-1 text-sm text-muted">Timing, intent, sentiment, resolution, and acoustic signals.</p></div>
      <button type="button" class="button-primary" :disabled="extractMutation.isPending.value" @click="extractMutation.mutate()"><LoaderCircle v-if="extractMutation.isPending.value" class="animate-spin" :size="17" /><Sparkles v-else :size="17" />Extract Metadata</button>
    </div>
    <div v-if="metadataQuery.isLoading.value" class="flex items-center justify-center gap-2 p-8 text-sm text-muted"><LoaderCircle class="animate-spin" :size="18" /> Loading metadata…</div>
    <div v-else-if="notExtracted" class="p-8 text-center text-sm text-muted">Metadata has not been extracted for this conversation.</div>
    <div v-else-if="metadataQuery.isError.value" class="p-6 text-center text-sm text-red-700" role="alert"><p>{{ metadataQuery.error.value?.message }}</p><button type="button" class="button-secondary mt-4" @click="metadataQuery.refetch()"><RefreshCw :size="16" /> Retry</button></div>
    <div v-else-if="metadata" class="space-y-6 p-5 sm:p-7">
      <div v-if="metadata.deterministic" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-2xl bg-surface p-4"><p class="text-xs font-bold uppercase text-muted">Duration</p><p class="mt-2 text-xl font-black">{{ seconds(metadata.deterministic.conversation.duration_seconds.value) }}</p></div>
        <div class="rounded-2xl bg-surface p-4"><p class="text-xs font-bold uppercase text-muted">Messages</p><p class="mt-2 text-xl font-black">{{ metadata.deterministic.conversation.total_message_count }}</p><p class="mt-1 text-xs text-muted">Client {{ metadata.deterministic.messages_and_turns.client_message_count }} · Operator {{ metadata.deterministic.messages_and_turns.operator_message_count }}</p></div>
        <div class="rounded-2xl bg-surface p-4"><p class="text-xs font-bold uppercase text-muted">Turns</p><p class="mt-2 text-xl font-black">{{ metadata.deterministic.messages_and_turns.client_turn_count }} / {{ metadata.deterministic.messages_and_turns.operator_turn_count }}</p><p class="mt-1 text-xs text-muted">Client / operator</p></div>
        <div class="rounded-2xl bg-surface p-4"><p class="text-xs font-bold uppercase text-muted">Response time</p><p class="mt-2 text-xl font-black">{{ seconds(metadata.deterministic.response_timing.average_operator_response_seconds.value) }}</p><p class="mt-1 text-xs text-muted">First {{ seconds(metadata.deterministic.response_timing.first_operator_response_seconds.value) }}</p></div>
      </div>
      <div v-if="metadata.semantic" class="grid gap-4 lg:grid-cols-3">
        <div v-if="metadata.semantic.customer_intent" class="rounded-2xl border border-line p-4"><p class="text-xs font-bold uppercase text-muted">Intent</p><p class="mt-2 font-bold">{{ metadata.semantic.customer_intent.primary_intent.label }}</p><p v-if="metadata.semantic.customer_intent.secondary_intents.length" class="mt-2 text-sm text-muted">Also: {{ metadata.semantic.customer_intent.secondary_intents.map(item => item.label).join(', ') }}</p></div>
        <div v-if="metadata.semantic.customer_sentiment?.overall" class="rounded-2xl border border-line p-4"><p class="text-xs font-bold uppercase text-muted">Sentiment</p><p class="mt-2 font-bold capitalize">{{ metadata.semantic.customer_sentiment.overall }}</p><p class="mt-2 text-sm text-muted">Score {{ metadata.semantic.customer_sentiment.score?.toFixed(2) ?? 'Unavailable' }}</p></div>
        <div v-if="metadata.semantic.resolution_and_follow_up" class="rounded-2xl border border-line p-4"><p class="text-xs font-bold uppercase text-muted">Resolution</p><p class="mt-2 font-bold">{{ metadata.semantic.resolution_and_follow_up.status.replaceAll('_', ' ') }}</p><p v-if="metadata.semantic.resolution_and_follow_up.future_action_committed.value" class="mt-2 text-sm text-muted">Follow-up commitment detected</p></div>
      </div>
      <div v-if="complianceSignals.length" class="rounded-2xl bg-amber-50 p-4 text-amber-900"><p class="flex items-center gap-2 font-bold"><AlertTriangle :size="18" /> Potential compliance signals</p><ul class="mt-2 list-disc pl-5 text-sm"><li v-for="[label, signal] in complianceSignals" :key="label">{{ label }} ({{ percent(signal.confidence) }} confidence)</li></ul><p class="mt-2 text-xs">Automated signals require human review.</p></div>
      <div v-if="metadata.semantic_status === 'failed'" class="rounded-2xl bg-red-50 p-4 text-sm text-red-800"><strong>Semantic extraction failed.</strong> Deterministic metadata remains available.<p v-if="metadata.errors.at(-1)" class="mt-1">{{ metadata.errors.at(-1)?.message }}</p></div>
      <div v-else-if="metadata.semantic_status === 'partial'" class="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900"><strong>Some AI metadata could not be validated.</strong> Valid fields are shown; invalid fields were not coerced.<p v-if="metadata.errors.at(-1)" class="mt-1">{{ metadata.errors.at(-1)?.message }}</p></div>
      <div class="rounded-2xl border border-line p-4"><p class="font-bold">Message sentiment</p><div v-if="sentimentQuery.data.value?.summary" class="mt-3 grid gap-2 text-sm sm:grid-cols-3"><p>Initial client: <span class="capitalize">{{ sentimentQuery.data.value.summary.initial_client_sentiment ?? 'Unavailable' }}</span></p><p>Final client: <span class="capitalize">{{ sentimentQuery.data.value.summary.final_client_sentiment ?? 'Unavailable' }}</span></p><p>Average: {{ sentimentQuery.data.value.summary.average_client_sentiment_score?.toFixed(2) ?? 'Unavailable' }}</p><p>Negative peaks: {{ sentimentQuery.data.value.summary.escalation_points.length }}</p><p>Potential recoveries: {{ sentimentQuery.data.value.summary.recovery_points.length }}</p><p>Status: <span class="capitalize">{{ sentimentQuery.data.value.status }}</span></p></div><p v-else class="mt-2 text-sm text-muted">Sentiment analysis: not available</p></div>
      <div v-if="conversation.has_audio" class="rounded-2xl border border-line p-4"><p class="font-bold">Audio metadata</p><p class="mt-2 text-sm text-muted">Acoustic diarization, speaker metrics, uncertainty, and analysis controls are shown in the Audio Intelligence panel.</p></div>
    </div>
  </section>
</template>

