<script setup lang="ts">
import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { getMetadata, metadataKeys } from "../../api/metadata";
import { getSentiment, sentimentKeys } from "../../api/sentiment";
import type { ConversationDetail } from "../../shared/types/conversation";

const props = defineProps<{ conversation: ConversationDetail }>();
const metadata = useQuery({
  queryKey: computed(() => metadataKeys.detail(props.conversation.conversation_id, props.conversation.dataset_group_id)),
  queryFn: ({ signal }) => getMetadata(props.conversation.conversation_id, props.conversation.dataset_group_id, signal),
  retry: false,
  refetchInterval: query => [query.state.data?.semantic_status, query.state.data?.deterministic_status].some(status => status === "pending" || status === "processing") ? 2500 : false
});
const sentiment = useQuery({
  queryKey: computed(() => sentimentKeys.detail(props.conversation.conversation_id, props.conversation.dataset_group_id)),
  queryFn: ({ signal }) => getSentiment(props.conversation.conversation_id, props.conversation.dataset_group_id, signal),
  retry: false,
  refetchInterval: query => ["queued", "processing"].includes(query.state.data?.status ?? "") ? 3000 : false
});
const intent = computed(() => metadata.data.value?.semantic?.customer_intent);
const resolution = computed(() => metadata.data.value?.semantic?.resolution_and_follow_up);
const trajectory = computed(() => sentiment.data.value?.summary);
const resolutionLabel = computed(() => resolution.value?.status.replaceAll("_", " ") ?? "Not available");
</script>

<template>
  <section class="rounded-md bg-white p-3" aria-labelledby="conversation-overview-title">
    <h3 id="conversation-overview-title" class="text-sm font-semibold text-ink">Conversation outcome</h3>
    <p v-if="metadata.isLoading.value || sentiment.isLoading.value" class="mt-2 text-xs text-muted">Loading outcome…</p>
    <dl v-else class="mt-3 grid gap-x-4 gap-y-3 text-xs sm:grid-cols-2">
      <div><dt class="text-muted">Customer request</dt><dd class="mt-1 font-medium text-ink">{{ intent?.primary_intent.label ?? 'Not available' }}</dd></div>
      <div><dt class="text-muted">Resolution</dt><dd class="mt-1 font-medium capitalize text-ink">{{ resolutionLabel }}</dd></div>
      <div><dt class="text-muted">Customer sentiment</dt><dd class="mt-1 font-medium capitalize text-ink">{{ trajectory?.initial_client_sentiment ?? 'Not available' }}<template v-if="trajectory?.final_client_sentiment"> → {{ trajectory.final_client_sentiment }}</template></dd></div>
      <div v-if="resolution?.callback_promised.value || resolution?.future_action_committed.value"><dt class="text-muted">Follow-up</dt><dd class="mt-1 font-medium text-ink">{{ resolution.callback_promised.value ? 'Callback promised' : 'Further action promised' }}</dd></div>
    </dl>
    <p v-if="metadata.isError.value || sentiment.isError.value || metadata.data.value?.semantic_status === 'partial' || metadata.data.value?.semantic_status === 'failed'" class="mt-3 text-xs text-muted">Some outcome details are unavailable. Check Advanced for analysis status.</p>
  </section>
</template>
