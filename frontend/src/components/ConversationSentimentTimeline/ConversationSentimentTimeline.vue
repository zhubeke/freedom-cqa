<script setup lang="ts">
import { computed, ref } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { LoaderCircle, Sparkles } from "lucide-vue-next";
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
</script>

<template>
  <section class="overflow-hidden rounded-[1.75rem] bg-white" aria-labelledby="sentiment-timeline-title">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-5 sm:px-7">
      <div><h2 id="sentiment-timeline-title" class="text-lg font-bold text-ink">Message sentiment timeline</h2><p class="mt-1 text-sm text-muted">Discrete classifications; client and operator emotion remain separate.</p></div>
      <div class="flex rounded-xl bg-surface p-1" aria-label="Sentiment speaker filter">
        <button v-for="value in (['client', 'operator', 'both'] as const)" :key="value" type="button" class="rounded-lg px-3 py-1.5 text-xs font-bold capitalize" :class="filter === value ? 'bg-white text-primary shadow-sm' : 'text-muted'" @click="filter = value">{{ value }}</button>
      </div>
    </div>
    <div v-if="query.isLoading.value" class="p-8 text-center text-sm text-muted">Loading sentiment analysis…</div>
    <div v-else-if="query.isError.value" class="p-8 text-center text-sm text-muted"><p>Sentiment analysis has not been run for this conversation.</p><button type="button" class="button-primary mt-4" :disabled="analyzeMutation.isPending.value" @click="analyzeMutation.mutate()"><LoaderCircle v-if="analyzeMutation.isPending.value" class="animate-spin" :size="17" /><Sparkles v-else :size="17" /> Analyze Sentiment</button></div>
    <div v-else-if="query.data.value?.status === 'queued' || query.data.value?.status === 'processing'" class="flex items-center justify-center gap-3 p-8 text-sm font-semibold text-muted"><LoaderCircle class="animate-spin text-primary" :size="19" /> {{ query.data.value.status === 'queued' ? 'Sentiment analysis queued…' : 'Analyzing message sentiment…' }}</div>
    <div v-else-if="query.data.value?.status === 'failed' && !points.length" class="p-8 text-center text-sm text-red-700"><p>Sentiment analysis failed. Existing conversation data was not changed.</p><button type="button" class="button-secondary mt-4" :disabled="analyzeMutation.isPending.value" @click="analyzeMutation.mutate()">Retry analysis</button></div>
    <div v-else-if="points.length" class="p-5 sm:p-7">
      <div v-if="query.data.value?.status === 'partial' || query.data.value?.status === 'failed'" class="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Analysis status: {{ query.data.value.status }}. {{ query.data.value.failed_batches.length }} batch(es) need retry.</div>
      <div class="relative ml-10 h-64 border-b border-l border-line" role="img" aria-label="Sentiment score from negative one to positive one over transcript time">
        <div v-for="tick in [-1, -0.5, 0, 0.5, 1]" :key="tick" class="absolute left-0 w-full border-t border-dashed border-line/70" :style="{ bottom: `${(tick + 1) * 50}%` }"><span class="absolute -left-9 -translate-y-1/2 text-[0.65rem] text-muted">{{ tick }}</span></div>
        <button v-for="point in points" :key="point.message_id" type="button" class="group absolute size-3 -translate-x-1/2 translate-y-1/2 border-2 border-white shadow transition hover:scale-150 focus:scale-150" :class="(escalations.has(point.message_id) || recoveries.has(point.message_id)) ? 'ring-2 ring-amber-400 ring-offset-1' : ''" :style="{ left: `${point.x / maxX * 100}%`, bottom: `${(point.sentiment_score + 1) * 50}%`, backgroundColor: color(point), borderRadius: shape(point) }" @click="emit('message', point.message_id)">
          <span class="sr-only">{{ point.speaker }} {{ point.sentiment }} at {{ point.timestamp }}. {{ point.evidence_text }}. Confidence {{ point.confidence }}, intensity {{ point.intensity }}</span>
          <span class="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-56 -translate-x-1/2 rounded-lg bg-ink p-2 text-left text-xs font-normal text-white group-hover:block">{{ point.evidence_text }}</span>
          <title>{{ point.speaker }} · {{ point.sentiment }} · score {{ point.sentiment_score.toFixed(2) }} · confidence {{ point.confidence.toFixed(2) }} · intensity {{ point.intensity.toFixed(2) }} · {{ point.evidence_text }}</title>
        </button>
      </div>
      <div class="mt-4 flex flex-wrap gap-3 text-xs text-muted"><span>● Client</span><span>■ Operator</span><span class="text-green-700">Positive</span><span class="text-red-700">Negative</span><span class="text-amber-700">Mixed</span><span class="text-violet-700">Uncertain</span></div>
    </div>
    <div v-else class="p-8 text-center text-sm text-muted">No validated human-message classifications are available.</div>
  </section>
</template>
