<script setup lang="ts">
import { AlertCircle, ChevronRight, Headphones, MessageCircle, Phone, RotateCw } from "lucide-vue-next";
import { useRoute } from "vue-router";
import ConversationEmptyState from "../ConversationEmptyState/ConversationEmptyState.vue";
import type { Conversation } from "../../shared/types/conversation";
import { ACTION_LABELS } from "../../shared/types/action";

withDefaults(
  defineProps<{
    conversations: Conversation[];
    hasActiveFilters?: boolean;
    loading?: boolean;
    error?: string | null;
    errorTitle?: string;
  }>(),
  {
    hasActiveFilters: false,
    loading: false,
    error: null,
    errorTitle: "Couldn’t load conversations"
  }
);
defineEmits<{ retry: []; import: []; clearFilters: [] }>();

const route = useRoute();
</script>

<template>
  <div aria-live="polite">
    <div v-if="loading" class="space-y-2 p-4 sm:p-6" aria-label="Loading conversations" aria-busy="true">
      <div v-for="item in 4" :key="item" class="flex animate-pulse items-center gap-4 rounded-2xl bg-surface/70 p-4">
        <div class="size-12 rounded-2xl bg-surface-strong" />
        <div class="flex-1 space-y-2">
          <div class="h-3 w-32 rounded bg-surface-strong" />
          <div class="h-3 w-48 max-w-full rounded bg-surface-strong" />
        </div>
        <div class="hidden h-3 w-20 rounded bg-surface-strong sm:block" />
      </div>
    </div>

    <div v-else-if="error" class="flex min-h-[22rem] flex-col items-center justify-center px-6 py-14 text-center" role="alert">
      <div class="grid size-14 place-items-center rounded-2xl bg-primary-soft text-primary">
        <AlertCircle :size="27" aria-hidden="true" />
      </div>
      <h2 class="mt-5 text-lg font-bold text-ink">{{ errorTitle }}</h2>
      <p class="mt-2 max-w-md text-sm leading-6 text-muted">{{ error }}</p>
      <button type="button" class="button-primary mt-5" @click="$emit('retry')"><RotateCw :size="16" /> Retry</button>
    </div>

    <ConversationEmptyState
      v-else-if="conversations.length === 0"
      :filtered="hasActiveFilters"
      @import="$emit('import')"
      @clear-filters="$emit('clearFilters')"
    />

    <ul v-else class="divide-y divide-line px-2 py-2 sm:px-3" aria-label="Conversations">
      <li v-for="(conversation, index) in conversations" :key="`${conversation.dataset_group_id}:${conversation.conversation_id}`">
        <p v-if="index === 0 || conversations[index - 1]?.recommended_action !== conversation.recommended_action" class="px-4 pb-1 pt-4 text-xs font-bold uppercase tracking-wide text-muted">
          {{ conversation.recommended_action ? ACTION_LABELS[conversation.recommended_action] : "Pending classification" }}
        </p>
        <RouterLink
          :to="{ name: 'conversation-detail', params: { id: conversation.conversation_id }, query: { from: route.fullPath } }"
          class="flex items-center gap-4 rounded-2xl px-3 py-4 transition-colors hover:bg-surface sm:px-4"
          :aria-label="`Open conversation ${conversation.conversation_id}`"
        >
          <div class="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
            <Phone v-if="conversation.channel === 'call'" :size="20" aria-hidden="true" />
            <MessageCircle v-else :size="20" aria-hidden="true" />
          </div>
          <div class="min-w-0 flex-1">
            <h2 class="truncate text-sm font-semibold text-ink">{{ conversation.conversation_id }}</h2>
            <p class="mt-1 truncate text-xs text-muted">
              {{ conversation.message_count }} messages
              <template v-if="conversation.duration_ms !== null"> · {{ Math.floor(conversation.duration_ms / 60000) }}m {{ Math.floor(conversation.duration_ms % 60000 / 1000) }}s</template>
            </p>
            <div class="mt-2 flex flex-wrap gap-2 text-[11px]">
              <span class="rounded-full bg-primary-soft px-2 py-1 font-semibold text-primary">{{ conversation.recommended_action ? ACTION_LABELS[conversation.recommended_action] : conversation.classification_status === 'pending' ? 'Classification pending' : conversation.classification_status }}</span>
              <span v-if="conversation.quality_score !== null" class="rounded-full bg-surface px-2 py-1 text-muted">Quality {{ Math.round(conversation.quality_score) }}</span>
              <span v-if="conversation.classification_source" class="rounded-full bg-surface px-2 py-1 text-muted">{{ conversation.classification_source === 'tabpfn' ? 'TabPFN' : 'Rules' }}</span>
            </div>
          </div>
          <div class="hidden text-right text-xs text-muted sm:block">
            <p class="font-medium uppercase">{{ conversation.language }}</p>
            <p class="mt-1 capitalize">{{ conversation.channel }}</p>
          </div>
          <Headphones v-if="conversation.channel === 'call' && conversation.has_audio" class="shrink-0 text-muted" :size="18" aria-label="Audio available" />
          <ChevronRight class="shrink-0 text-muted" :size="18" aria-hidden="true" />
        </RouterLink>
      </li>
    </ul>
  </div>
</template>
