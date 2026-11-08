<script setup lang="ts">
import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { LoaderCircle, RefreshCw } from "lucide-vue-next";
import { ApiError } from "../../api/client";
import { extractMetadata, getMetadata, metadataKeys } from "../../api/metadata";
import { getSentiment, sentimentKeys } from "../../api/sentiment";
import type { ConversationDetail } from "../../shared/types/conversation";
import type { Signal } from "../../shared/types/metadata";

const props = defineProps<{ conversation: ConversationDetail }>();
const emit = defineEmits<{ evidence: [messageId: string] }>();
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
  retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  refetchInterval: (query) => ["queued", "processing"].includes(query.state.data?.status ?? "") ? 2500 : false
});
const extractMutation = useMutation({
  mutationFn: () => extractMetadata(props.conversation.conversation_id, props.conversation.dataset_group_id),
  onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: metadataKeys.detail(props.conversation.conversation_id, props.conversation.dataset_group_id) }); }
});
const notExtracted = computed(() => metadataQuery.error.value instanceof ApiError && metadataQuery.error.value.status === 404);
const sentimentMissing = computed(() => sentimentQuery.error.value instanceof ApiError && sentimentQuery.error.value.status === 404);
const metadata = computed(() => metadataQuery.data.value);
const processing = computed(() => [metadata.value?.deterministic_status, metadata.value?.semantic_status].some((status) => status === "pending" || status === "processing"));
const intents = computed(() => {
  const customer = metadata.value?.semantic?.customer_intent;
  return customer ? [{ ...customer.primary_intent, kind: "Primary" }, ...customer.secondary_intents.map((intent) => ({ ...intent, kind: "Secondary" }))] : [];
});
const signalGroups = computed(() => {
  const resolution = metadata.value?.semantic?.resolution_and_follow_up;
  const compliance = metadata.value?.semantic?.compliance;
  const groups: Array<{ title: string; signals: Array<{ label: string; signal: Signal }> }> = [];
  if (resolution) groups.push({ title: "Resolution and follow-up", signals: [
    { label: "Callback promised", signal: resolution.callback_promised },
    { label: "Future action committed", signal: resolution.future_action_committed },
    { label: "Further investigation needed", signal: resolution.further_investigation_needed },
    { label: "Issue still open", signal: resolution.issue_open },
    { label: "Escalation required", signal: resolution.escalation_required }
  ] });
  if (compliance) groups.push({ title: "Compliance", signals: [
    { label: "Identity verification required", signal: compliance.identity_verification_required },
    { label: "Identity verification confirmed", signal: compliance.identity_verification_confirmed },
    { label: "Sensitive information disclosed", signal: compliance.sensitive_information_disclosure },
    { label: "Possible severe violation", signal: compliance.potential_severe_violation }
  ] });
  return groups;
});
const timingMetrics = computed(() => {
  const data = metadata.value?.deterministic;
  return data ? [
    { label: "Conversation duration", metric: data.conversation.duration_seconds },
    { label: "First operator response", metric: data.response_timing.first_operator_response_seconds },
    { label: "Average operator response", metric: data.response_timing.average_operator_response_seconds },
    { label: "First response after handoff", metric: data.response_timing.first_operator_response_after_handoff_seconds }
  ] : [];
});
const countMetrics = computed(() => {
  const data = metadata.value?.deterministic;
  return data ? [
    ["Total messages", data.conversation.total_message_count],
    ["Client messages", data.messages_and_turns.client_message_count],
    ["Operator messages", data.messages_and_turns.operator_message_count],
    ["Bot messages", data.messages_and_turns.bot_message_count],
    ["System messages", data.messages_and_turns.system_message_count],
    ["Client turns", data.messages_and_turns.client_turn_count],
    ["Operator turns", data.messages_and_turns.operator_turn_count],
    ["Human handoffs", data.messages_and_turns.human_handoff_count]
  ] : [];
});
const sentimentMetrics = computed(() => {
  const summary = sentimentQuery.data.value?.summary;
  return summary ? [
    ["Initial client sentiment", summary.initial_client_sentiment ?? "Unavailable"],
    ["Final client sentiment", summary.final_client_sentiment ?? "Unavailable"],
    ["Average client score", number(summary.average_client_sentiment_score)],
    ["Lowest client score", number(summary.minimum_client_sentiment_score)],
    ["Highest client score", number(summary.maximum_client_sentiment_score)],
    ["Strongest negative intensity", number(summary.maximum_negative_emotional_intensity)],
    ["Negative client messages", summary.negative_client_message_count],
    ["Positive client messages", summary.positive_client_message_count],
    ["Sentiment changes", summary.sentiment_transition_count],
    ["Largest negative change", number(summary.largest_negative_sentiment_change)],
    ["Largest positive change", number(summary.largest_positive_sentiment_change)],
    ["Operator messages analyzed", summary.operator_summary.message_count],
    ["Average operator score", number(summary.operator_summary.average_score)]
  ] : [];
});
const positions = computed(() => new Map(props.conversation.transcript.map((message, index) => [message.message_id, index + 1])));
const storedResult = computed(() => JSON.stringify({ metadata: metadata.value, sentiment: sentimentQuery.data.value ?? null }, null, 2));
function seconds(value?: number | null): string { return value == null ? "Unavailable" : `${Math.round(value * 10) / 10} s`; }
function percent(value?: number): string { return value === undefined ? "Unavailable" : `${Math.round(value * 100)}%`; }
function number(value?: number | null): string { return value == null ? "Unavailable" : value.toFixed(2); }
function label(value: string): string { return value.replaceAll("_", " "); }
function evidenceLabel(id: string): string { return positions.value.has(id) ? `Message ${positions.value.get(id)}` : "View message"; }
</script>

<template>
  <section class="overflow-hidden rounded-lg bg-white" aria-labelledby="metadata-title">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
      <div><h2 id="metadata-title" class="text-base font-semibold">Conversation details</h2><p class="mt-1 text-sm text-muted">Timing, customer needs, resolution and compliance.</p></div>
      <button type="button" class="button-secondary !min-h-9 !rounded-md !text-xs" :disabled="extractMutation.isPending.value || processing" @click="extractMutation.mutate()"><LoaderCircle v-if="extractMutation.isPending.value || processing" class="animate-spin" :size="15" /><RefreshCw v-else :size="15" />{{ processing ? 'Analyzing…' : metadata ? 'Run again' : 'Analyze details' }}</button>
    </div>
    <p v-if="extractMutation.error.value" class="m-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">Could not start analysis: {{ extractMutation.error.value.message }}</p>
    <div v-if="metadataQuery.isLoading.value" class="flex items-center justify-center gap-2 p-6 text-sm text-muted" role="status"><LoaderCircle class="animate-spin" :size="17" />Loading details…</div>
    <div v-else-if="notExtracted" class="p-6 text-sm text-muted">Conversation details have not been analyzed yet.</div>
    <div v-else-if="metadataQuery.isError.value && !metadata" class="p-4 text-sm text-red-700" role="alert"><p>Could not load conversation details. {{ metadataQuery.error.value?.message }}</p><button type="button" class="button-secondary mt-3" @click="metadataQuery.refetch()">Try again</button></div>
    <div v-if="metadata" class="space-y-5 p-4 text-sm">
      <div v-if="metadataQuery.isError.value" class="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900" role="alert">Could not refresh details. Showing the last loaded result. <button type="button" class="underline" @click="metadataQuery.refetch()">Try again</button></div>
      <div class="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted"><span>Timing and counts: <span class="capitalize text-ink">{{ label(metadata.deterministic_status) }}</span></span><span>Content analysis: <span class="capitalize text-ink">{{ label(metadata.semantic_status) }}</span></span><span>Audio: <span class="capitalize text-ink">{{ label(metadata.audio_status) }}</span></span></div>
      <p v-if="processing" class="flex items-center gap-2 text-muted" role="status"><LoaderCircle :size="15" class="animate-spin" />Analysis is running. Results update as they arrive.</p>
      <div v-if="metadata.errors.length" class="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900"><h3 class="font-semibold">Analysis notes</h3><ul class="mt-1 space-y-1"><li v-for="(error, index) in metadata.errors" :key="index"><span class="capitalize">{{ label(error.stage) }}</span>: {{ error.message }}</li></ul></div>
      <p v-if="metadata.semantic_status === 'partial'" class="text-amber-800">Some content analysis is incomplete. Only validated results are shown below.</p>
      <p v-else-if="metadata.semantic_status === 'failed'" class="text-red-800">Content analysis failed. Any available timing and message counts are shown below.</p>
      <p v-if="metadata.deterministic_status === 'failed'" class="text-red-800">Timing and message-count analysis failed.</p>
      <section v-if="metadata.deterministic" class="rounded-md border border-line p-4">
        <h3 class="font-semibold">Timing and messages</h3>
        <dl class="mt-3 grid gap-x-5 gap-y-3 sm:grid-cols-2"><div v-for="item in timingMetrics" :key="item.label"><dt class="text-xs text-muted">{{ item.label }}</dt><dd class="mt-0.5 font-medium tabular-nums">{{ seconds(item.metric.value) }}</dd><dd v-if="item.metric.reason" class="mt-0.5 text-xs text-muted">{{ label(item.metric.reason) }}</dd></div><div v-for="[name, value] in countMetrics" :key="name"><dt class="text-xs text-muted">{{ name }}</dt><dd class="mt-0.5 font-medium tabular-nums">{{ value }}</dd></div></dl>
        <div v-if="metadata.deterministic.conversation.operator_names?.length" class="mt-4 border-t border-line pt-3"><h4 class="text-xs text-muted">Operators</h4><ul class="mt-1 space-y-1"><li v-for="operator in metadata.deterministic.conversation.operator_names" :key="operator.name" class="flex flex-wrap items-center gap-2"><span>{{ operator.name }}</span><span class="text-xs text-muted">{{ operator.source === 'structured' ? 'From conversation record' : 'From transcript' }}</span><button v-if="operator.evidence_message_id" class="evidence-link" type="button" @click="emit('evidence', operator.evidence_message_id)">{{ evidenceLabel(operator.evidence_message_id) }}</button></li></ul></div>
      </section>
      <section v-if="metadata.semantic?.customer_intent" class="rounded-md border border-line p-4">
        <div class="flex flex-wrap items-baseline justify-between gap-2"><h3 class="font-semibold">Customer needs</h3><span class="text-xs text-muted">All needs resolved: <strong class="font-medium text-ink">{{ metadata.semantic.customer_intent.resolved ? 'Yes' : 'No' }}</strong></span></div>
        <ul class="mt-3 divide-y divide-line"><li v-for="(intent, index) in intents" :key="index" class="py-3 first:pt-0 last:pb-0"><div class="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h4 class="font-medium">{{ intent.label }}</h4><span class="text-xs text-muted">{{ intent.kind }} · {{ intent.resolved ? 'Resolved' : 'Unresolved' }} · {{ percent(intent.confidence) }} confidence</span></div><p v-if="intent.explanation" class="mt-1 leading-6 text-ink/80">{{ intent.explanation }}</p><div v-if="intent.evidence_message_ids.length" class="mt-2 flex flex-wrap gap-2"><button v-for="id in intent.evidence_message_ids" :key="id" type="button" class="evidence-link" @click="emit('evidence', id)">{{ evidenceLabel(id) }}</button></div></li></ul>
        <div class="mt-4 border-t border-line pt-3"><h4 class="font-medium">Unresolved questions</h4><ul v-if="metadata.semantic.customer_intent.unresolved_questions.length" class="mt-2 list-disc space-y-1 pl-5"><li v-for="(item, index) in metadata.semantic.customer_intent.unresolved_questions" :key="index">{{ item.question }}</li></ul><p v-else class="mt-1 text-muted">None identified.</p></div>
      </section>
      <section v-for="group in signalGroups" :key="group.title" class="rounded-md border border-line p-4">
        <div class="flex flex-wrap items-baseline justify-between gap-2"><h3 class="font-semibold">{{ group.title }}</h3><span v-if="group.title === 'Resolution and follow-up' && metadata.semantic?.resolution_and_follow_up" class="text-xs capitalize text-muted">{{ label(metadata.semantic.resolution_and_follow_up.status) }}</span></div>
        <p v-if="group.title === 'Compliance'" class="mt-1 text-xs text-muted">Check these findings against the conversation before making a decision.</p>
        <ul class="mt-3 divide-y divide-line"><li v-for="item in group.signals" :key="item.label" class="py-3 first:pt-0 last:pb-0"><div class="flex flex-wrap items-baseline justify-between gap-2"><h4 class="font-medium">{{ item.label }}</h4><span class="text-xs"><strong class="font-medium">{{ item.signal.value ? 'Yes' : 'No' }}</strong><span class="ml-2 text-muted">{{ percent(item.signal.confidence) }} confidence</span></span></div><p v-if="item.signal.explanation" class="mt-1 leading-6 text-ink/80">{{ item.signal.explanation }}</p><div v-if="item.signal.evidence_message_ids.length" class="mt-2 flex flex-wrap gap-2"><button v-for="id in item.signal.evidence_message_ids" :key="id" type="button" class="evidence-link" @click="emit('evidence', id)">{{ evidenceLabel(id) }}</button></div></li></ul>
      </section>
      <section class="rounded-md border border-line p-4">
        <h3 class="font-semibold">Sentiment summary</h3>
        <p v-if="metadata.semantic?.customer_sentiment" class="mt-2 text-muted">Overall customer sentiment: <span class="capitalize text-ink">{{ metadata.semantic.customer_sentiment.overall ?? 'Unavailable' }}</span> · Score {{ number(metadata.semantic.customer_sentiment.score) }}</p>
        <p v-if="sentimentQuery.isLoading.value" class="mt-2 text-muted">Loading message sentiment…</p>
        <p v-else-if="sentimentMissing" class="mt-2 text-muted">Message sentiment has not been analyzed yet.</p>
        <div v-else-if="sentimentQuery.isError.value" class="mt-2 text-red-700" role="alert">Could not load message sentiment. {{ sentimentQuery.error.value?.message }} <button class="underline" type="button" @click="sentimentQuery.refetch()">Try again</button></div>
        <template v-if="sentimentQuery.data.value">
          <p class="mt-2 text-xs text-muted">Message analysis: <span class="capitalize text-ink">{{ sentimentQuery.data.value.status }}</span><span v-if="sentimentQuery.data.value.summary"> · Summary: {{ sentimentQuery.data.value.summary.status }}</span></p>
          <dl v-if="sentimentMetrics.length" class="mt-3 grid gap-x-5 gap-y-3 sm:grid-cols-2"><div v-for="[name, value] in sentimentMetrics" :key="name"><dt class="text-xs text-muted">{{ name }}</dt><dd class="mt-0.5 capitalize tabular-nums">{{ value }}</dd></div></dl>
          <div v-if="sentimentQuery.data.value.summary" class="mt-4 border-t border-line pt-3"><p class="text-xs text-muted">Operator sentiment counts</p><p class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs"><span v-for="(count, category) in sentimentQuery.data.value.summary.operator_summary.category_counts" :key="category" class="capitalize">{{ category }}: {{ count }}</span></p><div v-for="[name, points] in [['Negative changes', sentimentQuery.data.value.summary.escalation_points], ['Recoveries', sentimentQuery.data.value.summary.recovery_points]] as const" :key="name" class="mt-3"><h4 class="text-xs text-muted">{{ name }} ({{ points.length }})</h4><div v-if="points.length" class="mt-1 flex flex-wrap gap-2"><button v-for="point in points" :key="point.message_id" type="button" class="evidence-link" @click="emit('evidence', point.message_id)">{{ evidenceLabel(point.message_id) }} · {{ point.change.toFixed(2) }}</button></div></div></div>
          <ul v-if="sentimentQuery.data.value.failed_batches.length" class="mt-3 space-y-1 text-xs text-red-800"><li v-for="batch in sentimentQuery.data.value.failed_batches" :key="batch.batch_index">Batch {{ batch.batch_index + 1 }} failed: {{ batch.error }}</li></ul>
          <p class="mt-3 text-xs text-muted">Open Sentiment for individual message scores and evidence.</p>
        </template>
      </section>
      <p v-if="conversation.has_audio" class="text-xs text-muted">Speaker metrics and audio analysis are available below.</p>
      <details class="rounded-md border border-line"><summary class="cursor-pointer px-4 py-3 text-xs font-medium">Stored analysis result</summary><p class="border-t border-line px-4 pt-3 text-xs text-muted">Extractor: {{ metadata.extractor_version }}</p><pre class="max-h-96 overflow-auto whitespace-pre-wrap break-all p-4 text-xs leading-5">{{ storedResult }}</pre></details>
    </div>
  </section>
</template>

<style scoped>
.evidence-link { display: inline-flex; min-height: 1.75rem; align-items: center; border: 1px solid var(--color-line); border-radius: .25rem; padding: .125rem .5rem; color: #475569; font-size: .75rem; }
.evidence-link:hover { background: var(--color-surface); color: var(--color-ink); }
</style>
