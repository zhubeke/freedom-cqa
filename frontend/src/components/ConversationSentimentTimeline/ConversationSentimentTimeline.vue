<script setup lang="ts">
import { computed, ref } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { ArrowUpRight, LoaderCircle, RotateCw } from "lucide-vue-next";
import { ApiError } from "../../api/client";
import { analyzeSentiment, getSentiment, sentimentKeys } from "../../api/sentiment";
import type { ConversationDetail } from "../../shared/types/conversation";
import type { MessageSentiment } from "../../shared/types/sentiment";

const props = defineProps<{ conversation: ConversationDetail }>();
const emit = defineEmits<{ message: [messageId: string] }>();
const queryClient = useQueryClient();
const filter = ref<"client" | "operator" | "both">("both");
const query = useQuery({
  queryKey: computed(() => sentimentKeys.detail(props.conversation.conversation_id, props.conversation.dataset_group_id)),
  queryFn: ({ signal }) => getSentiment(props.conversation.conversation_id, props.conversation.dataset_group_id, signal),
  retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  refetchInterval: (state) => ["queued", "processing"].includes(state.state.data?.status ?? "") ? 3000 : false
});
const analyzeMutation = useMutation({
  mutationFn: () => analyzeSentiment(props.conversation.conversation_id, props.conversation.dataset_group_id),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: sentimentKeys.detail(props.conversation.conversation_id, props.conversation.dataset_group_id) });
    await query.refetch();
  }
});
const missing = computed(() => query.error.value instanceof ApiError && query.error.value.status === 404);
const summary = computed(() => query.data.value?.summary);
const busy = computed(() => analyzeMutation.isPending.value || ["queued", "processing"].includes(query.data.value?.status ?? ""));
const positions = computed(() => new Map(props.conversation.transcript.map((item, index) => [item.message_id, { index, elapsed: item.elapsed_ms }])));
const points = computed(() => (query.data.value?.message_sentiments ?? []).filter((item) => filter.value === "both" || item.speaker === filter.value).map((item) => {
  const position = positions.value.get(item.message_id);
  return { ...item, x: position?.elapsed != null ? position.elapsed / 1000 : position?.index ?? 0 };
}).sort((a, b) => a.x - b.x));
const maxX = computed(() => Math.max(1, ...points.value.map((item) => item.x)));
const escalations = computed(() => new Set(query.data.value?.summary?.escalation_points.map((item) => item.message_id) ?? []));
const recoveries = computed(() => new Set(query.data.value?.summary?.recovery_points.map((item) => item.message_id) ?? []));
const color = (item: MessageSentiment) => ({ positive: "#16a34a", negative: "#dc2626", neutral: "#64748b", mixed: "#d97706", uncertain: "#8b5cf6" })[item.sentiment];
const shape = (item: MessageSentiment) => item.speaker === "client" ? "50%" : "2px";
const score = (value: number | null | undefined) => value == null ? "—" : value.toFixed(2);
const percent = (value: number | null | undefined) => value == null ? "—" : `${Math.round(value * 100)}%`;
const label = (value: string | null | undefined) => value ? value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ") : "Unknown";
function messageLabel(id: string) {
  const position = positions.value.get(id);
  return position ? `Message ${position.index + 1}` : id;
}
function timeLabel(item: MessageSentiment) {
  const elapsed = positions.value.get(item.message_id)?.elapsed;
  if (elapsed == null) return item.timestamp;
  const seconds = Math.floor(elapsed / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
const clientMetrics = computed(() => summary.value ? [
  { label: "At the start", value: label(summary.value.initial_client_sentiment) },
  { label: "At the end", value: label(summary.value.final_client_sentiment) },
  { label: "Average score", value: score(summary.value.average_client_sentiment_score) },
  { label: "Lowest score", value: score(summary.value.minimum_client_sentiment_score) },
  { label: "Highest score", value: score(summary.value.maximum_client_sentiment_score) },
  { label: "Strongest negative intensity", value: percent(summary.value.maximum_negative_emotional_intensity) },
  { label: "Negative messages", value: summary.value.negative_client_message_count },
  { label: "Positive messages", value: summary.value.positive_client_message_count },
  { label: "Sentiment changes", value: summary.value.sentiment_transition_count },
  { label: "Largest drop", value: score(summary.value.largest_negative_sentiment_change) },
  { label: "Largest improvement", value: score(summary.value.largest_positive_sentiment_change) }
] : []);
const turningPoints = computed(() => [
  { title: "Escalation points", items: summary.value?.escalation_points ?? [] },
  { title: "Recovery points", items: summary.value?.recovery_points ?? [] }
]);
</script>

<template>
  <section class="overflow-hidden rounded-lg border border-line bg-white" aria-labelledby="sentiment-timeline-title">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
      <div><h2 id="sentiment-timeline-title" class="font-semibold text-ink">Message sentiment</h2><p class="mt-1 text-xs text-muted">Sentiment scores and the messages behind them.</p></div>
      <button v-if="query.data.value" type="button" class="button-secondary" :disabled="busy" @click="analyzeMutation.mutate()">
        <LoaderCircle v-if="busy" class="animate-spin" :size="15" /><RotateCw v-else :size="15" /> Run again
      </button>
    </div>
    <p v-if="analyzeMutation.isError.value" role="alert" class="m-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{{ analyzeMutation.error.value?.message || 'Couldn’t start sentiment analysis. Try again.' }}</p>
    <div v-if="query.isLoading.value" class="flex items-center justify-center gap-2 p-8 text-sm text-muted" role="status"><LoaderCircle class="animate-spin" :size="17" /> Loading sentiment analysis…</div>
    <div v-else-if="query.isError.value && missing" class="p-8 text-center text-sm text-muted">
      <p>No sentiment analysis yet.</p>
      <button type="button" class="button-secondary mt-4" :disabled="busy" @click="analyzeMutation.mutate()"><LoaderCircle v-if="busy" class="animate-spin" :size="17" /> Analyze sentiment</button>
    </div>
    <div v-else-if="query.isError.value" class="p-8 text-center text-sm" role="alert">
      <p class="font-medium">Couldn’t load sentiment analysis</p><p class="mt-2 text-muted">{{ query.error.value?.message }}</p>
      <button type="button" class="button-secondary mt-4" :disabled="query.isFetching.value" @click="query.refetch()"><RotateCw :size="15" /> Try again</button>
    </div>
    <div v-else-if="query.data.value?.status === 'queued' || query.data.value?.status === 'processing'" class="flex items-center justify-center gap-3 p-8 text-sm text-muted" role="status"><LoaderCircle class="animate-spin" :size="18" /> {{ query.data.value.status === 'queued' ? 'Waiting to analyze sentiment…' : 'Analyzing message sentiment…' }}</div>
    <div v-else-if="query.data.value" class="space-y-6 p-4">
      <div v-if="query.data.value.status === 'partial' || query.data.value.status === 'failed'" class="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        <p>{{ query.data.value.message_sentiments.length ? 'Some messages could not be analyzed. Results below cover the messages that completed.' : 'Sentiment analysis could not be completed.' }}</p>
        <button type="button" class="mt-2 font-semibold underline underline-offset-4" :disabled="busy" @click="analyzeMutation.mutate()">Retry analysis</button>
      </div>

      <div v-if="summary" class="space-y-5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-semibold">Client sentiment</h3>
          <span v-if="summary.status !== 'completed'" class="rounded bg-surface px-2 py-1 text-xs text-muted">{{ summary.status === 'partial' ? 'Partial summary' : 'Summary unavailable' }}</span>
        </div>
        <dl class="grid grid-cols-2 gap-x-5 gap-y-4 rounded-md bg-surface/70 p-4 sm:grid-cols-3">
          <div v-for="metric in clientMetrics" :key="metric.label"><dt class="text-xs text-muted">{{ metric.label }}</dt><dd class="mt-1 text-sm font-semibold tabular-nums">{{ metric.value }}</dd></div>
        </dl>
        <div class="border-b border-line pb-5">
          <h3 class="text-sm font-semibold">Operator sentiment</h3>
          <p class="mt-2 text-sm text-muted">{{ summary.operator_summary.message_count }} messages · Average score <strong class="font-medium text-ink">{{ score(summary.operator_summary.average_score) }}</strong></p>
          <dl class="mt-3 flex flex-wrap gap-x-5 gap-y-2"><div v-for="(count, category) in summary.operator_summary.category_counts" :key="category" class="flex gap-2 text-xs"><dt class="text-muted">{{ label(category) }}</dt><dd class="font-medium tabular-nums">{{ count }}</dd></div></dl>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div v-for="group in turningPoints" :key="group.title">
            <h3 class="text-sm font-semibold">{{ group.title }}</h3>
            <p v-if="!group.items.length" class="mt-2 text-xs text-muted">None identified.</p>
            <ul v-else class="mt-2 space-y-3">
              <li v-for="point in group.items" :key="point.message_id" class="rounded-md border border-line p-3 text-xs">
                <div class="flex flex-wrap items-center gap-1.5">
                  <button class="font-medium text-ink underline underline-offset-2" @click="emit('message', point.previous_message_id)">{{ messageLabel(point.previous_message_id) }}</button>
                  <span class="text-muted">→</span>
                  <button class="font-medium text-ink underline underline-offset-2" @click="emit('message', point.message_id)">{{ messageLabel(point.message_id) }}</button>
                  <span class="ml-auto tabular-nums text-muted">{{ point.change > 0 ? '+' : '' }}{{ score(point.change) }}</span>
                </div>
                <div v-if="point.nearby_operator_message_ids.length" class="mt-2 flex flex-wrap gap-2 text-muted"><span>Nearby operator replies:</span><button v-for="id in point.nearby_operator_message_ids" :key="id" class="underline underline-offset-2" @click="emit('message', id)">{{ messageLabel(id) }}</button></div>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div>
        <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h3 class="text-sm font-semibold">Timeline and message details</h3>
          <div class="flex rounded-md border border-line bg-surface p-0.5" role="group" aria-label="Sentiment speaker filter">
            <button v-for="value in (['client', 'operator', 'both'] as const)" :key="value" type="button" class="min-h-8 rounded px-3 text-xs font-medium" :class="filter === value ? 'bg-white text-ink shadow-sm' : 'text-muted'" :aria-pressed="filter === value" @click="filter = value">{{ value === 'both' ? 'Both' : label(value) }}</button>
          </div>
        </div>
        <template v-if="points.length">
          <div class="relative mx-3 ml-10 h-52 border-b border-l border-line" role="group" aria-label="Sentiment timeline. Select a point to view its message in the transcript.">
            <div v-for="tick in [-1, -0.5, 0, 0.5, 1]" :key="tick" class="absolute left-0 w-full border-t border-dashed border-line/70" :style="{ bottom: (tick + 1) * 50 + '%' }"><span class="absolute -left-9 -translate-y-1/2 text-[0.65rem] text-muted">{{ tick }}</span></div>
            <button v-for="point in points" :key="point.message_id" type="button" class="group absolute size-3 -translate-x-1/2 translate-y-1/2 border-2 border-white shadow transition hover:scale-150 focus:scale-150" :class="(escalations.has(point.message_id) || recoveries.has(point.message_id)) ? 'ring-2 ring-amber-400 ring-offset-1' : ''" :style="{ left: point.x / maxX * 100 + '%', bottom: (point.sentiment_score + 1) * 50 + '%', backgroundColor: color(point), borderRadius: shape(point) }" @click="emit('message', point.message_id)">
              <span class="sr-only">{{ messageLabel(point.message_id) }}, {{ point.speaker }}, {{ point.sentiment }} at {{ timeLabel(point) }}. {{ point.evidence_text }}</span>
              <span class="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-48 -translate-x-1/2 rounded bg-ink p-2 text-left text-xs font-normal text-white group-hover:block group-focus:block">{{ point.evidence_text }}</span>
            </button>
          </div>
          <div class="mt-4 flex flex-wrap gap-3 text-xs text-muted"><span>● Client</span><span>■ Operator</span><span class="text-green-700">Positive</span><span class="text-red-700">Negative</span><span>Neutral</span><span class="text-amber-700">Mixed</span><span class="text-violet-700">Uncertain</span></div>
          <p class="mt-2 text-xs text-muted">Scores range from −1 (negative) to +1 (positive). Select a point or open a message below to review the evidence.</p>
          <div class="mt-5 divide-y divide-line border-y border-line">
            <details v-for="point in points" :key="point.message_id" class="group py-3">
              <summary class="cursor-pointer text-sm marker:text-muted">
                <span class="ml-1 inline-flex max-w-full flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span class="font-medium">{{ messageLabel(point.message_id) }}</span><span class="text-xs text-muted">{{ label(point.speaker) }} · {{ timeLabel(point) }}</span>
                  <span class="rounded bg-surface px-2 py-0.5 text-xs" :style="{ color: color(point) }">{{ label(point.sentiment) }}</span><span class="text-xs tabular-nums text-muted">{{ score(point.sentiment_score) }}</span>
                </span>
                <span class="mt-1 block pl-5 text-xs leading-relaxed text-muted">{{ point.evidence_text }}</span>
              </summary>
              <div class="space-y-3 pt-3 pl-5 text-sm">
                <p class="leading-relaxed">{{ point.explanation }}</p>
                <dl class="flex flex-wrap gap-x-5 gap-y-2 text-xs"><div class="flex gap-2"><dt class="text-muted">Score</dt><dd class="font-medium">{{ score(point.sentiment_score) }}</dd></div><div class="flex gap-2"><dt class="text-muted">Confidence</dt><dd class="font-medium">{{ percent(point.confidence) }}</dd></div><div class="flex gap-2"><dt class="text-muted">Intensity</dt><dd class="font-medium">{{ percent(point.intensity) }}</dd></div></dl>
                <div v-if="point.emotion_tags.length" class="flex flex-wrap gap-1.5"><span v-for="emotion in point.emotion_tags" :key="emotion" class="rounded border border-line px-2 py-1 text-xs text-muted">{{ label(emotion) }}</span></div>
                <button type="button" class="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-4" @click="emit('message', point.message_id)">View in transcript <ArrowUpRight :size="13" /></button>
                <div v-if="point.context_message_ids.length" class="flex flex-wrap gap-2 text-xs text-muted"><span>Context:</span><button v-for="id in point.context_message_ids" :key="id" class="underline underline-offset-2" @click="emit('message', id)">{{ messageLabel(id) }}</button></div>
                <p class="break-all text-[0.65rem] text-muted">{{ point.message_id }} · Analyzer {{ point.analyzer_version }}</p>
              </div>
            </details>
          </div>
        </template>
        <p v-else class="rounded-md bg-surface p-4 text-sm text-muted">{{ query.data.value.message_sentiments.length ? 'No messages for this speaker. Choose another filter.' : 'No message-level sentiment results are available.' }}</p>
      </div>

      <details v-if="query.data.value.failed_batches.length" class="rounded-md border border-line p-3 text-xs">
        <summary class="cursor-pointer font-medium">{{ query.data.value.failed_batches.length }} processing batches need attention</summary>
        <ul class="mt-3 space-y-3"><li v-for="batch in query.data.value.failed_batches" :key="batch.batch_index"><p class="font-medium">Batch {{ batch.batch_index + 1 }}</p><p class="mt-1 break-words leading-relaxed text-muted">{{ batch.error }}</p><div class="mt-2 flex flex-wrap gap-2"><button v-for="id in batch.target_message_ids" :key="id" class="text-muted underline underline-offset-2" @click="emit('message', id)">{{ messageLabel(id) }}</button></div></li></ul>
      </details>
      <p class="border-t border-line pt-3 text-[0.65rem] text-muted">Analysis {{ query.data.value.analyzer_version }}<template v-if="summary"> · Summary {{ summary.analyzer_version }}</template></p>
    </div>
  </section>
</template>
