<script setup lang="ts">
import { computed, nextTick, watch } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { AlertCircle, FileQuestion, RefreshCw } from "lucide-vue-next";
import { useRoute, useRouter } from "vue-router";
import { ApiError, apiGet } from "../../api/client";
import ConversationDetailHeader from "../../components/ConversationDetailHeader/ConversationDetailHeader.vue";
import ConversationDetailSkeleton from "../../components/ConversationDetailSkeleton/ConversationDetailSkeleton.vue";
import ConversationInfo from "../../components/ConversationInfo/ConversationInfo.vue";
import ConversationTranscript from "../../components/ConversationTranscript/ConversationTranscript.vue";
import type { ConversationDetail } from "../../shared/types/conversation";
import { useScrollToMessage } from "./composables/useScrollToMessage";

const route = useRoute();
const router = useRouter();
const conversationId = computed(() => String(route.params.id ?? ""));
const conversationQuery = useQuery({
  queryKey: computed(() => ["conversation", conversationId.value]),
  queryFn: ({ signal }) => apiGet<ConversationDetail>(`/v1/conversations/${encodeURIComponent(conversationId.value)}`, signal),
  retry: (failureCount, error) => !(error instanceof ApiError && error.status === 404) && failureCount < 2
});
const isNotFound = computed(() => conversationQuery.error.value instanceof ApiError && conversationQuery.error.value.status === 404);
const requestedMessage = computed(() => typeof route.query.message === "string" ? route.query.message : "");
const { highlightedMessageId, scrollToMessage } = useScrollToMessage();

watch([() => conversationQuery.data.value, requestedMessage], async ([conversation, messageId]) => {
  if (!conversation || !messageId) return;
  await nextTick();
  scrollToMessage(messageId);
}, { immediate: true });

function goBack(): void {
  const from = typeof route.query.from === "string" ? route.query.from : "";
  if (from.startsWith("/conversations") && !from.startsWith("/conversations/")) {
    void router.push(from);
  } else {
    void router.push({ name: "conversations" });
  }
}
</script>

<template>
  <ConversationDetailSkeleton v-if="conversationQuery.isLoading.value" />

  <section v-else-if="conversationQuery.isError.value" class="grid min-h-[32rem] place-items-center rounded-[1.75rem] bg-white px-6 py-14 text-center" role="alert">
    <div>
      <div class="mx-auto grid size-14 place-items-center rounded-2xl bg-primary-soft text-primary">
        <FileQuestion v-if="isNotFound" :size="28" aria-hidden="true" />
        <AlertCircle v-else :size="28" aria-hidden="true" />
      </div>
      <h1 class="mt-5 text-xl font-bold text-ink">{{ isNotFound ? "Conversation not found" : "Couldn’t load conversation" }}</h1>
      <p class="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
        {{ isNotFound ? `No conversation exists with ID ${conversationId}.` : "Check your connection and try again." }}
      </p>
      <div class="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" class="min-h-11 rounded-xl border border-line px-4 text-sm font-semibold text-ink hover:bg-surface" @click="goBack">Back to Conversations</button>
        <button v-if="!isNotFound" type="button" class="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover" @click="conversationQuery.refetch()">
          <RefreshCw :size="17" aria-hidden="true" /> Retry
        </button>
      </div>
    </div>
  </section>

  <div v-else-if="conversationQuery.data.value" class="space-y-6">
    <ConversationDetailHeader :conversation="conversationQuery.data.value" @back="goBack" />
    <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <ConversationInfo class="lg:col-start-2 lg:row-start-1" :conversation="conversationQuery.data.value" />
      <ConversationTranscript class="lg:col-start-1 lg:row-start-1" :conversation="conversationQuery.data.value" :highlighted-message-id="highlightedMessageId" />
    </div>
  </div>
</template>
