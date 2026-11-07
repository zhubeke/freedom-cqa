<script setup lang="ts">
import { ArrowLeft, MessageCircle, Phone } from "lucide-vue-next";
import type { ConversationDetail } from "../../shared/types/conversation";

defineProps<{ conversation: ConversationDetail }>();
defineEmits<{ back: [] }>();
</script>

<template>
  <header class="rounded-[1.75rem] bg-white px-5 py-5 sm:px-7 sm:py-6">
    <button type="button" class="mb-5 inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-muted transition hover:bg-surface hover:text-ink" @click="$emit('back')">
      <ArrowLeft :size="18" aria-hidden="true" />
      Back to Conversations
    </button>
    <div class="flex items-start gap-4">
      <div class="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
        <Phone v-if="conversation.normalized_channel === 'call'" :size="21" aria-hidden="true" />
        <MessageCircle v-else :size="21" aria-hidden="true" />
      </div>
      <div class="min-w-0">
        <p class="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Conversation</p>
        <h1 class="mt-1 break-all text-2xl font-bold tracking-[-0.02em] text-ink sm:text-3xl">{{ conversation.conversation_id }}</h1>
        <p class="mt-2 text-sm text-muted">
          {{ conversation.normalized_channel === "call" ? "Voice Call" : "Chat" }}
          <span aria-hidden="true"> · </span>{{ conversation.original_language }}
          <span aria-hidden="true"> · </span>{{ conversation.message_count }} messages
        </p>
      </div>
    </div>
  </header>
</template>
