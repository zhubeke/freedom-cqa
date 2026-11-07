<script setup lang="ts">
import { MessageCircleOff } from "lucide-vue-next";
import type { ConversationDetail } from "../../shared/types/conversation";
import SystemEventMessage from "../SystemEventMessage/SystemEventMessage.vue";
import TranscriptMessage from "../TranscriptMessage/TranscriptMessage.vue";

defineProps<{ conversation: ConversationDetail; highlightedMessageId?: string | null }>();
</script>

<template>
  <section aria-labelledby="transcript-title" class="overflow-hidden rounded-[1.75rem] bg-white">
    <div class="border-b border-line px-5 py-5 sm:px-7">
      <h2 id="transcript-title" class="text-lg font-bold text-ink">Transcript</h2>
      <p class="mt-1 text-sm text-muted">Messages are shown in their original source order.</p>
    </div>
    <div v-if="conversation.transcript.length" class="space-y-5 p-4 sm:p-7">
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
