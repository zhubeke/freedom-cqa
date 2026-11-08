<script setup lang="ts">
import { Bot, Headphones, UserRound } from "lucide-vue-next";
import { computed } from "vue";
import type { TranscriptEntry } from "../../shared/types/conversation";

const props = defineProps<{ message: TranscriptEntry; highlighted?: boolean; voiceCall?: boolean }>();
const isOperator = computed(() => props.message.speaker === "operator");
const label = computed(() => ({ client: "Client", operator: "Operator", bot: "Bot", system: "System" })[props.message.speaker]);
const readableTimestamp = computed(() => {
  if (!props.voiceCall) return props.message.timestamp;
  if (props.message.elapsed_ms != null && props.message.elapsed_ms >= 0) {
    const seconds = Math.floor(props.message.elapsed_ms / 1000);
    return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  }
  const value = new Date(props.message.timestamp);
  if (Number.isNaN(value.getTime())) return props.message.timestamp;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" }).format(value);
});
</script>

<template>
  <article
    :id="message.message_id"
    :data-message-id="message.message_id"
    class="flex scroll-mt-28 transition duration-500"
    :class="isOperator ? 'justify-end' : 'justify-start'"
  >
    <div class="min-w-0 max-w-[94%] sm:max-w-[90%]">
      <div class="mb-1 flex items-center gap-1.5 px-1 text-xs font-medium" :class="isOperator ? 'justify-end text-slate-600' : 'text-muted'">
        <Bot v-if="message.speaker === 'bot'" :size="14" aria-hidden="true" />
        <UserRound v-else-if="message.speaker === 'client'" :size="14" aria-hidden="true" />
        <Headphones v-else :size="14" aria-hidden="true" />
        {{ label }}
        <span aria-hidden="true">·</span><time :datetime="message.timestamp" :title="message.timestamp" class="font-normal tabular-nums">{{ readableTimestamp }}</time>
      </div>
      <div
        class="rounded-lg px-3 py-2 ring-offset-2 transition-colors duration-200"
        :class="[
          isOperator ? 'rounded-br-sm bg-slate-100' : message.speaker === 'bot' ? 'rounded-bl-sm border border-line bg-white' : 'rounded-bl-sm bg-surface-strong',
          highlighted ? 'ring-3 ring-amber-300' : ''
        ]"
      >
        <p class="whitespace-pre-wrap break-words text-sm leading-[1.6] text-ink [overflow-wrap:anywhere]">{{ message.text }}</p>
      </div>
    </div>
  </article>
</template>
