<script setup lang="ts">
import { MessageCircleOff } from "lucide-vue-next";
import type { ConversationDetail } from "../../shared/types/conversation";
import SystemEventMessage from "../SystemEventMessage/SystemEventMessage.vue";
import TranscriptMessage from "../TranscriptMessage/TranscriptMessage.vue";

defineProps<{ conversation: ConversationDetail; highlightedMessageId?: string | null }>();
</script>

<template>
  <section aria-labelledby="transcript-title" class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-white">
    <div class="flex shrink-0 items-baseline justify-between gap-2 border-b border-line px-4 py-3">
      <h2 id="transcript-title" class="text-sm font-bold text-ink">Transcript</h2>
      <p class="text-xs text-muted">{{ conversation.transcript.length }} messages · Source order</p>
    </div>
    <div v-if="conversation.transcript.length" data-transcript-scroll class="min-h-0 space-y-3 p-3 sm:p-4 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain" tabindex="0" aria-label="Transcript messages">
      <template v-for="message in conversation.transcript" :key="message.message_id">
        <SystemEventMessage v-if="message.speaker === 'system'" :message="message" :highlighted="highlightedMessageId === message.message_id" />
        <TranscriptMessage v-else :message="message" :voice-call="conversation.normalized_channel === 'call'" :highlighted="highlightedMessageId === message.message_id" />
      </template>
    </div>
    <div v-else class="grid min-h-72 place-items-center p-8 text-center">
      <div>
        <MessageCircleOff class="mx-auto text-muted" :size="32" aria-hidden="true" />
        <h3 class="mt-4 font-bold text-ink">No transcript available</h3>
        <p class="mt-2 text-sm text-muted">This conversation does not contain any messages.</p>
      </div>
    </div>
  </section>
</template>
