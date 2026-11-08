<script setup lang="ts">
import { ArrowLeft, MessageCircle, Phone } from "lucide-vue-next";
import type { ConversationDetail } from "../../shared/types/conversation";

defineProps<{ conversation: ConversationDetail }>();
defineEmits<{ back: [] }>();
</script>

<template>
  <header class="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-white px-3 py-3 lg:min-h-16">
    <button type="button" class="inline-flex min-h-9 items-center gap-2 rounded-md px-2 text-sm font-semibold text-muted transition hover:bg-surface hover:text-ink" @click="$emit('back')">
      <ArrowLeft :size="18" aria-hidden="true" />
      <span class="sr-only">Back to previous page</span><span aria-hidden="true">Back</span>
    </button>
    <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
      <div class="hidden shrink-0 text-muted sm:block">
        <Phone v-if="conversation.normalized_channel === 'call'" :size="21" aria-hidden="true" />
        <MessageCircle v-else :size="21" aria-hidden="true" />
      </div>
      <div class="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 class="break-all text-lg font-bold tracking-tight text-ink">{{ conversation.conversation_id }}</h1>
        <p class="text-xs text-muted">
          {{ conversation.normalized_channel === "call" ? "Voice Call" : "Chat" }}
          <span aria-hidden="true"> · </span>{{ conversation.original_language }}
          <span aria-hidden="true"> · </span>{{ conversation.message_count }} messages
          <span aria-hidden="true"> · </span>{{ conversation.deleted_at ? 'Deleted' : conversation.archived_at ? 'Archived' : 'Active' }}
        </p>
      </div>
    </div>
    <slot name="actions" />
  </header>
</template>
